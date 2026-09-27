"""Parcel output must not carry person-level names."""

import json
import unittest
from pathlib import Path

import config
from data_io import parcel_features
from build_dataset import _public_feature
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[1]
PARCELS = ROOT / "pipeline" / "data" / "processed" / "parcels.geojson"


class PiiTests(unittest.TestCase):
    def test_legitimate_street_names_are_not_treated_as_party_fields(self):
        record = {'pin': 'test', 'address': '6214 SELLERS ST', 'neighborhood': 'test', 'area': 'test', 'geometry': box(0, 0, 1, 1),
                  'score': {'scores': {}, 'factors': {}, 'confidence': 0, 'confidence_label': 'Low', 'confidence_notes': []}}
        self.assertEqual(_public_feature(record)['properties']['address'], '6214 SELLERS ST')
        record['score']['factors']['seller_name'] = 'excluded'
        with self.assertRaises(RuntimeError):
            _public_feature(record)

    def test_assessment_request_omits_party_names(self):
        fields = config.ASSESSMENT_FIELDS.upper()
        for fragment in ("OWNER", "BUYER", "SELLER", "GRANTOR", "GRANTEE", "CHANGENOTICE", "MAILING"):
            self.assertNotIn(fragment, fields)

    def test_forbidden_fragments_cover_party_names(self):
        fragments = set(config.FORBIDDEN_OUTPUT_FRAGMENTS)
        for fragment in ("owner", "buyer", "seller", "grantor", "grantee", "changenotice", "mailing"):
            self.assertIn(fragment, fragments)

    def test_published_parcels_have_no_party_name_fields(self):
        keys = set()
        count = 0
        for feature in parcel_features():
            count += 1
            keys.update(feature["properties"].keys())
        self.assertGreater(count, 8645)
        blob = " ".join(keys).lower()
        for fragment in config.FORBIDDEN_OUTPUT_FRAGMENTS:
            self.assertNotIn(fragment, blob)
        self.assertIn("pin", keys)
        self.assertIn("address", keys)
        self.assertNotIn("saledesc", keys)

    def test_site_layers_request_no_owner_billing_or_amount_fields(self):
        for fields in (config.CITY_OWNED_FIELDS, config.TAX_DELINQUENCY_FIELDS, config.CONDEMNED_FIELDS, config.LIHTC_FIELDS):
            lowered = fields.lower()
            for fragment in ("owner", "billing", "contact", "company", "delq_tax", "address"):
                self.assertNotIn(fragment, lowered)

    def test_published_site_flags_are_booleans_or_codes(self):
        allowed_status = {None, "available", "sale_pending", "acquisition_pending", "hold_for_study", "permanent", "unknown"}
        for feature in parcel_features():
            props = feature["properties"]
            for key in ("vacant_lot", "city_owned", "city_open_space", "tax_delinquent", "tax_delinquent_prior_years", "condemned_or_dead_end", "qct_2026"):
                self.assertIn(props.get(key), (None, True, False), key)
            self.assertIn(props.get("city_status"), allowed_status)
            for key in props:
                self.assertNotIn("amount", key.lower())
                self.assertNotIn("delq_tax", key.lower())


if __name__ == "__main__":
    unittest.main()
