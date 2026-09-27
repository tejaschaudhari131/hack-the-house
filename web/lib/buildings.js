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
    measured: "Block-group income and the share of renters paying 30% or more of income.",
    choice: "Type factors and the equity weight.",
  },
  climate_risk: {
    measured: "FEMA flood overlap, 25%+ slope as a landslide-risk proxy, and undermined area.",
    choice: "The 50/30/20 blend and the climate weight. The total uses 100 minus this risk.",
  },
  composite: {
    measured: "Only the measured pieces of the four scores above.",
    choice: "The four weights. Missing scores are skipped, not treated as zero.",
  },
}
