"""Parcel output must not carry person-level names."""

import json
import unittest
from pathlib import Path

import config

ROOT = Path(__file__).resolve().parents[1]
PARCELS = ROOT / "pipeline" / "data" / "processed" / "parcels.geojson"


class PiiTests(unittest.TestCase):
    def test_assessment_request_omits_party_names(self):
        fields = config.ASSESSMENT_FIELDS.upper()
        for fragment in ("OWNER", "BUYER", "SELLER", "GRANTOR", "GRANTEE", "CHANGENOTICE", "MAILING"):
            self.assertNotIn(fragment, fields)

    def test_forbidden_fragments_cover_party_names(self):
        fragments = set(config.FORBIDDEN_OUTPUT_FRAGMENTS)
        for fragment in ("owner", "buyer", "seller", "grantor", "grantee", "changenotice", "mailing"):
            self.assertIn(fragment, fragments)

    def test_published_parcels_have_no_party_name_fields(self):
        payload = json.loads(PARCELS.read_text())
        keys = set()
        for feature in payload["features"]:
            keys.update(feature["properties"].keys())
        blob = " ".join(keys).lower()
        for fragment in config.FORBIDDEN_OUTPUT_FRAGMENTS:
            self.assertNotIn(fragment, blob)
        self.assertIn("pin", keys)
        self.assertIn("address", keys)
        self.assertNotIn("saledesc", keys)


if __name__ == "__main__":
    unittest.main()
