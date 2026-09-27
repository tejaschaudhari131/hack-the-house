import { BUILDINGS } from './buildings.js'

export const MODEL_VERSION = 'planner-screen-1.4'
export const EXAMPLES = [
  { id: 'hazelwood', label: 'Hazelwood', pin: '0056F00338000000', caption: 'City inventory · Hazelwood Ave' },
  { id: 'lawrenceville', label: 'Lawrenceville', pin: '0049N00010000000', caption: 'City inventory · 3480 Butler St' },
]
export const MASSING_DEFAULTS = {
  single_family: { width: 8, depth: 12 },
  townhouse_duplex: { width: 9, depth: 14 },
  triplex: { width: 10, depth: 16 },
  small_apartment: { width: 14, depth: 20 },
  large_apartment: { width: 22, depth: 30 },
}
export const PLANNER_FACTORS = [
  { id: 'demand', label: 'Household demand', short: 'Demand', source: 'Assessment sales + team lot-fit model', kind: 'Proxy' },
  { id: 'physical', label: 'Physical feasibility', short: 'Fit', source: 'County parcel outline + proposed dimensions', kind: 'Schematic' },
  { id: 'affordability', label: 'Affordability', short: 'Affordability', source: 'Proposed rent/utilities + target household income', kind: 'Assumption' },
  { id: 'displacement', label: 'Displacement risk', short: 'Displacement', source: 'ACS 2020–2024 + HUD CHAS 2018–2022', kind: 'Screen' },
  { id: 'capacity', label: 'Infrastructure capacity', short: 'Capacity', source: 'Assumed spare transit boardings + added service', kind: 'Conditional' },
  { id: 'access', label: 'Access to opportunity', short: 'Access', source: 'OSM walking graph / mapped parks + PRT stop departures', kind: 'Proxy' },
  { id: 'carbon', label: 'Marginal carbon emissions', short: 'Carbon', source: 'Existing RECS / embodied-tier / transit proxy', kind: 'Proxy' },
]
export const INITIAL_WEIGHTS = { demand: 20, physical: 15, affordability: 20, displacement: 10, capacity: 10, access: 15, carbon: 10 }

export function optionFor(typeId, rent) {
  return { typeId, ...MASSING_DEFAULTS[typeId], height: BUILDINGS[typeId].heightM, rent, utilities: 150, placement: null }
}
export function initialScenario(pin, props = {}, stopId = '') {
  // ACS gross rent includes utilities; subtract the explicit utility assumption once.
  const rent = Math.max(0, Math.round((props.median_gross_rent || 1200) - 150))
  return {
    pin, stopId, options: { A: optionFor('townhouse_duplex', rent), B: optionFor('triplex', rent) },
    // Scenario inputs, not statements about actual capacity or proposed rents.
    targetIncome: Math.round(props.median_income || 40000),
    additionalDepartures: 0, serviceHours: 15, availablePlacesPerDeparture: 20,
    spareBoardings: null, boardingsPerHome: 2,
    connections: [], parks: [], parkAccessShare: 0,
    weights: { ...INITIAL_WEIGHTS },
  }
}

export function historyFor(scenario) { return { past: [], present: scenario, future: [] } }
export function scenarioReducer(state, action) {
  if (action.type === 'undo') {
    if (!state.past.length) return state
    return { past: state.past.slice(0, -1), present: state.past.at(-1), future: [state.present, ...state.future] }
  }
  if (action.type === 'redo') {
    if (!state.future.length) return state
    return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) }
  }
  let next = state.present
  if (action.type === 'reset') next = action.scenario
  if (action.type === 'set') next = { ...next, [action.key]: action.value }
  if (action.type === 'option') next = { ...next, options: { ...next.options, [action.slot]: { ...next.options[action.slot], ...action.value } } }
  if (action.type === 'weight') next = { ...next, weights: { ...next.weights, [action.key]: action.value } }
  if (JSON.stringify(next) === JSON.stringify(state.present)) return state
  return { past: [...state.past, state.present].slice(-100), present: next, future: [] }
}

export function scenarioExport(scenario, summary) {
  return { schemaVersion: 2, modelVersion: MODEL_VERSION, dataVersion: summary?.pulled_at || null, exportedAt: new Date().toISOString(), scenario, limitations: ['Dimensions, access connectors and infrastructure buildability are user/model assumptions.', 'This model does not evaluate utilities, engineering, route schedules, travel to jobs or marginal tonnes of CO2.'] }
}
