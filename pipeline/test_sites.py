"""Site inventory parsing. No network."""

import unittest

from sites import (
    is_vacant_land_use,
    parse_city_owned,
    parse_condemned,
    parse_tax_delinquency,
    site_flags,
)

PIN = "0049B00013000000"


class SiteTests(unittest.TestCase):
    def test_vacant_land_uses(self):
        self.assertTrue(is_vacant_land_use("VACANT LAND"))
        self.assertTrue(is_vacant_land_use("VACANT COMMERCIAL LAND"))
        self.assertFalse(is_vacant_land_use("SINGLE FAMILY"))
        self.assertFalse(is_vacant_land_use(None))

    def test_city_owned_codes_and_open_space(self):
        parsed = parse_city_owned(
            [
                {"pin": f" {PIN.lower()} ", "class": "Vacant Land", "inventory_type": "Hold For Study", "current_status": "Hold for Study"},
                {"pin": "0001A00001000000", "class": "Vacant Land", "inventory_type": "Legislated Greenway", "current_status": "Permanent City Ownership"},
                {"pin": "0001A00002000000", "class": "Building", "inventory_type": "URA Transfer", "current_status": "Available for Sale"},
            ]
        )
        self.assertEqual(parsed[PIN]["city_inventory"], "Hold for Study")
        self.assertEqual(parsed[PIN]["city_status"], "hold_for_study")
        self.assertTrue(parsed[PIN]["city_vacant_land"])
        self.assertTrue(parsed["0001A00001000000"]["city_open_space"])
        self.assertEqual(parsed["0001A00001000000"]["city_status"], "permanent")
        self.assertEqual(parsed["0001A00002000000"]["city_status"], "available")
        self.assertFalse(parsed["0001A00002000000"]["city_vacant_land"])
        # Stored codes never carry the word the PII guard looks for.
        for entry in parsed.values():
            self.assertNotIn("owner", str(entry).lower())

    def test_tax_delinquency_is_booleans_only(self):
        parsed = parse_tax_delinquency(
            [
                {"pin": PIN, "prior_years": "3"},
                {"pin": "0001A00001000000", "prior_years": "0"},
            ]
        )
        self.assertEqual(parsed[PIN], {"tax_delinquent": True, "tax_delinquent_prior_years": True})
        self.assertEqual(parsed["0001A00001000000"]["tax_delinquent_prior_years"], False)
        for entry in parsed.values():
            self.assertTrue(all(isinstance(value, bool) for value in entry.values()))

    def test_condemned_keeps_active_records(self):
        parsed = parse_condemned(
            [
                {"parcel_id": PIN, "inspection_status": "Active"},
                {"parcel_id": "0001A00001000000", "inspection_status": "Closed"},
            ]
        )
        self.assertEqual(parsed, {PIN})

    def test_site_flags_merge_and_unknowns(self):
        city = parse_city_owned([{"pin": PIN, "class": "Vacant Land", "inventory_type": "Public Sale", "current_status": "Available for Sale"}])
        delinquent = parse_tax_delinquency([{"pin": PIN, "prior_years": "0"}])
        flags = site_flags(PIN, "SINGLE FAMILY", city, delinquent, {PIN})
        self.assertTrue(flags["city_owned"])
        self.assertTrue(flags["vacant_lot"])  # the City's class says vacant land
        self.assertFalse(flags["vacant_land_use"])
        self.assertTrue(flags["tax_delinquent"])
        self.assertFalse(flags["tax_delinquent_prior_years"])
        self.assertTrue(flags["condemned_or_dead_end"])
        other = site_flags("0001A00001000000", "VACANT LAND", city, delinquent, set())
        self.assertFalse(other["city_owned"])
        self.assertTrue(other["vacant_lot"])
        self.assertFalse(other["condemned_or_dead_end"])
        # A layer that failed to load is unknown, not "no".
        unknown = site_flags(PIN, None, None, None, None)
        self.assertIsNone(unknown["city_owned"])
        self.assertIsNone(unknown["tax_delinquent"])
        self.assertIsNone(unknown["condemned_or_dead_end"])
        self.assertIsNone(unknown["vacant_lot"])


if __name__ == "__main__":
    unittest.main()
