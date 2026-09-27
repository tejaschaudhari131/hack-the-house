"""Download a bounded, reproducible existing-building context layer (no owner data).

Run with the pipeline requirements installed: python pipeline/build_context.py
Cached responses live in ignored data/raw/building_context. Remove that directory
to refresh. Heights are display estimates, never inputs to housing recommendations.
"""
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import shapely
from shapely.geometry import shape

from util import fetch_json, geojson_to_shape, shape_to_geojson

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'web/public/data'
CACHE = ROOT / 'pipeline/data/raw/building_context'
LAYER = 'https://mapservices.pasda.psu.edu/server/rest/services/pasda/AlleghenyCounty/MapServer/11'
ASSESSMENTS = '65855e14-549e-4992-b5be-d629afc676fa'
API = 'https://data.wprdc.org/api/3/action/datastore_search'


def cached(name, url, params):
    path = CACHE / f'{name}.json'
    if not path.exists():
        data = fetch_json(url, params, timeout=120)
        if data.get('error') or data.get('success') is False:
            raise RuntimeError(f'{name}: {data.get("error")}')
        path.write_text(json.dumps(data))
    return json.loads(path.read_text())


def height_for(stories, unambiguous):
    try:
        value = float(stories)
    except (TypeError, ValueError):
        value = 0
    if unambiguous and 1 <= value <= 60:
        return round(value * 3 + 1.5, 2), 'stories_estimate', value
    return 9, 'placeholder', None


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    metadata = cached('schema', LAYER, {'f': 'json'})
    districts = json.loads((PUBLIC / 'neighborhoods.geojson').read_text())['features']
    groups = {name: shapely.union_all([shape(f['geometry']) for f in districts if f['properties']['group'] == name]) for name in ['Hazelwood', 'Lawrenceville']}
    raw = {}
    for name, boundary in groups.items():
        envelope = ','.join(str(v) for v in boundary.bounds)
        ids = sorted(cached(f'{name}-ids', LAYER + '/query', {'f': 'json', 'where': '1=1', 'geometry': envelope, 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326, 'spatialRel': 'esriSpatialRelIntersects', 'returnIdsOnly': 'true'})['objectIds'])
        for i in range(0, len(ids), 100):
            batch = ids[i:i + 100]
            result = cached(f'{name}-100-{i}', LAYER + '/query', {'f': 'geojson', 'objectIds': ','.join(map(str, batch)), 'outFields': 'OBJECTID,outline_id,PIN,CLASS,USECODE,status', 'returnGeometry': 'true', 'outSR': 4326})
            returned = {f['properties']['OBJECTID'] for f in result['features']}
            if returned != set(batch):
                raise RuntimeError('Incomplete footprint response; refusing a partial release')
            raw.update({f['properties']['OBJECTID']: f for f in result['features']})
        print(f'{name}: {len(ids)} source footprints in bounding box', flush=True)

    parcels = json.loads((PUBLIC / 'parcels.geojson').read_text())['features']
    parcel_map = {f['properties']['pin']: f for f in parcels}
    parcel_shapes = {pin: shape(f['geometry']) for pin, f in parcel_map.items()}
    all_shapes, clean = [], []
    invalid = 0
    for feature in raw.values():
        geom = geojson_to_shape(feature['geometry'])
        if geom is None or geom.area == 0:
            invalid += 1
            continue
        clean.append((feature, geom)); all_shapes.append(geom)
    tree = shapely.STRtree(all_shapes)
    rows = {}
    pins = sorted({(f['properties'].get('PIN') or '').strip() for f, _ in clean} & parcel_map.keys())
    for i in range(0, len(pins), 50):
        batch = pins[i:i + 50]
        result = cached(f'stories-50-{i}', API, {'resource_id': ASSESSMENTS, 'fields': 'PARID,STORIES', 'filters': json.dumps({'PARID': batch}), 'limit': 10000})['result']
        if result['total'] != len(result['records']):
            raise RuntimeError('Incomplete story-count response')
        for record in result['records']:
            rows.setdefault(record['PARID'], []).append(record.get('STORIES'))
    print(f'Assessment stories: {len(rows)} matched parcel records', flush=True)

    features = []
    for feature, geom in clean:
        areas = [name for name, boundary in groups.items() if geom.intersects(boundary)]
        if not areas:
            continue
        p = feature['properties']; pin = (p.get('PIN') or '').strip()
        parcel = parcel_shapes.get(pin)
        verified = parcel is not None and geom.intersection(parcel).area / geom.area >= .8
        # A main-dwelling story count must not be assigned to every outbuilding.
        related = [int(i) for i in tree.query(parcel, predicate='intersects') if all_shapes[i].intersection(parcel).area / all_shapes[i].area > .5] if verified else []
        values = rows.get(pin, [])
        height, method, stories = height_for(values[0] if len(values) == 1 else None, verified and len(related) == 1)
        properties = {'id': str(p['OBJECTID']), 'source_id': p.get('outline_id'), 'pin': pin if verified else '', 'source_pin': pin, 'area': areas[0], 'height_m': height, 'height_method': method, 'stories': stories, 'class': p.get('CLASS'), 'status': p.get('status')}
        features.append({'type': 'Feature', 'id': properties['id'], 'properties': properties, 'geometry': shape_to_geojson(geom)})
    features.sort(key=lambda f: f['properties']['id'])
    output = PUBLIC / 'existing-buildings.geojson'
    output.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':')))
    manifest = {
        'retrieved_at': datetime.now(timezone.utc).isoformat(), 'source': LAYER, 'source_layer_name': metadata['name'],
        'assessment_source': API, 'assessment_resource': ASSESSMENTS, 'source_crs': metadata['extent']['spatialReference']['wkid'], 'output_crs': 4326,
        'count': len(features), 'by_area': dict(Counter(f['properties']['area'] for f in features)), 'height_methods': dict(Counter(f['properties']['height_method'] for f in features)),
        'invalid_geometry_omitted': invalid, 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'input_hashes': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(CACHE.glob('*.json'))},
        'input_retrieval_times': {p.name: datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).isoformat() for p in sorted(CACHE.glob('*.json'))},
        'height_formula': 'For one spatially verified footprint per parcel and one usable STORIES record: STORIES * 3 m + 1.5 m. Both conversion constants are assumptions. Otherwise a 9 m visual placeholder.',
        'limitations': ['Footprints are recorded roof outlines, not a complete verified current housing inventory. Nonresidential buildings are also shown.', 'Heights are estimates or placeholders, never surveyed heights. No lidar, roof shape or terrain elevation model.', 'Buildings intersecting a study boundary are retained whole. Parcel matches require 80% footprint overlap; source PINs remain available for audit.', 'No occupancy, housing unit count, demolition, acquisition, or development permission is inferred.', 'The source layer supplies no explicit license statement; attribution is retained and redistribution terms require clarification before external publication.'],
    }
    (PUBLIC / 'existing-buildings.sources.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({k: manifest[k] for k in ['count', 'by_area', 'height_methods', 'bytes', 'invalid_geometry_omitted']}, indent=2))


if __name__ == '__main__':
    main()
