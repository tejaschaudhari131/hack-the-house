"""Unit tests for the scoring model. No network and no parcel data."""

import json
import unittest
from pathlib import Path

from score import (
    chas_low_income_renter_cost_burden,
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

    def test_chas_share_is_low_income_renters_over_30_percent(self):
        # Three renter bands at or below 80% HAMFI.
        # Computed households: (100-10) + (40-0) + (60-0) = 190
        # Cost burden >30%: (20+30) + (10+5) + (0+15) = 80
        row = {
            "T8_est69": 100,
            "T8_est79": 10,
            "T8_est73": 20,
            "T8_est76": 30,
            "T8_est82": 40,
            "T8_est92": 0,
            "T8_est86": 10,
            "T8_est89": 5,
            "T8_est95": 60,
            "T8_est105": 0,
            "T8_est99": 0,
            "T8_est102": 15,
        }
        got = chas_low_income_renter_cost_burden(row)
        self.assertEqual(got["chas_low_income_renter_households"], 190)
        self.assertEqual(got["chas_cost_burdened_low_income_renters"], 80)
        self.assertEqual(got["chas_rent_burden_share"], round(80 / 190, 3))

    def test_chas_share_is_missing_when_a_cell_is_suppressed(self):
        row = {
            "T8_est69": 100,
            "T8_est79": 10,
            "T8_est73": "",
            "T8_est76": 30,
            "T8_est82": 40,
            "T8_est92": 0,
            "T8_est86": 10,
            "T8_est89": 5,
            "T8_est95": 60,
            "T8_est105": 0,
            "T8_est99": 0,
            "T8_est102": 15,
        }
        self.assertIsNone(chas_low_income_renter_cost_burden(row))
        row["T8_est73"] = -1
        self.assertIsNone(chas_low_income_renter_cost_burden(row))

    def test_chas_raises_equity_and_a_missing_tract_does_not_zero_it(self):
        parcel = {
            "lot_sqft": 5000,
            "trips_within_400m": 40,
            "nearest_stop_m": 200,
            "median_income": 70000,
            "rent_burden_share": 0.2,
            "assessment_joined": True,
            "transit_available": True,
            "flood_available": True,
            "steep_slope_available": True,
            "undermined_available": True,
            "sfha_overlap": 0,
            "flood_02_overlap": 0,
            "steep_slope_overlap": 0,
            "undermined_overlap": 0,
        }
        neighborhood = {"price_per_sqft": 180, "turnover_per_100": 10, "valid_sales": 25}
        without = score_parcel(parcel, neighborhood, 76000)
        with_chas = score_parcel({**parcel, "chas_rent_burden_share": 0.85}, neighborhood, 76000)
        missing = score_parcel({**parcel, "chas_rent_burden_share": None}, neighborhood, 76000)
        self.assertGreater(with_chas["factors"]["need"], without["factors"]["need"])
        self.assertEqual(with_chas["factors"]["need_chas"], 0.85)
        self.assertGreater(
            with_chas["scores"]["small_apartment"]["equity"],
            without["scores"]["small_apartment"]["equity"],
        )
        self.assertEqual(missing["factors"]["need"], without["factors"]["need"])
        self.assertIsNotNone(missing["scores"]["small_apartment"]["equity"])
        self.assertIsNone(missing["factors"]["need_chas"])
        self.assertTrue(any("CHAS" in note for note in missing["confidence_notes"]))
        self.assertFalse(any("CHAS" in note for note in without["confidence_notes"]))
        equity = next(row for row in model_card()["dimensions"] if row["id"] == "equity")
        measured = " ".join(equity["measured"])
        self.assertIn("ACS 2024", measured)
        self.assertIn("HUD CHAS 2018-2022", measured)


if __name__ == "__main__":
    unittest.main()
