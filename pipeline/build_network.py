"""Bounded OSM walking graph and mapped-park access points. No live routing service.

python pipeline/build_network.py (requires the existing pipeline requirements).
Remove the citywide aggregate and its tile caches under data/raw/walking_network to refresh the extract.
"""
import hashlib
import json
import math
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from data_io import write_gzip, PROCESSED
import shapely
from shapely.geometry import Point, Polygon

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'web/public/data'
CACHE = ROOT / 'pipeline/data/raw/walking_network/osm-citywide.json'
URL = 'https://overpass-api.de/api/interpreter'
def city_bbox():
    from build_dataset import load_neighborhoods
    city = shapely.union_all([n['geom'] for n in load_neighborhoods(False)])
    west, south, east, north = city.bounds
    # Buffer outer city edges so local walks can leave/re-enter Pittsburgh.
    return (south-.03, west-.04, north+.03, east+.04)

HIGHWAYS = {'residential', 'living_street', 'unclassified', 'tertiary', 'tertiary_link', 'secondary', 'secondary_link', 'primary', 'primary_link', 'service', 'pedestrian', 'footway', 'path', 'steps', 'track', 'cycleway'}
YES = {'yes', 'designated', 'permissive'}


def walkable(tags):
    if tags.get('highway') not in HIGHWAYS or tags.get('area') == 'yes':
        return False
    if tags.get('foot') in {'no', 'private', 'use_sidepath', 'customers', 'destination'}:
        return False
    if tags.get('access') in {'no', 'private', 'customers', 'destination'} and tags.get('foot') not in YES:
        return False
    if tags.get('highway') == 'cycleway' and tags.get('foot') not in YES:
        return False
    if tags.get('foot:conditional') or tags.get('access:conditional'):
        return False  # Time-dependent access is outside this screen.
    return True


def blocked_node(tags):
    if tags.get('foot') in {'no', 'private'} or tags.get('access') in {'no', 'private'} and tags.get('foot') not in YES:
        return True
    return bool(tags.get('barrier') and tags.get('barrier') not in {'bollard', 'cycle_barrier', 'entrance', 'kerb', 'cattle_grid', 'toll_booth'} and tags.get('foot') not in YES)


def metres(a, b):
    return math.hypot((a[0] - b[0]) * 111320 * math.cos(math.radians((a[1] + b[1]) / 2)), (a[1] - b[1]) * 111320)


