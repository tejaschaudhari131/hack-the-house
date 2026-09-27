/** Display defaults for a dropped building. Not measurements and not inputs to the score.
 * scoreType is the housing type whose score the building uses. useRow is the §911.02 row read for its unit count.
 */
export const BUILDINGS = {
  single_family: { label: "Single-family", units: 1, heightM: 8, floors: 2, scoreType: "single_family", useRow: "Single-Unit Detached" },
  townhouse_duplex: { label: "Townhouse / duplex", units: 2, heightM: 11, floors: 3, scoreType: "townhouse_duplex", useRow: null },
  triplex: { label: "Triplex (3 units)", units: 3, heightM: 11, floors: 3, scoreType: "small_apartment", useRow: "Three-Unit" },
  small_apartment: { label: "Small apartment (12 units)", units: 12, heightM: 15, floors: 4, scoreType: "small_apartment", useRow: "Multi-Unit" },
  large_apartment: { label: "Large apartment (40 units)", units: 40, heightM: 24, floors: 8, scoreType: "large_apartment", useRow: "Multi-Unit" },
}

export const BUILDING_IDS = Object.keys(BUILDINGS)

/** Note shown wherever a building's unit count differs from what its score measures. */
export function scoreProxyNote(buildingId) {
  const spec = BUILDINGS[buildingId]
  if (!spec) return ""
  if (spec.scoreType === buildingId && buildingId !== "small_apartment" && buildingId !== "large_apartment") return ""
  return `Scored with the ${spec.scoreType === "small_apartment" ? "small apartment (3–19 units)" : "large apartment (20+ units)"} score. The ${spec.units}-home count is a display default and does not change the score; permission is read from the §911.02 ${spec.useRow} row.`
}

export const WALK_RADIUS_M = 800

export const SCORE_TAGS = {
  demand: {
    measured: "Neighborhood valid-sale prices and this lot's area.",
    choice: "Lot-fit curve and the demand weight.",
  },
  transit: {
    measured: "Weekday scheduled trips and distance to stops.",
    choice: "Walk and frequency anchors, and the transit weight. Transit is a property of the place.",
  },
  equity: {
    measured:
      "Block-group income, ACS rent burden (all renters), and the CHAS 2018–2022 share of low-income renters paying more than 30% of income.",
    choice: "Type factors and the equity weight.",
  },
  climate_risk: {
    measured: "FEMA flood overlap, 25%+ slope as a landslide-risk proxy, and undermined area.",
    choice: "The 50/30/20 blend and the climate weight. The total uses 100 minus this risk.",
  },
  displacement_risk: {
    measured:
      "Tract renter share (ACS 2020–2024), CHAS 2018–2022 low-income renter cost burden, and median rent growth versus the county (ACS 2015–2019 to 2020–2024).",
    choice: "Anchors, the 50/50 vulnerability and pressure blend, and the displacement weight. Same for every type. A screening signal, not a prediction.",
  },
  carbon_index: {
    measured: "EIA RECS 2020 Northeast site energy per household by building type, and this place's transit score.",
    choice: "The embodied-carbon tier, the 60/40 building and transport split, and the carbon weight. A relative estimate, not tonnes.",
  },
  composite: {
    measured: "Only the measured pieces of the six scores above.",
    choice: "The six weights. Risk, displacement, and carbon count as 100 minus the value. Missing scores are skipped, not treated as zero.",
  },
}
