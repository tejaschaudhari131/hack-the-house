"""City inclusion and neighborhood assignment are independent of source row order."""
import unittest
from shapely.geometry import box
from build_dataset import assign_neighborhood, parcel_identity, HazardIndex, TransitIndex, _overlap, _transit_for_point
import shapely

class NeighborhoodAssignment(unittest.TestCase):
    def test_shared_placeholder_ids_do_not_collapse_distinct_polygons(self):
        a={'properties':{'PIN':'COMMON GROUND'},'geometry':shapely.geometry.mapping(box(0,0,1,1))}
        b={**a,'geometry':shapely.geometry.mapping(box(2,2,3,3))}
        self.assertNotEqual(parcel_identity(a),parcel_identity(b))
        self.assertEqual(parcel_identity(a),parcel_identity(a))
        a['properties']['PIN']='0056F00338000000'
        self.assertEqual(parcel_identity(a),'0056F00338000000')

    def setUp(self):
        self.hoods = [dict(name='West', geom=box(0, 0, 1, 2)), dict(name='East', geom=box(1, 0, 2, 2))]

    def test_internal_and_outside_parcels(self):
        self.assertEqual(assign_neighborhood(box(.1,.1,.8,.8), self.hoods)['name'], 'West')
        self.assertIsNone(assign_neighborhood(box(3,3,4,4), self.hoods))
        self.assertIsNone(assign_neighborhood(box(2,0,3,1), self.hoods), 'Touching the border is not inside')

    def test_largest_overlap_and_deterministic_tie(self):
        self.assertEqual(assign_neighborhood(box(.8,.1,1.8,.8), self.hoods)['name'], 'East')
        parcel = box(.5,.1,1.5,.8)
        self.assertEqual(assign_neighborhood(parcel, self.hoods)['name'], 'East')
        self.assertEqual(assign_neighborhood(parcel, self.hoods[::-1])['name'], 'East')

    def test_city_edge_threshold_and_whole_outline_preserved(self):
        parcel = box(-.4,.1,.6,.8)
        original = parcel.wkb
        self.assertEqual(assign_neighborhood(parcel, self.hoods)['name'], 'West')
        self.assertEqual(parcel.wkb, original)
        self.assertIsNone(assign_neighborhood(box(-2,.1,.2,.8), self.hoods))

    def test_city_membership_does_not_require_half_in_one_neighborhood(self):
        hoods = [dict(name=str(i),geom=box(i,0,i+1,1)) for i in range(4)]
        self.assertIsNotNone(assign_neighborhood(box(.1,.1,3.9,.9), hoods))

class IndexedSourceParity(unittest.TestCase):
    def test_hazard_intersections_count_overlapping_polygons_once(self):
        parts=[box(0,0,1,2),box(.5,0,2,2)]
        parcel=box(-1,-1,3,3)
        self.assertAlmostEqual(_overlap(parcel,HazardIndex(parts)),_overlap(parcel,shapely.union_all(parts)))
        self.assertEqual(_overlap(parcel,HazardIndex([])),0)

    def test_spatial_stop_candidates_match_full_scan_including_ties(self):
        stops=[dict(x=x,y=y,name=str(i),trips=trips,routes=[str(i)]) for i,(x,y,trips) in enumerate([(0,0,20),(0,0,40),(1200,0,60),(1800,0,100),(-800,0,0),(300,400,15)])]
        index=TransitIndex(stops)
        for x,y in [(0,0),(800,600),(10000,10000),(-300,-700)]:
            self.assertEqual(_transit_for_point((x,y),index),_transit_for_point((x,y),stops))
        self.assertEqual(_transit_for_point((0,0),TransitIndex([])),_transit_for_point((0,0),[]))

if __name__ == '__main__': unittest.main()
