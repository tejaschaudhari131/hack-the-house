/** Live ranking. Keep the composite math aligned with pipeline/score.py and shared/rank_vector.json. */

import { FACTORS, breakdown, isScore, round1 } from "./factors.js"

export const HOUSING_TYPES = [
  "single_family",
  "townhouse_duplex",
  "small_apartment",
  "large_apartment",
]

export const TYPE_LABELS = {
  single_family: "Single-family",
  townhouse_duplex: "Townhouse / duplex",
  small_apartment: "Small apartment (3–19 units)",
  large_apartment: "Large apartment (20+ units)",
}

export const DEFAULT_WEIGHTS = { demand: 25, transit: 25, equity: 25, climate: 25, displacement: 15, carbon: 15 }

export const WEIGHT_LABELS = Object.fromEntries(FACTORS.map((factor) => [factor.id, factor.sliderLabel]))

/** 100 minus a "higher is worse" score, rounded for display only. Composites use the unrounded value. */
export function inverted(value) {
  if (!isScore(value)) return null
  return round1(100 - value)
}

export const climateSuitability = inverted

/** Weighted average of available factors with positive weights, rounded like Python's round(x, 1). */
export function composite(typeScore, weights) {
  return breakdown(typeScore, weights).composite
}

export function rankTypes(scores, weights, { allowed = null, whatIf = false } = {}) {
  const rows = HOUSING_TYPES.map((id) => {
    const score = scores?.[id] || {}
    const row = {
      id,
      label: TYPE_LABELS[id],
      demand: score.demand ?? null,
      transit: score.transit ?? null,
      equity: score.equity ?? null,
      climate_risk: score.climate_risk ?? null,
      climate_suitability: climateSuitability(score.climate_risk),
      displacement_risk: score.displacement_risk ?? null,
      carbon_index: score.carbon_index ?? null,
      confidence: score.confidence ?? null,
      confidence_label: score.confidence_label ?? null,
      allowed: allowed ? allowed.has(id) : null,
    }
    row.composite = composite(score, weights)
    return row
  })
  rows.sort((a, b) => {
    if (!whatIf && allowed) {
      const groupA = a.allowed ? 0 : 1
      const groupB = b.allowed ? 0 : 1
      if (groupA !== groupB) return groupA - groupB
    }
    return (b.composite ?? -1) - (a.composite ?? -1)
  })
  return rows
}
