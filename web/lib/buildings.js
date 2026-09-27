/** Display defaults for a dropped building. Not measurements and not inputs to the score. */

export const BUILDINGS = {
  single_family: { units: 1, heightM: 8, floors: 2 },
  townhouse_duplex: { units: 2, heightM: 11, floors: 3 },
  small_apartment: { units: 12, heightM: 15, floors: 4 },
  large_apartment: { units: 40, heightM: 24, floors: 8 },
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
