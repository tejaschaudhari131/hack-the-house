import { haversineMeters } from './geo.js'
import { geometryCenter, fitMassing } from './plannerGeometry.js'
import { resolveZoning, unitPermission } from './zoning.js'
import { PLANNER_FACTORS } from './plannerState.js'
import { networkAccess, infrastructureReservations, validateConnection, validatePark } from './networkModel.js'
import { rankedWinner, recommendationAudit } from './plannerRecommendation.js'
import { shortlistTemplates, comparisonTemplates, summarizeShortlist } from './plannerShortlist.js'
import { evaluateTitleNine, housingSpec } from './titleNine.js'

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
  const added = proposed && (!scenario.serviceStopId || String(stop.stop_id) === scenario.serviceStopId) ? Math.max(0, scenario.additionalDepartures) : 0
  const departures = stop.weekday_trips + added
  const headway = scenario.serviceHours * 60 / departures
  const walk = networkMetric === undefined ? stop.distance / 80 : networkMetric.walkMinutes
  const wait = headway / 2
  return { departures, added, headway, walk, wait, minutes: walk + wait, score: clamp(100 * (1 - (walk + wait) / 30)), method: networkMetric === undefined ? 'straight_line' : 'network' }
}

function evaluateOption(option, feature, zoning, state, stop, proposed, massing, access) {
  const spec = housingSpec(option)
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
  const spare = numeric(state.spareBoardings) && (!state.capacityStopId || String(stop?.stop_id) === state.capacityStopId) ? state.spareBoardings : null
  // Additional places are a user assumption about available boarding capacity, not vehicle occupancy data.
  const addedPlaces = service ? service.added * state.availablePlacesPerDeparture : 0
  const supply = spare === null ? null : spare + addedPlaces
  const groupBoardings = ((state.committedUnitsByStop?.[String(stop?.stop_id)] || 0) + spec.units) * state.boardingsPerHome
  const scores = {
    demand: numeric(raw.demand) ? raw.demand : null,
    physical: !massing.fits || massing.collisions > 0 ? 0 : massing.collisions === null ? null : 100,
    affordability: burden === null ? null : clamp(100 * (.5 - burden) / .3),
    displacement: numeric(raw.displacement_risk) ? 100 - raw.displacement_risk : null,
    capacity: supply === null || !service ? null : groupBoardings > 0 ? clamp(100 * supply / groupBoardings) : 100,
    access: accessScore,
    carbon: numeric(raw.carbon_index) ? 100 - raw.carbon_index : null,
  }
  const physicalEligible = massing.fits && massing.collisions === 0
  return { ...option, pin: props.pin, label: spec.label, units: spec.units, floors: option.floors ?? spec.floors, permission, massing, scores, eligible: physicalEligible, physicalEligible, service, access, monthly, burden, demandBoardings, groupBoardings, addedPlaces, supply, raw,
    gate: !massing.fits ? 'Footprint does not fit' : massing.collisions > 0 ? 'Building or infrastructure overlap' : massing.collisions === null ? 'Building overlap check unavailable' : 'No supported conflict found',
  }
}

function screenZoningPortfolio(members, context) {
  const { zoningSites, scenario, zoning } = context
  const legalMembers = members.map(member => ({ option: member, massing: member.massing, feature: zoningSites.get(member.pin).feature, izStatus: scenario.zoningInputsByPin?.[member.pin]?.izStatus }))
  return members.map(member => {
    const site = zoningSites.get(member.pin)
    const titleNine = evaluateTitleNine({ ...site, option: member, massing: member.massing, zoning, members: legalMembers,
      siteInputs: scenario.zoningInputsByPin?.[member.pin], projectInputs: scenario.projectInputs })
    const conflict = titleNine.checks.find(c => c.status === 'conflict')
    return { ...member, titleNine, permission: titleNine.permission, eligible: member.physicalEligible && !titleNine.conflict,
      gate: !member.physicalEligible ? member.gate : conflict ? `Zoning conflict: ${conflict.label}` : `${titleNine.assessed.length} checks assessed · ${titleNine.excluded.length} not assessed` }
  })
}

function weighted(option, weights, included) {
  const denominator = included.reduce((sum, id) => sum + weights[id], 0)
  return denominator > 0 ? included.reduce((sum, id) => sum + option.scores[id] * weights[id], 0) / denominator : null
}

