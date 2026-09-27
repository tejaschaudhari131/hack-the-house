"""Small compressed source partitions; full-city transport files are never published."""
import gzip
import json
import re
from pathlib import Path

PROCESSED = Path(__file__).resolve().parent / 'data/processed'

def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower())

def write_gzip(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(gzip.compress(json.dumps(payload, separators=(',', ':')).encode(), mtime=0))

def read_gzip(path):
    return json.loads(gzip.decompress(path.read_bytes()))

def parcel_features():
    for path in sorted((PROCESSED / 'parcels').glob('*.geojson.gz')):
        yield from read_gzip(path)['features']

def write_parcels(features, neighborhoods):
    grouped = {n['name']: [] for n in neighborhoods}
    for f in features:
        grouped[f['properties']['neighborhood']].append(f)
    for name, rows in grouped.items():
        write_gzip(PROCESSED / 'parcels' / f'{slug(name)}.geojson.gz', {'type':'FeatureCollection','features':rows})
