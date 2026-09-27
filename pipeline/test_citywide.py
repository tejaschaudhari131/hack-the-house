"""Release-level evidence and original-study regression checks."""
import json
import unittest
from pathlib import Path
from data_io import parcel_features

ROOT=Path(__file__).resolve().parents[1]
class CityRelease(unittest.TestCase):
    def test_original_scores_change_only_when_underlying_evidence_changes(self):
        original={f['properties']['pin']:f['properties'] for f in json.loads((ROOT/'web/testdata/study/parcels.geojson').read_text())['features']}
        derived={'scores','confidence','confidence_label','confidence_notes'}
        retained=set();same=0;changed=0
        for f in parcel_features():
            p=f['properties'];old=original.get(p['pin'])
            if old is None:continue
            retained.add(p['pin'])
            if p['scores']==old['scores']:same+=1;continue
            changed+=1
            self.assertTrue(any(old.get(k)!=p.get(k) for k in set(old)|set(p) if k not in derived),p['pin'])
        self.assertEqual(set(original)-retained,{'COMMON GROUND'})
        self.assertEqual((same,changed),(6019,2625),'A source refresh must update the documented parity audit')

    def test_all_neighborhoods_and_unidentified_polygons_are_explicit(self):
        counts={};pins=set();internal=0
        for f in parcel_features():
            p=f['properties'];self.assertNotIn(p['pin'],pins);pins.add(p['pin'])
            counts[p['neighborhood']]=counts.get(p['neighborhood'],0)+1
            if p.get('internal_map_id'):
                internal+=1;self.assertTrue(p['pin'].startswith('SITE'));self.assertIn('source_pin',p)
                for k in ['city_owned','city_open_space','tax_delinquent','tax_delinquent_prior_years','condemned_or_dead_end']:self.assertIsNone(p[k],(p['pin'],k))
        self.assertEqual((len(pins),len(counts),internal),(142865,90,294))
        summary=json.loads((ROOT/'web/public/data/summary.json').read_text())
        self.assertEqual(summary['parcel_count'],len(pins));self.assertEqual(summary['internal_map_id_count'],internal)
        self.assertEqual(counts,{n['name']:n['parcel_count'] for n in summary['neighborhoods']})

if __name__=='__main__':unittest.main()
