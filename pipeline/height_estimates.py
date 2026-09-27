"""Display-only relative building heights. Geometry and recommendation inputs stay separate."""
import math
import re
from statistics import median

import shapely
from shapely.geometry import Polygon, LineString
from shapely.ops import polygonize_full, unary_union

# Illustrative priors, not observed floors or a unit-count-to-height conversion.
PROFILES = {
    'small_auxiliary': (3.5, 'Small auxiliary footprint on a residential parcel'),
    'residential': (7.5, 'Residential building; local recorded-story median where available'),
    'mixed_use': (10.5, 'Retail/office with apartments above'),
    'apartments_large': (16.5, 'Large apartment property'),
    'apartments_medium': (13.5, 'Medium apartment property'),
    'apartments_small': (10.5, 'Small apartment property'),
    'warehouse': (7.5, 'Warehouse / storage building'),
    'industrial': (8, 'Industrial building'),
    'commercial': (10.5, 'Commercial building'),
    'unknown': (9, 'Unclassified building'),
}


def number(value, minimum, maximum):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) and minimum <= n <= maximum else None


def metres(value):
    """OSM's default unit is metres; reject ambiguous ranges/lists instead of guessing."""
    match = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(m|meters?|metres?|ft|feet|\')?\s*', str(value or ''), re.I)
    if not match:
        return None
    n = float(match[1]) * (.3048 if (match[2] or '').lower() in {'ft', 'feet', "'"} else 1)
    return n if 0 <= n <= 300 else None


def osm_height(tags):
    height = metres(tags.get('height'))
    floors = number(tags.get('building:levels'), 1, 60)
    if height is not None and height >= 2:
        return {'height_m': round(height, 2), 'height_method': 'osm_height', 'stories': floors}
    if floors is None:
        return None
    roof = metres(tags.get('roof:height'))
    roof_levels = number(tags.get('roof:levels'), 0, 6)
    if roof is None:
        roof = roof_levels * 3 if roof_levels is not None else .6 if tags.get('roof:shape') == 'flat' else 1.5
    if roof > 20:
        return None
    return {'height_m': round(floors * 3 + roof, 2), 'height_method': 'osm_levels', 'stories': floors}


def osm_polygon(element):
    if element['type'] == 'way':
        ring = [(p['lon'], p['lat']) for p in element.get('geometry', [])]
        if len(ring) < 4 or ring[0] != ring[-1]:
            return None
        geom = Polygon(ring)
    elif element['type'] == 'relation' and element.get('tags', {}).get('type') == 'multipolygon':
        lines = {'outer': [], 'inner': []}
        for member in element.get('members', []):
            role = member.get('role') or 'outer'
            if member['type'] == 'relation':
                return None  # Nested relation geometry is not resolved by this importer.
            if member['type'] != 'way' or role not in lines:
                continue
            if not member.get('geometry'):
                return None
            lines[role].append(LineString([(p['lon'], p['lat']) for p in member['geometry']]))
        if not lines['outer']:
            return None
        outer, cuts, dangles, invalid = polygonize_full(unary_union(lines['outer']))
        if any(not g.is_empty for g in [cuts, dangles, invalid]):
            return None
        geom = unary_union(outer)
        if lines['inner']:
            inner, cuts, dangles, invalid = polygonize_full(unary_union(lines['inner']))
            if any(not g.is_empty for g in [cuts, dangles, invalid]):
                return None
            geom = geom.difference(unary_union(inner))
    else:
        return None
    return geom if geom.is_valid and geom.area > 0 and geom.geom_type in {'Polygon', 'MultiPolygon'} else None


def osm_index(raw):
    records = []
    for e in raw.get('elements', []):
        tags = e.get('tags', {})
        # Do not turn suspended building parts into solid ground-level structures.
        if tags.get('building') in {'construction', 'demolished', 'no'} or tags.get('demolished:building'):
            continue
        if (metres(tags.get('min_height')) or 0) > 0 or (number(tags.get('building:min_level'), 0, 60) or 0) > 0:
            continue
        hint, geom = osm_height(tags), osm_polygon(e)
        if hint and geom is not None:
            records.append({'geometry': geom, 'part': 'building:part' in tags, **hint, 'height_ref': f"{e['type']}/{e['id']}"})
    return records, shapely.STRtree([r['geometry'] for r in records])


def match_osm(geometry, records, tree):
    candidates = []
    for i in tree.query(geometry, predicate='intersects'):
        r = records[int(i)]; other = r['geometry']; shared = geometry.intersection(other).area
        coverage, reverse = shared / geometry.area, shared / other.area
        if coverage >= .65 and reverse >= .5 and (not r['part'] or coverage >= .8):
            candidates.append((shared / geometry.union(other).area, r))
    if not candidates:
        return None
    candidates.sort(key=lambda c: c[0], reverse=True)
    best = candidates[0]
    # Ambiguous overlaps with materially different heights are not evidence of a match.
    if len(candidates) > 1 and candidates[1][0] >= best[0] - .1 and abs(candidates[1][1]['height_m'] - best[1]['height_m']) > 3:
        return None
    return {k: v for k, v in best[1].items() if k not in {'geometry', 'part'}} | {'height_match': round(best[0], 3)}


def footprint_role(index, related, areas_m2, residential):
    if index not in related:
        return 'unknown'
    if len(related) == 1:
        return 'sole'
    ranked = sorted(related, key=lambda i: areas_m2[i], reverse=True)
    main, second = ranked[:2]
    dominant = areas_m2[main] >= areas_m2[second] * 1.8 and areas_m2[main] >= sum(areas_m2[i] for i in related) * .6
    if not dominant:
        return 'ambiguous'
    if index == main:
        return 'dominant'
    if residential and areas_m2[index] <= 80 and areas_m2[index] <= areas_m2[main] * .35:
        return 'auxiliary'
    return 'ambiguous'


def residential_use(use):
    return use in {'SINGLE FAMILY', 'ROWHOUSE', 'TWO FAMILY', 'THREE FAMILY', 'FOUR FAMILY', 'RES AUX BUILDING (NO HOUSE)'}


def fallback_profile(use, classification, role, area_m2):
    use = use or ''
    if role == 'auxiliary' or use == 'RES AUX BUILDING (NO HOUSE)':
        return 'small_auxiliary'
    # Apartment unit bands describe the entire parcel, not every shed on it.
    if use == 'APART:40+ UNITS' and area_m2 >= 200:
        return 'apartments_large'
    if use == 'APART:20-39 UNITS' and area_m2 >= 150:
        return 'apartments_medium'
    if use == 'APART: 5-19 UNITS' and area_m2 >= 100:
        return 'apartments_small'
    if 'OVER' in use and ('APT' in use or 'APART' in use):
        return 'mixed_use'
    if residential_use(use) or classification == 'R':
        return 'residential'
    if 'WAREHOUSE' in use or 'STORAGE' in use:
        return 'warehouse'
    if 'MANUFACTURING' in use or classification == 'I':
        return 'industrial'
    if classification == 'C':
        return 'commercial'
    return 'unknown'


def residential_medians(features):
    pools = {}
    for f in features:
        p = f['properties']
        if p['class'] == 'R' and p['height_method'] in {'stories_estimate', 'osm_height', 'osm_levels'} and 3 <= p['height_m'] <= 15:
            pools.setdefault(p['area'], []).append(p['height_m'])
    return {area: round(median(heights), 2) for area, heights in pools.items() if len(heights) >= 20}