function screenOptions(options, context) {
  const { feature, zoning, scenario, stop, existingBuildings, reservations, infrastructureErrors, accessBefore, accessAfter, committed = { baseline: [], proposal: [] } } = context
  const baseline = {}, proposal = {}
  const ids = Object.keys(options)
  for (const slot of ids) {
    const option = options[slot]
    const massing = fitMassing(feature.geometry, option.width, option.depth, option.placement, existingBuildings)
    const proposalMassing = reservations.length ? fitMassing(feature.geometry, option.width, option.depth, option.placement, existingBuildings === null ? null : [...existingBuildings, ...reservations]) : massing
    baseline[slot] = evaluateOption(option, feature, zoning, scenario, stop, false, massing, accessBefore)
    proposal[slot] = evaluateOption(option, feature, zoning, scenario, stop, true, proposalMassing, accessAfter)
    if (infrastructureErrors.length) {
      proposal[slot].eligible = false
      proposal[slot].physicalEligible = false
      proposal[slot].scores.physical = null
      proposal[slot].gate = 'Infrastructure validation unavailable or failed — review required'
    }
  }
  for (const [state, values] of Object.entries({ baseline, proposal })) for (const slot of ids) {
      // The next building can change checks on already placed buildings (FAR, IZ, parking).
      const screened = screenZoningPortfolio([...committed[state], values[slot]], context)
      const candidate = screened.at(-1)
      values[slot] = candidate
      if (!committed[state].length) continue
      const members = screened.slice(0, -1).map(member => {
        const sameStop = member.stopId === String(stop?.stop_id)
        const groupUnits = (scenario.committedUnitsByStop?.[member.stopId] || 0) + (sameStop ? candidate.units : 0)
        const demand = groupUnits * scenario.boardingsPerHome
        const capacity = member.supply === null || !member.service ? null : demand > 0 ? clamp(100 * member.supply / demand) : 100
        return { ...member, scores: { ...member.scores, capacity } }
      })
      const portfolio = [...members, candidate], units = portfolio.reduce((n, member) => n + member.units, 0)
      candidate.siteScores = candidate.scores
      candidate.siteEligible = candidate.eligible
      candidate.area = { units, buildings: portfolio.length, parcels: new Set([...members.map(m => m.pin), feature.properties.pin]).size,
        invalid: members.filter(m => !m.eligible).map(m => ({ id: m.id, pin: m.pin, gate: m.gate })) }
      candidate.scores = Object.fromEntries(PLANNER_FACTORS.map(f => [f.id, portfolio.every(m => numeric(m.scores[f.id])) ? portfolio.reduce((n, m) => n + m.scores[f.id] * m.units, 0) / units : null]))
      candidate.eligible = portfolio.every(m => m.eligible)
      if (candidate.area.invalid.length) candidate.gate = `${candidate.area.invalid.length} placed building(s) need review`
    }
  // One evidence denominator across every candidate AND both infrastructure states.
  const included = PLANNER_FACTORS.map(f => f.id).filter(id => numeric(scenario.weights[id]) && scenario.weights[id] > 0 && [...Object.values(baseline), ...Object.values(proposal)].every(o => numeric(o.scores[id])))
  const excluded = PLANNER_FACTORS.map(f => f.id).filter(id => !included.includes(id))
  for (const values of [baseline, proposal]) for (const slot of ids) values[slot].total = values[slot].eligible ? weighted(values[slot], scenario.weights, included) : null
  return { baseline, proposal, included, excluded }
}


/** The placed plan alone, separate from the next-building alternatives. */
export function summarizePlacedPlan(committed, weights) {
  if (!committed.baseline.length) return null
  const members = [...committed.baseline, ...committed.proposal]
  const included = PLANNER_FACTORS.map(f => f.id).filter(id => weights[id] > 0 && members.every(m => numeric(m.scores[id])))
  const summaries = Object.fromEntries(['baseline', 'proposal'].map(state => {
    const options = committed[state], units = options.reduce((n, o) => n + o.units, 0)
    const scores = Object.fromEntries(PLANNER_FACTORS.map(f => [f.id, options.every(o => numeric(o.scores[f.id])) ? options.reduce((n, o) => n + o.scores[f.id] * o.units, 0) / units : null]))
    const eligible = options.every(o => o.eligible)
    return [state, { scores, units, buildings: options.length, parcels: new Set(options.map(o => o.pin)).size, eligible, total: eligible ? weighted({ scores }, weights, included) : null }]
  }))
  return { ...summaries, included }
}

