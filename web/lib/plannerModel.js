import { BUILDINGS } from './buildings.js'
import { haversineMeters } from './geo.js'
import { geometryCenter, fitMassing } from './plannerGeometry.js'
import { resolveZoning, unitPermission } from './zoning.js'
import { PLANNER_FACTORS } from './plannerState.js'
import { networkAccess, infrastructureReservations, validateConnection, validatePark } from './networkModel.js'
import { rankedWinner, recommendationAudit } from './plannerRecommendation.js'

const clamp = value => Math.max(0, Math.min(100, value))
const numeric = value => typeof value === 'number' && Number.isFinite(value)
export const round = value => numeric(value) ? Math.round(value * 10) / 10 : null

export function nearbyStops(feature, stops) {
  const point = geometryCenter(feature.geometry)
  if (!point) return []
  return (stops?.features || []).filter(f => f.geometry?.type === 'Point' && f.properties.weekday_trips > 0).map(f => ({
    ...f.properties, coordinates: f.geometry.coordinates,
    distance: haversineMeters(...point, ...f.geometry.coordinates),
  })).filter(stop => stop.distance <= 1200).sort((a, b) => a.distance - b.distance)
}

export function preferredStop(stops) { return stops.find(s => s.weekday_trips >= 60) || stops[0] || null }

/** One existing stop only: never sum the same trip at multiple stops. No route or timetable claim. */
export function serviceMetrics(stop, scenario, proposed, networkMetric = undefined) {
  if (!stop || !numeric(stop.weekday_trips) || stop.weekday_trips <= 0) return null
  if (networkMetric !== undefined && !numeric(networkMetric.walkMinutes)) return null
  const added = proposed ? Math.max(0, scenario.additionalDepartures) : 0
  const departures = stop.weekday_trips + added
  const headway = scenario.serviceHours * 60 / departures
  const walk = networkMetric === undefined ? stop.distance / 80 : networkMetric.walkMinutes
  const wait = headway / 2
  return { departures, added, headway, walk, wait, minutes: walk + wait, score: clamp(100 * (1 - (walk + wait) / 30)), method: networkMetric === undefined ? 'straight_line' : 'network' }
}

function evaluateOption(option, feature, zoning, state, stop, proposed, massing, access) {
  const spec = BUILDINGS[option.typeId]
  if (!spec) throw new Error('Unknown building type')
  const props = feature.properties, raw = props.scores?.[spec.scoreType] || {}
  const permission = unitPermission(spec.scoreType, spec.useRow, resolveZoning(props.zoning_code, zoning), spec.units)
  const service = serviceMetrics(stop, state, proposed, access)
  const parkShare = access ? Math.max(0, Math.min(100, state.parkAccessShare || 0)) / 100 : 0
  const transitScore = service?.score ?? null, parkScore = access?.parkScore ?? null
  const accessScore = (parkShare < 1 && transitScore === null) || (parkShare > 0 && parkScore === null) ? null : (1 - parkShare) * (transitScore || 0) + parkShare * (parkScore || 0)
  const monthly = option.rent + option.utilities
  const burden = state.targetIncome > 0 ? monthly * 12 / state.targetIncome : null
  const demandBoardings = spec.units * state.boardingsPerHome
  const spare = numeric(state.spareBoardings) ? state.spareBoardings : null
  // Additional places are a user assumption about available boarding capacity, not vehicle occupancy data.
  const addedPlaces = service ? service.added * state.availablePlacesPerDeparture : 0
  const supply = spare === null ? null : spare + addedPlaces
  const scores = {
    demand: numeric(raw.demand) ? raw.demand : null,
    physical: !massing.fits || massing.collisions > 0 ? 0 : massing.collisions === null ? null : 100,
    affordability: burden === null ? null : clamp(100 * (.5 - burden) / .3),
    displacement: numeric(raw.displacement_risk) ? 100 - raw.displacement_risk : null,
    capacity: supply === null || !service ? null : demandBoardings > 0 ? clamp(100 * supply / demandBoardings) : 100,
    access: accessScore,
    carbon: numeric(raw.carbon_index) ? 100 - raw.carbon_index : null,
  }
  const eligible = massing.fits && massing.collisions === 0 && permission.category === 'permitted'
  return { ...option, label: spec.label, units: spec.units, floors: spec.floors, permission, massing, scores, eligible, service, access, monthly, burden, demandBoardings, addedPlaces, supply, raw,
    gate: !massing.fits ? 'Footprint needs review' : massing.collisions > 0 ? 'Building or infrastructure overlap — review required' : massing.collisions === null ? 'Building overlap check unavailable' : permission.category !== 'permitted' ? permission.label : 'Passes outline + mapped-building + use screen',
  }
}

