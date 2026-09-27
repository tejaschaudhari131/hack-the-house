"""Download a bounded, reproducible existing-building context layer (no owner data).

Run with the pipeline requirements installed: python pipeline/build_context.py
Cached responses live in ignored data/raw/building_context. Remove that directory
to refresh. Heights are display estimates, never inputs to housing recommendations.
"""
import csv
import hashlib
import urllib.parse
import urllib.request
import json
import math
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import shapely
from shapely.geometry import shape

from data_io import parcel_features, write_gzip, PROCESSED
from util import cached_download, fetch_json, geojson_to_shape, shape_to_geojson
from height_estimates import PROFILES, footprint_role, residential_use, fallback_profile, residential_medians, osm_index, match_osm

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'web/public/data'
CACHE = ROOT / 'pipeline/data/raw/building_context'
LAYER = 'https://mapservices.pasda.psu.edu/server/rest/services/pasda/AlleghenyCounty/MapServer/11'
ASSESSMENTS = '65855e14-549e-4992-b5be-d629afc676fa'
API = 'https://data.wprdc.org/api/3/action/datastore_search'
OSM_API = 'https://api.openstreetmap.org/api/0.6/map.json'


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


def load_osm(groups):
    """Fetch height-bearing OSM ways/relations only, with complete geometry."""
    city = shapely.union_all(list(groups.values()))
    w, s, e, n = city.bounds
    bbox = f"{s-.001},{w-.001},{n+.001},{e+.001}"
    query = '[out:json][timeout:180];(' + ''.join(
        f'nwr["{building}"]["{height}"]({bbox});'
        for building in ['building', 'building:part'] for height in ['height', 'building:levels']
    ) + ');out geom;'
    path = CACHE / 'osm-citywide-heights.json'
    url = 'https://overpass-api.de/api/interpreter'
    if not path.exists():
        request = urllib.request.Request(url, data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': 'Playhouse educational planning prototype'})
        raw = json.loads(urllib.request.urlopen(request, timeout=240).read())
        if raw.get('remark') or 'elements' not in raw:
            raise RuntimeError('Incomplete OSM height response')
        path.write_text(json.dumps(raw))
    raw = json.loads(path.read_text())
    raw['provenance'] = {'source': url, 'query': query, 'osm_base_timestamp': raw.get('osm3s',{}).get('timestamp_osm_base'), 'height_tagged_elements': len(raw['elements']), 'license': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors', 'license_url': 'https://www.openstreetmap.org/copyright'}
    return raw


def download_footprints(groups):
    all_ids = set()
    for name, boundary in groups.items():
        envelope = ','.join(str(v) for v in boundary.bounds)
        key = 'city-ids-' + hashlib.sha256(envelope.encode()).hexdigest()[:16]
        ids = cached(key, LAYER + '/query', {'f': 'json', 'where': '1=1', 'geometry': envelope, 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326, 'spatialRel': 'esriSpatialRelIntersects', 'returnIdsOnly': 'true'}).get('objectIds')
        if ids is None:
            raise RuntimeError(f'Footprint IDs missing for {name}')
        all_ids.update(ids)
    raw = {}
    ids = sorted(all_ids)
    for i in range(0, len(ids), 500):
        batch = ids[i:i+500]
        identity = ','.join(map(str,batch))
        key = 'city-outlines-' + hashlib.sha256(identity.encode()).hexdigest()[:16]
        result = cached(key, LAYER + '/query', {'f': 'geojson', 'objectIds': identity, 'outFields': 'OBJECTID,outline_id,PIN,CLASS,USECODE,status', 'returnGeometry': 'true', 'outSR': 4326})
        if {f['properties']['OBJECTID'] for f in result.get('features',[])} != set(batch):
            raise RuntimeError('Incomplete footprint response; refusing a partial release')
        raw.update({f['properties']['OBJECTID']: f for f in result['features']})
        print(f'City footprint download: {len(raw)}/{len(ids)}', flush=True)
    return raw


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    metadata = cached('schema', LAYER, {'f': 'json'})
    districts = json.loads((PUBLIC / 'neighborhoods.geojson').read_text())['features']
    groups = {name: shapely.union_all([shape(f['geometry']) for f in districts if f['properties']['group'] == name]) for name in sorted({f['properties']['group'] for f in districts})}
    group_names = list(groups)
    group_tree = shapely.STRtree(list(groups.values()))
    raw = download_footprints(groups)

    parcels = list(parcel_features())
    parcel_map = {f['properties']['pin']: f for f in parcels}
    parcel_shapes = {pin: shape(f['geometry']) for pin, f in parcel_map.items()}
    parcel_pins = list(parcel_shapes)
    parcel_tree = shapely.STRtree(list(parcel_shapes.values()))
    all_shapes, clean = [], []
    invalid = 0
    retired = []
    for feature in raw.values():
        if (feature['properties'].get('status') or '').lower() == 'demolished':
            if len(group_tree.query(shape(feature['geometry']), predicate='intersects')):
                retired.append(str(feature['properties']['OBJECTID']))
            continue
        geom = geojson_to_shape(feature['geometry'])
        if geom is None or geom.area == 0:
            invalid += 1
            continue
        clean.append((feature, geom)); all_shapes.append(geom)
    tree = shapely.STRtree(all_shapes)
    # Local equal-scale area approximation is sufficient for footprint role thresholds.
    areas_m2 = [g.area * 111320 ** 2 * math.cos(math.radians(g.centroid.y)) for g in all_shapes]
    rows = {}
    story_path = CACHE / 'city-assessment-stories.csv'
    cached_download(f'https://data.wprdc.org/datastore/dump/{ASSESSMENTS}?fields=PARID,STORIES', story_path)
    with story_path.open(newline='', encoding='utf-8-sig') as handle:
        reader = csv.DictReader(handle)
        if not set(reader.fieldnames or []).issubset({'PARID', 'STORIES', '_id'}):
            raise RuntimeError('Unexpected assessment story fields')
        for record in reader:
            if record['PARID'] in parcel_map:
                rows.setdefault(record['PARID'], []).append(record.get('STORIES'))
    print(f'Assessment stories: {len(rows)} matched parcel records', flush=True)

    osm_raw = load_osm(groups)
    osm_records, osm_tree = osm_index(osm_raw)
    features = []
    for index, (feature, geom) in enumerate(clean):
        if index % 10000 == 0:
            print(f'Matching buildings {index}/{len(clean)}; retained {len(features)}', flush=True)
        areas = sorted(group_names[int(i)] for i in group_tree.query(geom, predicate='intersects'))
        if not areas:
            continue
        p = feature['properties']; source_pin = (p.get('PIN') or '').strip(); pin = source_pin
        parcel = parcel_shapes.get(pin)
        verified = parcel is not None and geom.intersection(parcel).area / geom.area >= .8
        parcel_match = 'source_pin' if verified else 'unmatched'
        if not verified:
            matches = [parcel_pins[int(i)] for i in parcel_tree.query(geom, predicate='intersects') if geom.intersection(parcel_shapes[parcel_pins[int(i)]]).area / geom.area >= .8]
            if len(matches) == 1:
                pin = matches[0]; parcel = parcel_shapes[pin]; verified = True; parcel_match = 'spatial'
        # A main-dwelling story count must not be assigned to every outbuilding.
        related = [int(i) for i in tree.query(parcel, predicate='intersects') if all_shapes[i].intersection(parcel).area / all_shapes[i].area > .5] if verified else []
        use = (parcel_map[pin]['properties'].get('land_use') or '') if verified else ''
        role = footprint_role(index, related, areas_m2, residential_use(use) or use.startswith('APART:'))
        values = rows.get(pin, [])
        height, method, stories = height_for(values[0] if len(values) == 1 else None, verified and role in {'sole', 'dominant'})
        properties = {'id': str(p['OBJECTID']), 'source_id': p.get('outline_id'), 'pin': pin if verified else '', 'source_pin': source_pin, 'parcel_match': parcel_match, 'footprint_role': role, 'area': areas[0], 'height_m': height, 'height_method': method, 'stories': stories, 'class': p.get('CLASS'), 'status': p.get('status')}
        hint = match_osm(geom, osm_records, osm_tree)
        if hint and (hint['height_method'] == 'osm_height' or method == 'placeholder'):
            properties.update(hint)
        if properties['height_method'] == 'placeholder':
            profile = fallback_profile(use, p.get('CLASS'), role, areas_m2[index])
            properties.update(height_m=PROFILES[profile][0], height_method='typology_estimate' if profile != 'unknown' else 'placeholder', height_profile=profile)
        features.append({'type': 'Feature', 'id': properties['id'], 'properties': properties, 'geometry': shape_to_geojson(geom)})
    medians = residential_medians(features)
    for f in features:
        p = f['properties']
        if p.get('height_profile') == 'residential' and p['area'] in medians:
            p['height_m'] = medians[p['area']]
    features.sort(key=lambda f: f['properties']['id'])
    output = PROCESSED / 'existing-buildings.geojson.gz'
    write_gzip(output, {'type': 'FeatureCollection', 'features': features})
    manifest = {
        'retrieved_at': datetime.now(timezone.utc).isoformat(), 'source': LAYER, 'source_layer_name': metadata['name'],
        'assessment_source': API, 'assessment_resource': ASSESSMENTS, 'source_crs': metadata['extent']['spatialReference']['wkid'], 'output_crs': 4326,
        'osm_height_source': osm_raw['provenance'],
        'count': len(features), 'by_area': dict(Counter(f['properties']['area'] for f in features)), 'height_methods': dict(Counter(f['properties']['height_method'] for f in features)),
        'encoding': 'gzip', 'invalid_geometry_omitted': invalid, 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
        'demolished_footprints_omitted': len(retired), 'demolished_ids_omitted': sorted(retired),
        'input_hashes': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(CACHE.glob('*.json'))},
        'input_retrieval_times': {p.name: datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).isoformat() for p in sorted(CACHE.glob('*.json'))},
        'height_formula': 'Prefer spatially matched OSM height; otherwise one assessment STORIES row on a sole or dominant footprint uses STORIES * 3 m + 1.5 m roof; otherwise OSM building:levels * 3 m + mapped roof:height, roof:levels * 3 m, or assumed 0.6 m flat / 1.5 m unspecified roof. Then use labelled typology priors, finally 9 m unknown placeholder. All metre-per-story and roof constants are assumptions.',
        'height_profiles': {key: {'height_m': value[0], 'description': value[1]} for key, value in PROFILES.items()},
        'residential_median_heights_m': medians,
        'matching_rules': {'parcel_footprint_coverage': .8, 'dominant_to_second_area_ratio': 1.8, 'dominant_share_of_building_area': .6, 'auxiliary_max_m2': 80, 'auxiliary_max_main_area_ratio': .35, 'osm_footprint_coverage': .65, 'osm_reverse_coverage': .5, 'osm_part_coverage': .8},
        'limitations': ['Footprints are recorded roof outlines, not a complete verified current housing inventory. Nonresidential buildings are also shown.', 'Display heights support approximate relative massing, not measured heights, exact relative ordering or regulatory feasibility. No lidar, roof mesh or terrain elevation model.', 'Buildings intersecting the city boundary are retained whole. Parcel matches require 80% footprint overlap; a unique spatial match can recover a missing/stale source PIN. Source PINs remain available for audit.', 'Dominant-building and auxiliary roles are footprint-based assumptions, not verified building uses. Ambiguous groups do not inherit assessment stories.', 'Apartment unit bands describe a parcel, not floor counts. Their illustrative priors apply only above 200 / 150 / 100 square metres for large / medium / small apartment footprints. Residential priors use the planning-area median of at least 20 usable residential source heights, otherwise 7.5 m.', 'No occupancy, housing unit count, demolition, acquisition, or development permission is inferred. Visual heights never enter recommendation scores or collision tests.', 'OSM height/level tags are contributor records with varying dates and accuracy; neither implies a survey. County outlines are retained, including complex footprints that can only show one extrusion height.', 'The County source layer supplies no explicit license statement; attribution is retained and redistribution terms require clarification before external publication. OSM-derived height attributes are © OpenStreetMap contributors, ODbL 1.0.'],
    }
    (PUBLIC / 'existing-buildings.sources.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({k: manifest[k] for k in ['count', 'by_area', 'height_methods', 'bytes', 'invalid_geometry_omitted']}, indent=2))


if __name__ == '__main__':
    main()
