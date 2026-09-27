/** Live ranking. Keep the composite math aligned with pipeline/score.py and shared/rank_vector.json. */

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

export const DEFAULT_WEIGHTS = { demand: 25, transit: 25, equity: 25, climate: 25 }

export function climateSuitability(risk) {
  if (risk === null || risk === undefined || Number.isNaN(Number(risk))) return null
  return Math.round((100 - Number(risk)) * 10) / 10
}

export function composite(typeScore, weights) {
  const parts = [
    [typeScore?.demand, weights?.demand],
    [typeScore?.transit, weights?.transit],
    [typeScore?.equity, weights?.equity],
    [climateSuitability(typeScore?.climate_risk), weights?.climate],
  ]
  let num = 0
  let den = 0
  for (const [value, weight] of parts) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) continue
    if (!(weight > 0)) continue
    num += Number(weight) * Number(value)
    den += Number(weight)
  }
  if (den === 0) return null
  return Math.round((num / den) * 10) / 10
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
      confidence: score.confidence ?? null,
      confidence_label: score.confidence_label ?? null,
      allowed: allowed ? allowed.has(id) : null,
    }
    row.composite = composite(row, weights)
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