def main():
    south, west, north, east = city_bbox()
    boxes = [(south+(north-south)*y/3, west+(east-west)*x/3,
              south+(north-south)*(y+1)/3, west+(east-west)*(x+1)/3)
             for y in range(3) for x in range(3)]
    queries = ['[out:json][timeout:90];(' + ''.join(
        f'way[{tag}]({",".join(map(str,bbox))});' for tag in ['highway','leisure=park']
    ) + ');(._;>;);out body;' for bbox in boxes]
    query = queries
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        elements, timestamps = {}, []
        for index, statement in enumerate(queries):
            tile = CACHE.parent / ('city-tile-' + hashlib.sha256(statement.encode()).hexdigest()[:16] + '.json')
            if not tile.exists():
                for attempt in range(3):
                    try:
                        request = urllib.request.Request(URL, data=urllib.parse.urlencode({'data':statement}).encode(), headers={'User-Agent':'Playhouse educational planning prototype','Accept':'application/json'})
                        data = json.loads(urllib.request.urlopen(request, timeout=150).read())
                        if data.get('remark') or 'elements' not in data:
                            raise RuntimeError('Incomplete Overpass tile')
                        tile.write_text(json.dumps(data))
                        break
                    except Exception:
                        if attempt == 2: raise
                        time.sleep(5*(attempt+1))
            data = json.loads(tile.read_text())
            timestamps.append(data.get('osm3s',{}).get('timestamp_osm_base'))
            for element in data['elements']:
                elements[(element['type'],element['id'])] = element
            print(f'Walking tile {index+1}/{len(queries)}: {len(elements)} unique elements',flush=True)
        CACHE.write_text(json.dumps({'elements':list(elements.values()),'osm3s':{'timestamp_osm_base':max(t for t in timestamps if t)},'tile_timestamps':timestamps}))
    raw = json.loads(CACHE.read_text())
    if raw.get('remark'):
        raise RuntimeError('Overpass returned an incomplete response: ' + raw['remark'])
    nodes = {e['id']: e for e in raw['elements'] if e['type'] == 'node'}
    ways = [e for e in raw['elements'] if e['type'] == 'way' and walkable(e.get('tags', {}))]
    points, ids, ground, edges, display = [], {}, [], [], []
    def intern(id_, at_ground):
        if id_ not in ids:
            ids[id_] = len(points); n = nodes[id_]
            points.append([round(n['lon'], 6), round(n['lat'], 6)]); ground.append(0)
        index = ids[id_]
        if at_ground:
            ground[index] = 1
        return index
    for way in ways:
        tags = way.get('tags', {})
        at_ground = tags.get('layer', '0') == '0' and tags.get('bridge', 'no') == 'no' and tags.get('tunnel', 'no') == 'no'
        path = way['nodes']
        speed = 40 if tags['highway'] == 'steps' else 80
        for a, b in zip(path, path[1:]):
            if a not in nodes or b not in nodes or blocked_node(nodes[a].get('tags', {})) or blocked_node(nodes[b].get('tags', {})):
                continue
            ai, bi = intern(a, at_ground), intern(b, at_ground)
            distance = metres(points[ai], points[bi])
            if distance > 0:
                edges.append([ai, bi, round(distance / speed, 5), int(at_ground)])
                # Walking oneway tags only; motor-vehicle one-way is not inherited.
                if tags.get('oneway:foot') not in {'yes', '1'}:
                    edges.append([bi, ai, round(distance / speed, 5), int(at_ground)])
                if tags.get('oneway:foot') == '-1':
                    edges.pop(-2)
                display.append({'type': 'Feature', 'properties': {'steps': speed == 40}, 'geometry': {'type': 'LineString', 'coordinates': [points[ai], points[bi]]}})
    point_shapes = [Point(p) for p in points]
    tree = shapely.STRtree(point_shapes)
    parks, skipped = [], 0
    for way in raw['elements']:
        tags = way.get('tags', {})
        if way['type'] != 'way' or tags.get('leisure') != 'park' or tags.get('access') in {'private', 'no', 'customers'}:
            continue
        ring = way.get('nodes', [])
        if len(ring) < 4 or ring[0] != ring[-1] or any(n not in nodes for n in ring):
            skipped += 1; continue
        polygon = Polygon([(nodes[n]['lon'], nodes[n]['lat']) for n in ring])
        if not polygon.is_valid:
            skipped += 1; continue
        access = [int(i) for i in tree.query(polygon, predicate='intersects') if ground[i]]
        if not access:
            skipped += 1; continue
        parks.append({'id': str(way['id']), 'name': tags.get('name', 'Unnamed mapped park'), 'nodes': sorted(access), 'geometry': {'type': 'Polygon', 'coordinates': [[[round(x, 6), round(y, 6)] for x, y in polygon.exterior.coords]]}, 'accessMethod': 'mapped walking nodes within park polygon; entrances not verified'})
    network = {'schemaVersion': 2, 'nodes': points, 'ground': ground, 'edges': edges, 'parks': parks}
    payload = json.dumps(network, separators=(',', ':')).encode()
    write_gzip(PROCESSED / 'walking-network.json.gz', network)
    # One MultiLineString keeps map-feature overhead small. Junctions remain in the graph.
    lines = {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {}, 'geometry': {'type': 'MultiLineString', 'coordinates': [f['geometry']['coordinates'] for f in display]}}]}
    # Display lines are derived from regional edges during the web prebuild.
    manifest = {'source': URL, 'query': query, 'license': 'ODbL-1.0', 'attribution': '© OpenStreetMap contributors', 'license_url': 'https://www.openstreetmap.org/copyright', 'osm_base_timestamp': raw.get('osm3s', {}).get('timestamp_osm_base'), 'tile_timestamps': raw.get('tile_timestamps', []), 'edge_fields': ['from', 'to', 'walking_minutes', 'at_ground_level'], 'retrieved_at': datetime.fromtimestamp(CACHE.stat().st_mtime, timezone.utc).isoformat(), 'input_sha256': hashlib.sha256(CACHE.read_bytes()).hexdigest(), 'sha256': hashlib.sha256(payload).hexdigest(), 'counts': {'nodes': len(points), 'directed_edges': len(edges), 'parks_with_mapped_access': len(parks), 'parks_omitted_without_valid_polygon_or_access': skipped}, 'walking_metres_per_minute': 80, 'steps_metres_per_minute': 40, 'assumptions': ['Allowed untagged local streets are assumed walkable; sidewalks, slopes, crossings, accessibility and opening hours are not audited.', 'Connections use shared OSM node IDs; geometric crossings do not create junctions. Closed or conditionally accessible ways and blocked barrier nodes are excluded.', 'Origin and transit-stop access snap to a ground-level node within 100 m; this final straight connector is an assumption, not a verified entrance or crossing.', 'Park targets are mapped walking nodes inside closed park ways. Relation-only parks and parks without such nodes are omitted; inventory and entrances are incomplete.', 'Finite buffered extracts can miss paths leaving the analysis area. Unreachable means no path in this extract, not proof of no real-world access.', 'No wheelchair, motor traffic, timetable, utility, emissions or cost model.']}
    (PUBLIC / 'walking-network.sources.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest['counts']), 'graph bytes', len(payload))


if __name__ == '__main__':
    main()
