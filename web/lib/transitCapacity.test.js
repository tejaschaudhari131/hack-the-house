import test from 'node:test'
import assert from 'node:assert/strict'
import { transitReserve, evaluatePlanner } from './plannerModel.js'
import { initialStudioScenario } from './plannerState.js'
import { rectangleAt } from './plannerGeometry.js'

function input(trips = 20) {
  const feature = { properties: { pin: 'capacity-fixture', scores: { large_apartment: { demand: 50 } } }, geometry: rectangleAt([-79.95, 40.45], 100, 100) }
  const scenario = initialStudioScenario(feature.properties.pin)
  scenario.draft = { ...scenario.draft, typeId: 'large_apartment', width: 22, depth: 30 }
  scenario.weights = { capacity: 100 }
  return { feature, scenario, stop: { stop_id: '1', weekday_trips: trips, distance: 80 }, zoning: { districts: {} }, existingBuildings: [] }
}

test('new Studio scenarios use actual stop frequency and disclose the assumed reserve', () => {
  const a = input(20), b = input(40)
  const low = evaluatePlanner(a), high = evaluatePlanner(b)
  assert.ok(low.included.includes('capacity'))
  assert.equal(low.baseline.large_apartment.reserve.method, 'schedule_assumption')
  assert.equal(low.baseline.large_apartment.supply, 20)
  assert.equal(low.baseline.large_apartment.scores.capacity, 25)
  assert.equal(high.baseline.large_apartment.scores.capacity, 50)
  a.scenario.additionalDepartures = 2
  assert.equal(evaluatePlanner(a).proposal.large_apartment.scores.capacity, 75)
})

test('manual zero is evidence of an assumed zero reserve, while blank manual mode is unknown', () => {
  const { scenario, stop } = input()
  scenario.spareBoardings = 0
  assert.deepEqual(transitReserve(stop, scenario), { boardings: 0, method: 'manual' })
  scenario.spareBoardings = null
  scenario.capacityMode = 'manual'
  assert.equal(transitReserve(stop, scenario).boardings, null)
  scenario.capacityMode = 'schedule'
  scenario.baselinePlacesPerDeparture = 0
  assert.equal(transitReserve(stop, scenario).boardings, 0)
})

test('reserve overrides stay at their own stop; missing schedules never create capacity', () => {
  const { scenario, stop } = input()
  Object.assign(scenario, { spareBoardings: 500, capacityStopId: 'other' })
  assert.equal(transitReserve(stop, scenario).boardings, 20)
  assert.equal(transitReserve(null, scenario).boardings, null)
  assert.equal(transitReserve({ ...stop, weekday_trips: 0 }, scenario).boardings, null)
  const unrouted = input()
  unrouted.scenario.accessMode = 'network'
  assert.equal(evaluatePlanner(unrouted).baseline.large_apartment.scores.capacity, null)
})
