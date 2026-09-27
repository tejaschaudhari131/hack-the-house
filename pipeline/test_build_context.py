import unittest
from shapely.geometry import box

from build_context import height_for
from height_estimates import metres, osm_height, osm_index, osm_polygon, match_osm, footprint_role, fallback_profile, residential_medians


def osm_way(id, geom, **tags):
    return {'type': 'way', 'id': id, 'tags': {'building': 'yes', **tags}, 'geometry': [{'lon': x, 'lat': y} for x, y in geom.exterior.coords]}


class BuildingHeights(unittest.TestCase):
    def test_only_unambiguous_usable_stories_become_estimates(self):
        self.assertEqual(height_for('2.5', True), (9, 'stories_estimate', 2.5))
        for value in [None, '', 'unknown', 'nan', 'inf', '-2', '0', '100']:
            self.assertEqual(height_for(value, True), (9, 'placeholder', None))
        self.assertEqual(height_for('3', False), (9, 'placeholder', None))

    def test_main_house_does_not_give_its_story_count_to_garage(self):
        areas = [140, 35, 18]
        self.assertEqual(footprint_role(0, [0, 1, 2], areas, True), 'dominant')
        self.assertEqual(footprint_role(1, [0, 1, 2], areas, True), 'auxiliary')
        self.assertEqual(footprint_role(2, [0, 1, 2], areas, False), 'ambiguous')
        self.assertEqual(footprint_role(0, [0, 1], [140, 120], True), 'ambiguous')
        self.assertEqual(footprint_role(0, [], areas, True), 'unknown')

    def test_broad_use_profiles_do_not_infer_floors_from_unit_counts(self):
        self.assertEqual(fallback_profile('APART:40+ UNITS', 'C', 'ambiguous', 700), 'apartments_large')
        self.assertNotEqual(fallback_profile('APART:40+ UNITS', 'C', 'ambiguous', 40), 'apartments_large')
        self.assertEqual(fallback_profile('SINGLE FAMILY', 'R', 'auxiliary', 35), 'small_auxiliary')
        self.assertEqual(fallback_profile('', 'G', 'unknown', 35), 'unknown')

    def test_unit_parsing_rejects_ambiguous_values(self):
        self.assertEqual(metres('30 ft'), 9.144)
        self.assertEqual(metres('12 m'), 12)
        for value in [None, '-2', 'nan', '12;15', '12-15', '301', '12 stories']:
            self.assertIsNone(metres(value))

    def test_explicit_height_includes_roof_and_levels_use_roof_once(self):
        self.assertEqual(osm_height({'height': '12', 'building:levels': '3', 'roof:height': '2'})['height_m'], 12)
        self.assertEqual(osm_height({'building:levels': '3', 'roof:height': '2'})['height_m'], 11)
        self.assertEqual(osm_height({'building:levels': '3', 'roof:levels': '1'})['height_m'], 12)
        self.assertEqual(osm_height({'building:levels': '3', 'roof:shape': 'flat'})['height_m'], 9.6)
        self.assertIsNone(osm_height({'building:levels': 'unknown'}))

    def test_osm_matches_the_building_not_its_neighbor_or_small_roof_part(self):
        building = box(0, 0, 10, 10)
        raw = {'elements': [osm_way(1, building, height='12'), osm_way(2, box(10, 0, 20, 10), height='20')]}
        records, tree = osm_index(raw)
        self.assertEqual(match_osm(building, records, tree)['height_ref'], 'way/1')
        raw['elements'].append(osm_way(3, box(0, 0, 2, 2), height='30', **{'building:part': 'yes'}))
        records, tree = osm_index(raw)
        self.assertEqual(match_osm(building, records, tree)['height_m'], 12)
        self.assertIsNone(match_osm(box(30, 0, 40, 10), records, tree))
        raw['elements'].append(osm_way(4, building, height='20'))
        records, tree = osm_index(raw)
        self.assertIsNone(match_osm(building, records, tree))

    def test_suspended_and_demolished_osm_structures_are_not_solid_buildings(self):
        raw = {'elements': [osm_way(1, box(0, 0, 1, 1), height='12', min_height='5'), osm_way(2, box(0, 0, 1, 1), height='12', building='demolished')]}
        self.assertEqual(len(osm_index(raw)[0]), 0)

    def test_multipolygon_hole_and_incomplete_geometry(self):
        outer, inner = box(0, 0, 10, 10), box(2, 2, 4, 4)
        relation = {'type': 'relation', 'tags': {'type': 'multipolygon'}, 'members': [
            {'type': 'way', 'role': 'outer', 'geometry': osm_way(1, outer)['geometry']},
            {'type': 'way', 'role': 'inner', 'geometry': osm_way(2, inner)['geometry']},
        ]}
        self.assertEqual(osm_polygon(relation).area, 96)
        relation['members'][0]['geometry'].pop()
        self.assertIsNone(osm_polygon(relation))

    def test_residential_median_uses_evidence_not_other_guesses(self):
        def feature(height, method):
            return {'properties': {'area': 'A', 'class': 'R', 'height_m': height, 'height_method': method}}
        measured = [feature(7.5, 'stories_estimate') for _ in range(20)]
        guesses = [feature(15, 'typology_estimate') for _ in range(50)]
        self.assertEqual(residential_medians(measured + guesses), {'A': 7.5})
        self.assertEqual(residential_medians(measured[:5] + guesses), {})


if __name__ == '__main__':
    unittest.main()
