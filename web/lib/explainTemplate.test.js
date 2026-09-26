import test from "node:test"
import assert from "node:assert/strict"

import { explainTemplate } from "./explainTemplate.js"

test("template names measured facts and value judgments", () => {
  const text = explainTemplate({
    parcel: {
      pin: "1",
      address: "100 Example St",
      neighborhood: "Hazelwood",
      land_use: "SINGLE FAMILY",
      lot_sqft: 4000,
      median_income: 42000,
      census_geography: "block_group",
      rent_burden_share: 0.46,
      trips_within_400m: 12,
      nearest_stop_m: 180,
      nearest_stop_name: "Second Ave at Tecumseh",
      routes_within_400m: ["56"],
      sfha_overlap: 0.2,
      steep_slope_overlap: 0,
      undermined_overlap: 0.4,
      confidence: 0.8,
      confidence_label: "high",
      confidence_notes: [],
    },
    ranked: [
      {
        id: "small_apartment",
        label: "Small apartment (3–19 units)",
        composite: 61,
        demand: 70,
        transit: 40,
        equity: 55,
        climate_suitability: 80,
      },
      {
        id: "single_family",
        label: "Single-family",
        composite: 58,
        demand: 66,
        transit: 40,
        equity: 40,
        climate_suitability: 86,
      },
    ],
    weights: { demand: 25, transit: 25, equity: 25, climate: 25 },
    whatIf: false,
    zoning: {
      status: "use_table_unread",
      code: "R1D-L",
      allowed: null,
      note: "TODO: read the use table.",
    },
    countyMedianIncome: 76000,
  })
  assert.match(text, /screening aid/)
  assert.match(text, /not legal, zoning, or financial advice/)
  assert.match(text, /Zoning Administrator/)
  assert.match(text, /Observed for this place/)
  assert.match(text, /Value judgments/)
  assert.match(text, /use table was not read/)
  assert.match(text, /landslide-risk proxy/)
  assert.match(text, /undermined area/)
  assert.match(text, /100 Example St/)
})
