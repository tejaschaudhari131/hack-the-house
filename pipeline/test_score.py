"""Unit tests for the scoring model. No network and no parcel data."""

import json
import unittest
from pathlib import Path

from score import (
    climate_risk,
    composite,
    lot_fit,
    model_card,
    rank_types,
    score_parcel,
)

ROOT = Path(__file__).resolve().parents[1]
VECTOR = json.loads((ROOT / "shared" / "rank_vector.json").read_text())


class ScoreTests(unittest.TestCase):
    def test_lot_fit_prefers_townhouse_on_a_small_lot(self):
        self.assertGreater(lot_fit(2000, "townhouse_duplex"), lot_fit(2000, "large_apartment"))
        self.assertGreater(lot_fit(20000, "large_apartment"), lot_fit(2000, "large_apartment"))

    def test_scores_stay_in_range(self):
        parcel = {
            "lot_sqft": 3600,
            "trips_within_400m": 80,
            "nearest_stop_m": 150,
            "median_income": 42000,
            "income_moe": 3000,
            "rent_burden_share": 0.48,
            "median_gross_rent": 900,
            "census_geography": "block_group",
            "sfha_overlap": 0.4,
            "flood_02_overlap": 0,
            "steep_slope_overlap": 0.2,
            "undermined_overlap": 0.1,
            "assessment_joined": True,
            "transit_available": True,
            "flood_available": True,
            "steep_slope_available": True,
            "undermined_available": True,
        }
        neighborhood = {"price_per_sqft": 140, "turnover_per_100": 12, "valid_sales": 40}
        result = score_parcel(parcel, neighborhood, county_median_income=76000)
        for row in result["scores"].values():
            for key in ("demand", "transit", "equity", "climate_risk"):
                self.assertGreaterEqual(row[key], 0)
                self.assertLessEqual(row[key], 100)
        self.assertGreater(
            result["scores"]["large_apartment"]["climate_risk"],
            result["scores"]["single_family"]["climate_risk"],
        )

    def test_missing_hazards_do_not_become_zero_risk(self):
        parcel = {
            "lot_sqft": 5000,
            "trips_within_400m": 10,
            "nearest_stop_m": 400,
            "median_income": 50000,
            "rent_burden_share": 0.3,
            "assessment_joined": True,
            "transit_available": True,
            "flood_available": False,
            "steep_slope_available": False,
            "undermined_available": False,
            "sfha_overlap": 0,
            "flood_02_overlap": 0,
            "steep_slope_overlap": 0,
            "undermined_overlap": 0,
        }
        neighborhood = {"price_per_sqft": 200, "turnover_per_100": 20, "valid_sales": 30}
        result = score_parcel(parcel, neighborhood, 76000)
        self.assertIsNone(result["scores"]["single_family"]["climate_risk"])
        self.assertLess(result["confidence"], 0.85)
        self.assertTrue(any("flood" in note.lower() for note in result["confidence_notes"]))

    def test_shared_rank_vector(self):
        weights = VECTOR["weights"]
        for housing_type, expected in VECTOR["expected_composite"].items():
            got = composite(VECTOR["scores"][housing_type], weights)
            self.assertEqual(got, expected)
        order = [
            row["id"]
            for row in rank_types(VECTOR["scores"], weights, allowed=None, what_if=True)
        ]
        self.assertEqual(order, VECTOR["expected_order_what_if"])
        flagged = [
            row["id"]
            for row in rank_types(
                VECTOR["scores"], weights, allowed=set(VECTOR["allowed"]), what_if=False
            )
        ]
        self.assertEqual(flagged, VECTOR["expected_order_current_rules"])

    def test_climate_suitability_direction(self):
        low = {"demand": 50, "transit": 50, "equity": 50, "climate_risk": 0}
        high = {"demand": 50, "transit": 50, "equity": 50, "climate_risk": 80}
        weights = {"demand": 1, "transit": 1, "equity": 1, "climate": 1}
        self.assertGreater(composite(low, weights), composite(high, weights))

    def test_exposure_multiplier_increases_large_apartment_risk(self):
        self.assertGreater(climate_risk("large_apartment", 50), climate_risk("single_family", 50))

    def test_steep_slope_is_a_proxy_not_a_landslide_inventory(self):
        climate = next(row for row in model_card()["dimensions"] if row["id"] == "climate_risk")
        text = " ".join(climate["measured"]).lower()
        self.assertIn("proxy", text)
        self.assertIn("not a landslide inventory", text)
        parcel = {
            "lot_sqft": 5000,
            "trips_within_400m": 20,
            "nearest_stop_m": 200,
            "median_income": 50000,
            "rent_burden_share": 0.3,
            "assessment_joined": True,
            "transit_available": True,
            "flood_available": True,
            "steep_slope_available": True,
            "undermined_available": False,
            "sfha_overlap": 0,
            "flood_02_overlap": 0,
            "steep_slope_overlap": 0.5,
            "undermined_overlap": 0,
        }
        neighborhood = {"price_per_sqft": 150, "turnover_per_100": 12, "valid_sales": 20}
        result = score_parcel(parcel, neighborhood, 76000)
        self.assertEqual(result["factors"]["steep_slope_component"], 50.0)
        self.assertIsNone(result["factors"]["undermined_component"])
        self.assertEqual(result["factors"]["steep_slope_role"], "landslide_risk_proxy")
        self.assertGreater(result["scores"]["single_family"]["climate_risk"], 0)
        self.assertTrue(any("undermined" in note.lower() for note in result["confidence_notes"]))


if __name__ == "__main__":
    unittest.main()