export function evaluatePlanner({ feature, zoning, scenario, stop, existingBuildings = null, networkContext = null, shortlistSlot = 'B', areaSites = [] }) {
  const routed = scenario.accessMode === 'network'
  const infrastructureErrors = [...(scenario.connections || []).map(c => validateConnection(networkContext?.network, c)), ...(scenario.parks || []).map(p => validatePark(networkContext?.network, p))].filter(Boolean)
  // Route each infrastructure state once; A/B and all five templates reuse it.
  const accessBefore = routed ? networkAccess(networkContext, feature, stop, scenario, false) : undefined
  const accessAfter = routed ? networkAccess(infrastructureErrors.length ? null : networkContext, feature, stop, scenario, true) : undefined
  const reservations = infrastructureReservations(networkContext?.network, scenario)
  // Explicit, fixed placements survive changes in infrastructure. All proposed buildings
  // share the same per-stop boarding pool; reserve is not multiplied by building count.
  const committedUnitsByStop = {}
  for (const site of areaSites) committedUnitsByStop[String(site.stop?.stop_id)] = (committedUnitsByStop[String(site.stop?.stop_id)] || 0) + housingSpec(site.option).units
  const areaScenario = { ...scenario, committedUnitsByStop }
  const geometries = areaSites.map(site => ({ type: 'Feature', properties: { id: site.id }, geometry: fitMassing(site.feature.geometry, site.option.width, site.option.depth, site.option.placement, []).geometry })).filter(f => f.geometry)
  const committed = { baseline: [], proposal: [] }, routeCache = new Map()
  for (const site of areaSites) {
    const otherBuildings = site.existingBuildings === null ? null : [...site.existingBuildings, ...geometries.filter(f => f.properties.id !== site.id)]
    const stopId = String(site.stop?.stop_id)
    const ownUnits = housingSpec(site.option).units
    const siteScenario = { ...areaScenario, targetIncome: site.targetIncome, committedUnitsByStop: { ...committedUnitsByStop, [stopId]: committedUnitsByStop[stopId] - ownUnits } }
    for (const state of ['baseline', 'proposal']) {
      const isProposal = state === 'proposal'
      const key = `${site.feature.properties.pin}:${stopId}:${state}`
      if (!routeCache.has(key)) routeCache.set(key, routed ? networkAccess(isProposal && infrastructureErrors.length ? null : networkContext, site.feature, site.stop, scenario, isProposal) : undefined)
      const obstacles = otherBuildings === null ? null : [...otherBuildings, ...(isProposal ? reservations : [])]
      const massing = fitMassing(site.feature.geometry, site.option.width, site.option.depth, site.option.placement, obstacles)
      const member = evaluateOption(site.option, site.feature, zoning, siteScenario, site.stop, isProposal, massing, routeCache.get(key))
      Object.assign(member, { id: site.id, pin: site.feature.properties.pin, stopId })
      if (isProposal && infrastructureErrors.length) { member.eligible = false; member.physicalEligible = false; member.scores.physical = null; member.gate = 'Infrastructure validation unavailable or failed' }
      committed[state].push(member)
    }
  }
  const allBuildings = existingBuildings === null ? null : [...existingBuildings, ...geometries]
  const zoningSites = new Map(areaSites.map(site => [site.feature.properties.pin, site]))
  zoningSites.set(feature.properties.pin, { feature, existingBuildings })
  const context = { feature, zoning, scenario: areaScenario, stop, existingBuildings: allBuildings, zoningSites, reservations, infrastructureErrors, accessBefore, accessAfter, committed }
  for (const state of ['baseline', 'proposal']) committed[state] = screenZoningPortfolio(committed[state], context)
  const { baseline, proposal, included, excluded } = screenOptions(scenario.draft ? comparisonTemplates(scenario) : scenario.options, context)
  const sourceSlot = shortlistSlot === 'A' ? 'A' : 'B'
  const templates = scenario.draft ? comparisonTemplates(scenario) : shortlistTemplates(scenario, sourceSlot)
  const shortlist = summarizeShortlist(scenario.draft ? { baseline, proposal, included, excluded } : screenOptions(templates, context), templates, scenario, sourceSlot)
  const before = rankedWinner(baseline), after = rankedWinner(proposal)
  const changed = before !== after
  const activeId = scenario.draft?.typeId || 'A'
  const accessDelta = baseline[activeId].service && proposal[activeId].service ? baseline[activeId].service.minutes - proposal[activeId].service.minutes : null
  const infrastructureEdited = (scenario.connections?.length || 0) + (scenario.parks?.length || 0) > 0
  const result = { baseline, proposal, included, excluded, before, after, changed, accessDelta, reservations, infrastructureErrors, committed, placedPlan: summarizePlacedPlan(committed, scenario.weights), scope: areaSites.length ? 'area' : 'parcel',
    explanation: infrastructureErrors.length ? `Proposal ranking is withheld: ${[...new Set(infrastructureErrors)].join(' ')}`
      : infrastructureEdited ? `${scenario.connections?.length || 0} connection(s) and ${scenario.parks?.length || 0} park(s) are proposed. ${accessDelta === null ? 'Stop access could not be compared on this network.' : `Modeled walk + wait changes by ${round(-accessDelta)} minutes.`} ${changed ? 'The preferred option changes under these assumptions.' : 'The housing preference stays the same.'} Access benefits are shared; reserved land can change housing fit. Park access has a ${scenario.parkAccessShare || 0}% share of the access factor. Demand, rents, displacement and carbon are held unchanged.`
      : !stop ? 'No scheduled stop is available. Transit access and capacity are excluded.'
      : routed && !baseline[activeId].service ? 'The selected stop cannot be reached in the loaded walking graph. Transit access and capacity are unknown; no straight-line fallback is used.'
      : scenario.additionalDepartures === 0 ? 'No infrastructure change yet. Add departures to compare the selected housing options before and after service changes.'
      : `${scenario.additionalDepartures} proposed departures reduce modeled average walk + wait by ${round(accessDelta)} minutes. ${changed ? 'The preferred option changes under the current assumptions.' : 'The preferred housing option stays the same.'} Access gains are shared by selected types. ${scenario.spareBoardings === null ? 'Spare capacity is unknown and excluded from ranking.' : 'Capacity differences use your stated spare-boardings and per-home demand assumptions.'} Demand, affordability, displacement and carbon stay unchanged.`,
  }
  return { ...result, audit: recommendationAudit(result, scenario, feature.properties), ...(scenario.draft ? { comparison: shortlist } : { shortlist }) }
}
