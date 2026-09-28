import { EXAMPLES, initialStudioScenario, optionFor } from './plannerState.js'
import { STUDIO_PRESETS } from './studioPresentation.js'

export const TOUR_PIN = EXAMPLES[0].pin
export const TOUR_STEPS = [
  { id: 'site', title: 'Start with a real Hazelwood parcel', target: 'site-facts', tool: 'housing', tab: 'edit',
    text: 'This Hazelwood Avenue lot is recorded as vacant. Compare its recorded use with its mapped zoning: existing use and permission to build are different. This temporary example will not change your saved-in-session plan.' },
  { id: 'housing', title: 'Try a single-family house', target: 'housing', tool: 'housing', tab: 'edit',
    text: 'We preview an 8 × 12 m house on this lot. The dimensions are assumptions. Green means no supported conflict was found; it does not mean every code requirement has been checked.' },
  { id: 'compare', title: 'Compare three housing choices', target: 'comparison', tool: 'compare', tab: 'rankings',
    text: 'Now compare that house with a duplex and triplex on the same parcel. Read the factor differences. A “No score” result applies to the tested proposal; its blocker explains what needs to change.' },
  { id: 'priorities', title: 'Try resident priorities', target: 'inspector', tool: 'housing', tab: 'priorities',
    text: 'We switch to the Resident preset: affordability and displacement matter more, market fit less. These priorities are value judgments. The data stays the same, and the leading option may or may not change.' },
  { id: 'transit', title: 'Test more bus service', target: 'inspector', tool: 'service', tab: 'edit',
    text: 'We add 60 hypothetical weekday departures at an existing nearby stop. Compare walking plus waiting before and after. Scheduled service is evidence; the additional departures and even spacing are assumptions.' },
  { id: 'finish', title: 'Take this workflow to your own parcel', target: 'comparison', tool: 'housing', tab: 'rankings',
    text: 'Pick your parcel, compare housing, adjust dimensions and priorities, then test infrastructure. Export your scenario before reloading. Finish or skip to restore the plan you had before this example.' },
]

/** Rebuild each step deterministically so Back never accumulates demo edits. */
export function tourScenario(stepId, feature, stop) {
  if (feature.properties.pin !== TOUR_PIN) throw new Error('The Hazelwood example parcel is not loaded.')
  const index = TOUR_STEPS.findIndex(step => step.id === stepId)
  if (index < 0) throw new Error('Unknown tour step')
  const scenario = initialStudioScenario(TOUR_PIN, feature.properties, String(stop?.stop_id || ''))
  scenario.accessMode = 'network'
  scenario.draft = optionFor('single_family', scenario.draft.rent)
  if (index >= 2) scenario.comparisonTypes = ['townhouse_duplex', 'triplex']
  if (index >= 3) scenario.weights = { ...STUDIO_PRESETS.find(p => p.id === 'resident').weights }
  if (index >= 4 && stop) { scenario.additionalDepartures = 60; scenario.serviceStopId = String(stop.stop_id) }
  return scenario
}

export function tourEvidence(stepId, feature, result, stop) {
  const p = feature.properties, proposal = result?.proposal?.single_family
  const show = n => Number.isFinite(n) ? n.toFixed(1) : 'not assessed'
  if (stepId === 'site') return `${p.address || p.pin} · ${p.land_use || 'Use unknown'} · ${p.zoning_code || 'Zoning unknown'}`
  if (stepId === 'housing') return proposal ? `${proposal.label}: ${proposal.eligible ? `${show(proposal.total)} / 100 · assessed rules only` : proposal.gate}` : 'Waiting for the parcel calculation.'
  if (stepId === 'transit') {
    const before = result?.baseline?.single_family?.service, after = proposal?.service
    return before && after ? `${stop.name}: ${stop.weekday_trips} scheduled + ${after.added} assumed departures/day. Walk + wait: ${show(before.minutes)} → ${show(after.minutes)} min.` : 'Transit access is not assessed: the required stop or walking evidence is unavailable.'
  }
  return result?.comparison?.entries.map(entry => `${entry.proposal.label}: ${entry.proposal.eligible ? show(entry.proposal.total) : `No score (${entry.proposal.gate})`}`).join(' · ') || 'Waiting for the parcel calculation.'
}
