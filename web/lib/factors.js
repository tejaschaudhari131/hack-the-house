/** One definition of the six scoring factors, used by ranking, comparison, explanations, the report, and exports.
 * Keep the math aligned with pipeline/score.py composite() and shared/rank_vector.json.
 */

export const FACTORS = [
  {
    id: "demand",
    scoreKey: "demand",
    label: "Market activity & lot fit",
    sliderLabel: "Market activity & lot fit",
    direction: "higher_better",
    shared: false,
    scope: "Neighborhood valid sales plus this lot's area",
    meaning:
      "Neighborhood sale prices and turnover (market heat) blended 50/50 with an assumed lot-size fit curve for the type. Not a measure of demand for a type, absorption, or financial viability.",
    sourceIds: ["assessment"],
  },
  {
    id: "transit",
    scoreKey: "transit",
    label: "Transit access",
    sliderLabel: "Transit access",
    direction: "higher_better",
    shared: true,
    scope: "Place (same for every type on a parcel)",
    meaning: "Weekday scheduled trips at stops within 400 m and distance to the nearest stop. Scheduled service, not reliability or a walking route.",
    sourceIds: ["transit"],
  },
  {
    id: "equity",
    scoreKey: "equity",
    label: "Equity",
    sliderLabel: "Equity",
    direction: "higher_better",
    shared: false,
    scope: "Block group and tract need, then a team-chosen type rule",
    meaning:
      "Measured need (income vs county, ACS rent burden, CHAS low-income cost burden) combined with team-chosen production and displacement-exposure multipliers by type. The type effects are assumptions, not measured outcomes.",
    sourceIds: ["acs", "chas", "assessment"],
  },
  {
    id: "climate",
    scoreKey: "climate_risk",
    label: "Climate hazard",
    sliderLabel: "Climate hazard (prefer lower)",
    direction: "higher_worse",
    shared: false,
    scope: "Parcel overlap with mapped layers",
    meaning:
      "Overlap with FEMA flood zones, 25%+ slopes (a landslide-risk proxy), and undermined areas, blended 50/30/20, with a small type multiplier. A map screen, not a survey.",
    sourceIds: ["flood", "slope", "undermined"],
  },
  {
    id: "displacement",
    scoreKey: "displacement_risk",
    label: "Displacement risk (screening signal)",
    sliderLabel: "Displacement risk (prefer lower; screening signal)",
    direction: "higher_worse",
    shared: true,
    scope: "Census tract (same for every type on a parcel)",
    meaning:
      "Renter vulnerability (renter share, CHAS cost burden) and rent pressure (rent growth vs county). A place-level screen, not a prediction that any development displaces anyone. Ranking prefers lower-risk places, which is a different objective from targeting high-need areas for intervention.",
    sourceIds: ["tenure", "rent2019", "chas"],
  },
  {
    id: "carbon",
    scoreKey: "carbon_index",
    label: "Carbon-related proxy (relative, per home)",
    sliderLabel: "Carbon-related proxy (prefer lower; relative, per home)",
    direction: "higher_worse",
    shared: false,
    scope: "Building type plus this place's transit",
    meaning:
      "Existing-stock site energy by building type (RECS), an assumed embodied-carbon tier, and a transport term from the transit score. Energy is not an emissions inventory and there is no project baseline, so this is not tonnes or true marginal CO2.",
    sourceIds: ["recs", "embodied", "transit"],
  },
]

export const FACTOR_BY_ID = Object.fromEntries(FACTORS.map((factor) => [factor.id, factor]))

export function isScore(value) {
  return typeof value === "number" && Number.isFinite(value)
}

export function isWeight(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

/** 0–100 suitability, unrounded: higher-is-worse factors become 100 minus the value. Null when not a finite number. */
export function suitability(factor, typeScore) {
  const value = typeScore?.[factor.scoreKey]
  if (!isScore(value)) return null
  return factor.direction === "higher_worse" ? 100 - value : value
}

/** Python round(x, 1): the correctly rounded exact binary value, with exact ties going to the even digit. */
export function round1(x) {
  if (!Number.isFinite(x)) return null
  if (Number.isInteger(x * 20) && !Number.isInteger(x * 10)) {
    const low = Math.floor(x * 10)
    return (low % 2 === 0 ? low : low + 1) / 10
  }
  return Number(x.toFixed(1))
}

/**
 * Weighted average over factors that have both a finite value and a positive weight.
 * contribution_i = weight_i × suitability_i / D, where D is the sum of those weights.
 */
export function breakdown(typeScore, weights) {
  const rows = []
  let den = 0
  for (const factor of FACTORS) {
    const weight = weights?.[factor.id]
    const value = typeScore?.[factor.scoreKey]
    const suit = suitability(factor, typeScore)
    const weighted = isWeight(weight)
    const available = weighted && suit !== null
    if (available) den += weight
    rows.push({
      id: factor.id,
      label: factor.label,
      weight: isWeight(weight) ? weight : 0,
      value: isScore(value) ? value : null,
      suitability: suit,
      available,
      missing: weighted && suit === null,
    })
  }
  let exact = null
  if (den > 0) {
    exact = 0
    for (const row of rows) {
      row.contribution = row.available ? (row.weight * row.suitability) / den : null
      if (row.available) exact += row.contribution
    }
  } else {
    for (const row of rows) row.contribution = null
  }
  const weightedIds = rows.filter((row) => row.weight > 0).map((row) => row.id)
  const availableIds = rows.filter((row) => row.available).map((row) => row.id)
  const missingIds = rows.filter((row) => row.missing).map((row) => row.id)
  return {
    exact,
    composite: exact === null ? null : round1(exact),
    usableWeight: den,
    rows,
    weightedIds,
    availableIds,
    missingIds,
    noScoreReason:
      den > 0
        ? null
        : weightedIds.length
          ? "No score: every factor with a positive weight is missing for this option."
          : "No score: every weight is zero. Raise at least one weight.",
  }
}

export function coverageText(result) {
  const weighted = result.weightedIds.length
  const available = result.availableIds.length
  if (!weighted) return "No factor has a positive weight."
  const missing = result.missingIds.map((id) => FACTOR_BY_ID[id].label)
  return `${available} of ${weighted} weighted factors available${missing.length ? `; missing: ${missing.join(", ")} (weights renormalize over the rest)` : ""}.`
}

/** Raw weights as shares of their total, for display. Raw weights are relative, not percentages. */
export function weightShares(weights) {
  const total = FACTORS.reduce((sum, factor) => sum + (isWeight(weights?.[factor.id]) ? weights[factor.id] : 0), 0)
  return Object.fromEntries(
    FACTORS.map((factor) => [factor.id, total > 0 && isWeight(weights?.[factor.id]) ? weights[factor.id] / total : 0]),
  )
}

/** Transit enters directly and through the carbon proxy's transport term. Share of the total with complete data. */
export function transitTotalShare(weights, carbonTransportWeight) {
  const shares = weightShares(weights)
  if (!Number.isFinite(carbonTransportWeight)) return shares.transit
  return shares.transit + carbonTransportWeight * shares.carbon
}
