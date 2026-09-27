import { BUILDING_IDS } from './buildings.js'
import { optionFor, PLANNER_FACTORS } from './plannerState.js'

/** Standard dimensions with one disclosed per-home cost assumption for every type. */
export function shortlistTemplates(scenario, sourceSlot) {
  const source = scenario.options[sourceSlot]
  return Object.fromEntries(BUILDING_IDS.map(id => [id, { ...optionFor(id, source.rent), utilities: source.utilities }]))
}

export function rankTemplates(options) {
  const order = BUILDING_IDS.filter(id => options[id].eligible && Number.isFinite(options[id].total))
    .sort((a, b) => options[b].total - options[a].total || BUILDING_IDS.indexOf(a) - BUILDING_IDS.indexOf(b))
  // Same 0.1-point display tie threshold as A/B, always relative to the best score.
  const leaders = order.filter(id => options[order[0]].total - options[id].total < .1)
  return { order, leaders }
}

export function summarizeShortlist(screen, templates, scenario, sourceSlot) {
  const baseline = rankTemplates(screen.baseline), proposal = rankTemplates(screen.proposal)
  const sum = screen.included.reduce((n, id) => n + scenario.weights[id], 0)
  const factors = PLANNER_FACTORS.map(f => {
    const missing = ['baseline', 'proposal'].flatMap(state => BUILDING_IDS.filter(id => !Number.isFinite(screen[state][id].scores[f.id])).map(id => `${state}: ${screen[state][id].label}`))
    return { ...f, included: screen.included.includes(f.id), effectiveWeight: screen.included.includes(f.id) ? scenario.weights[f.id] / sum : 0,
      exclusion: missing.length === BUILDING_IDS.length * 2 ? 'Unknown for all five templates in baseline and proposal. Excluded from every template total.'
        : missing.length ? `Unknown for ${missing.join('; ')}. Excluded from every template total.` : !screen.included.includes(f.id) ? 'Priority weight is zero.' : null }
  })
  const entries = BUILDING_IDS.map(id => {
    const before = screen.baseline[id], after = screen.proposal[id]
    return { id, option: templates[id], baseline: before, proposal: after,
      delta: Number.isFinite(before.total) && Number.isFinite(after.total) ? after.total - before.total : null,
      factors: factors.map(f => ({ id: f.id, before: before.scores[f.id], after: after.scores[f.id], weightedDelta: f.included ? (after.scores[f.id] - before.scores[f.id]) * f.effectiveWeight : null })),
    }
  })
  const changed = [...baseline.leaders].sort().join(',') !== [...proposal.leaders].sort().join(',')
  return { entries, factors, included: screen.included, excluded: screen.excluded, baseline, proposal, changed, sourceSlot,
    assumptions: { rent: scenario.options[sourceSlot].rent, utilities: scenario.options[sourceSlot].utilities, targetIncome: scenario.targetIncome, dimensions: 'Standard housing templates; automatic parcel alignment; no silent resizing.' },
    explanation: !screen.included.length ? 'No ranking: all priorities are zero or usable evidence is missing.'
      : !proposal.leaders.length ? 'No standard template passes the proposal screen. Inspect the fit, overlap and use checks below; no development feasibility is implied.'
      : changed ? 'The leading template set changes under this infrastructure scenario. Inspect each template’s factor changes and eligibility checks below.'
      : 'The leading template set is unchanged. Shared access improvements can benefit every type without changing their order.',
  }
}
