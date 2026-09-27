"""Unit tests for the scoring model. No network and no parcel data."""

import json
import unittest
from pathlib import Path

from score import (
    RECS_2020_NORTHEAST_MMBTU,
    carbon_building_relative,
    carbon_index,
    chas_low_income_renter_cost_burden,
    climate_risk,
    composite,
    displacement_risk,
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

    def test_shared_rank_vector_six_factors(self):
        six = VECTOR["six_factor"]
        for housing_type, expected in six["expected_composite"].items():
            self.assertEqual(composite(six["scores"][housing_type], six["weights"]), expected)
        order = [row["id"] for row in rank_types(six["scores"], six["weights"], allowed=None, what_if=True)]
        self.assertEqual(order, six["expected_order_what_if"])

    def test_displacement_blends_vulnerability_and_pressure(self):
        # renter 0.5 -> 0.5, CHAS 0.55 -> 0.5, rent +15 points over county -> 0.5
        risk, parts = displacement_risk(0.5, 0.55, 0.15)
        self.assertEqual(risk, 50.0)
        self.assertEqual(parts["vulnerability"], 0.5)
        high, _ = displacement_risk(0.8, 0.85, 0.4)
        low, _ = displacement_risk(0.2, 0.25, -0.1)
        self.assertEqual(high, 100.0)
        self.assertEqual(low, 0.0)

    def test_missing_displacement_inputs_are_dropped_not_zeroed(self):
        vulnerability_only, parts = displacement_risk(0.75, 0.8, None)
        self.assertEqual(vulnerability_only, 100.0)
        self.assertIsNone(parts["rent_pressure_component"])
        pressure_only, _ = displacement_risk(None, None, 0.3)
        self.assertEqual(pressure_only, 100.0)
        nothing, _ = displacement_risk(None, None, None)
        self.assertIsNone(nothing)

    def test_displacement_is_the_same_for_every_type(self):
        parcel = {
            "lot_sqft": 4000,
            "trips_within_400m": 50,
            "nearest_stop_m": 200,
            "median_income": 45000,
            "rent_burden_share": 0.45,
            "chas_rent_burden_share": 0.7,
            "renter_share": 0.6,
            "rent_change_vs_county": 0.2,
            "assessment_joined": True,
            "transit_available": True,
            "flood_available": True,
            "steep_slope_available": True,
            "undermined_available": True,
        }
        neighborhood = {"price_per_sqft": 200, "turnover_per_100": 15, "valid_sales": 40}
        result = score_parcel(parcel, neighborhood, 76000)
        values = {row["displacement_risk"] for row in result["scores"].values()}
        self.assertEqual(len(values), 1)
        self.assertIsNotNone(values.pop())
        missing = score_parcel({**parcel, "rent_change_vs_county": None}, neighborhood, 76000)
        self.assertTrue(any("rent-pressure" in note for note in missing["confidence_notes"]))

    def test_higher_displacement_risk_lowers_the_composite(self):
        base = {"demand": 50, "transit": 50, "equity": 50, "climate_risk": 20, "carbon_index": 40}
        weights = {"demand": 1, "transit": 1, "equity": 1, "climate": 1, "displacement": 1, "carbon": 1}
        self.assertGreater(
            composite({**base, "displacement_risk": 10}, weights),
            composite({**base, "displacement_risk": 90}, weights),
        )
        self.assertEqual(
            composite({**base, "displacement_risk": None}, weights),
            composite(base, {**weights, "displacement": 0}),
        )

    def test_carbon_uses_published_recs_ratios_and_orders_building_forms(self):
        self.assertEqual(RECS_2020_NORTHEAST_MMBTU["single_family"], 120.7)
        self.assertEqual(RECS_2020_NORTHEAST_MMBTU["large_apartment"], 36.2)
        self.assertEqual(carbon_building_relative("single_family"), 1.0)
        order = sorted(RECS_2020_NORTHEAST_MMBTU, key=carbon_building_relative, reverse=True)
        self.assertEqual(order, ["single_family", "townhouse_duplex", "small_apartment", "large_apartment"])
        # Same building, better transit, lower estimate. Transit missing drops that part.
        self.assertGreater(carbon_index("small_apartment", 10), carbon_index("small_apartment", 90))
        self.assertEqual(carbon_index("single_family", None), 100.0)
        self.assertLessEqual(carbon_index("large_apartment", 100), 100)

    def test_model_card_labels_new_factors_as_screen_and_estimate(self):
        dims = {row["id"]: row for row in model_card()["dimensions"]}
        self.assertIn("not a prediction", dims["displacement_risk"]["higher_means"])
        self.assertIn("not tonnes", dims["carbon_index"]["higher_means"])
        self.assertIn("relative tier", " ".join(dims["carbon_index"]["normative"]))
        self.assertEqual(set(model_card()["default_weights"]), {"demand", "transit", "equity", "climate", "displacement", "carbon"})

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
