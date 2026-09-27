import { PLANNER_FACTORS } from './plannerState.js'

const finite = Number.isFinite
export function rankedWinner(options, score = o => o.total) {
  const eligible = Object.keys(options).filter(id => options[id].eligible && finite(score(options[id])))
    .sort((a, b) => score(options[b]) - score(options[a]))
  if (!eligible.length) return null
  if (eligible.length > 1 && score(options[eligible[0]]) - score(options[eligible[1]]) < .1) return 'tie'
  return eligible[0]
}

const EFFECTS = {
  demand: 'Held at the source market/lot proxy. No causal household-demand model is available.',
  physical: 'Road/path corridors and park zones reserve proposal land; fit and overlap can change.',
  affordability: 'Held at the entered rent, utilities and income. No infrastructure-to-rent forecast is applied.',
  displacement: 'Held at the tract risk screen. Development-induced displacement is not estimated.',
  capacity: 'Added departures can change assumed spare boardings; a walking link or park creates no capacity.',
  access: 'Recomputed from the walking graph, stop frequency and your explicit park-access preference.',
  carbon: 'Held at the relative per-home index. No mode-shift or infrastructure-emissions model is available.',
}

/** Exact arithmetic attribution, not causal evidence or statistical confidence. */
export function recommendationAudit(result, scenario, props = {}) {
  const ids = Object.keys(result.baseline)
  const sum = result.included.reduce((s, id) => s + scenario.weights[id], 0)
  const factors = PLANNER_FACTORS.map(factor => {
    const id = factor.id, included = result.included.includes(id)
    const effectiveWeight = included && sum ? scenario.weights[id] / sum : 0
    const values = Object.fromEntries(ids.map(slot => {
      const before = result.baseline[slot].scores[id], after = result.proposal[slot].scores[id]
      return [slot, { before, after, delta: finite(before) && finite(after) ? after - before : null, weightedDelta: included ? (after - before) * effectiveWeight : null }]
    }))
    const gaps = Object.fromEntries(['baseline', 'proposal'].map(state => [state, included ? (result[state][ids[0]].scores[id] - (result[state][ids[1]]?.scores[id] ?? result[state][ids[0]].scores[id])) * effectiveWeight : null]))
    const missing = ['baseline', 'proposal'].flatMap(state => ids.filter(slot => !finite(result[state][slot].scores[id])).map(slot => `${state} ${slot}`))
    return { ...factor, included, effectiveWeight, values, gaps, effect: EFFECTS[id], exclusion: included ? null : missing.length ? `Unknown for ${missing.join(', ')}; excluded from all totals.` : 'Priority weight is zero; excluded from all totals.' }
  })
  const sensitivity = Object.fromEntries(['baseline', 'proposal'].map(state => {
    const options = result[state], base = rankedWinner(options), cases = []
    for (const id of result.included) for (const multiplier of [.75, 1.25]) {
      const weights = { ...scenario.weights, [id]: scenario.weights[id] * multiplier }, denominator = result.included.reduce((s, key) => s + weights[key], 0)
      const winner = rankedWinner(options, o => denominator ? result.included.reduce((s, key) => s + o.scores[key] * weights[key], 0) / denominator : null)
      cases.push({ factor: id, multiplier, winner })
    }
    const applicable = ids.filter(id => options[id].eligible && finite(options[id].total)).length >= 2 && sum > 0
    return [state, { applicable, base, cases: applicable ? cases : [], changedCases: applicable ? cases.filter(c => c.winner !== base) : [] }]
  }))
  const hazards = [
    ['sfha_overlap', 'Mapped special flood hazard area'], ['flood_02_overlap', 'Mapped 0.2% flood area'],
    ['steep_slope_overlap', 'Steep-slope proxy'], ['undermined_overlap', 'Mapped undermining'],
  ].map(([id, label]) => ({ id, label, overlap: finite(props[id]) ? props[id] : null, review: !finite(props[id]) || props[id] > 0 }))
  return { factors, sensitivity, hazards, sourceNotes: props.confidence_notes || [],
    unreviewed: ['Setbacks, height limits and detailed zoning', 'Legal access, ownership, occupancy and demolition', 'Water/sewer and peak transit capacity', 'Engineering, slopes and infrastructure construction costs', 'Financing, subsidies, rent forecasts and marginal emissions'],
  }
}