function weighted(option, weights, included) {
  const denominator = included.reduce((sum, id) => sum + weights[id], 0)
  return denominator > 0 ? included.reduce((sum, id) => sum + option.scores[id] * weights[id], 0) / denominator : null
}

export function evaluatePlanner({ feature, zoning, scenario, stop, existingBuildings = null, networkContext = null }) {
  const routed = scenario.accessMode === 'network'
  const infrastructureErrors = [...(scenario.connections || []).map(c => validateConnection(networkContext?.network, c)), ...(scenario.parks || []).map(p => validatePark(networkContext?.network, p))].filter(Boolean)
  const accessBefore = routed ? networkAccess(networkContext, feature, stop, scenario, false) : undefined
  const accessAfter = routed ? networkAccess(infrastructureErrors.length ? null : networkContext, feature, stop, scenario, true) : undefined
  const reservations = infrastructureReservations(networkContext?.network, scenario)
  const massingFor = proposed => Object.fromEntries(['A', 'B'].map(slot => [slot, fitMassing(feature.geometry, scenario.options[slot].width, scenario.options[slot].depth, scenario.options[slot].placement, existingBuildings === null ? null : [...existingBuildings, ...(proposed ? reservations : [])])]))
  const massing = massingFor(false), proposalMassing = reservations.length ? massingFor(true) : massing
  const baseline = {}, proposal = {}
  for (const slot of ['A', 'B']) {
    baseline[slot] = evaluateOption(scenario.options[slot], feature, zoning, scenario, stop, false, massing[slot], accessBefore)
    proposal[slot] = evaluateOption(scenario.options[slot], feature, zoning, scenario, stop, true, proposalMassing[slot], accessAfter)
    if (infrastructureErrors.length) {
      proposal[slot].eligible = false
      proposal[slot].scores.physical = null
      proposal[slot].gate = 'Infrastructure validation unavailable or failed — review required'
    }
  }
  // Shared coverage across both housing alternatives AND both infrastructure states.
  const included = PLANNER_FACTORS.map(f => f.id).filter(id => numeric(scenario.weights[id]) && scenario.weights[id] > 0 && [baseline.A, baseline.B, proposal.A, proposal.B].every(o => numeric(o.scores[id])))
  const excluded = PLANNER_FACTORS.map(f => f.id).filter(id => !included.includes(id))
  for (const options of [baseline, proposal]) for (const slot of ['A', 'B']) options[slot].total = weighted(options[slot], scenario.weights, included)
  const before = rankedWinner(baseline), after = rankedWinner(proposal)
  const changed = before !== after
  const accessDelta = baseline.A.service && proposal.A.service ? baseline.A.service.minutes - proposal.A.service.minutes : null
  const infrastructureEdited = (scenario.connections?.length || 0) + (scenario.parks?.length || 0) > 0
  const result = { baseline, proposal, included, excluded, before, after, changed, accessDelta, reservations, infrastructureErrors,
    explanation: infrastructureErrors.length ? `Proposal ranking is withheld: ${[...new Set(infrastructureErrors)].join(' ')}`
      : infrastructureEdited ? `${scenario.connections?.length || 0} connection(s) and ${scenario.parks?.length || 0} park(s) are proposed. ${accessDelta === null ? 'Stop access could not be compared on this network.' : `Modeled walk + wait changes by ${round(-accessDelta)} minutes.`} ${changed ? 'The preferred option changes under these assumptions.' : 'The housing preference stays the same.'} Access benefits are shared; reserved land can change housing fit. Park access has a ${scenario.parkAccessShare || 0}% share of the access factor. Demand, rents, displacement and carbon are held unchanged.`
      : !stop ? 'No scheduled stop is available. Transit access and capacity are excluded.'
      : routed && !baseline.A.service ? 'The selected stop cannot be reached in the loaded walking graph. Transit access and capacity are unknown; no straight-line fallback is used.'
      : scenario.additionalDepartures === 0 ? 'No infrastructure change yet. Add departures to compare the same two housing options before and after service changes.'
      : `${scenario.additionalDepartures} proposed departures reduce modeled average walk + wait by ${round(accessDelta)} minutes. ${changed ? 'The preferred option changes under the current assumptions.' : 'The preferred housing option stays the same.'} Access gains are shared by both options. ${scenario.spareBoardings === null ? 'Spare capacity is unknown and excluded from ranking.' : 'Capacity differences use your stated spare-boardings and per-home demand assumptions.'} Demand, affordability, displacement and carbon stay unchanged.`,
  }
  return { ...result, audit: recommendationAudit(result, scenario, feature.properties) }
}
