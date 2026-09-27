import test from 'node:test'
import assert from 'node:assert/strict'
import { TOUR_PIN, TOUR_STEPS, tourScenario, tourEvidence } from './studioTour.js'
import { initialStudioScenario, historyFor, scenarioReducer } from './plannerState.js'

const feature = { properties: { pin: TOUR_PIN, address: 'HAZELWOOD AVE', land_use: 'VACANT LAND', zoning_code: 'LNC', median_gross_rent: 900 } }
const stop = { stop_id: 'real-stop', name: 'Example stop', weekday_trips: 88 }

test('Hazelwood tour changes real scenario inputs in reproducible steps', () => {
  const steps = TOUR_STEPS.map(step => tourScenario(step.id, feature, stop))
  assert.ok(steps.every(s => s.pin === TOUR_PIN && s.accessMode === 'network'))
  assert.equal(steps[0].draft.typeId, 'single_family')
  assert.equal(steps[0].draft.rent, 750, 'starting context comes from the selected parcel')
  assert.deepEqual(steps[2].comparisonTypes, ['townhouse_duplex', 'triplex'])
  assert.ok(steps[3].weights.affordability > steps[2].weights.affordability)
  assert.ok(steps[3].weights.displacement > steps[2].weights.displacement)
  assert.equal(steps[3].additionalDepartures, 0)
  assert.equal(steps[4].additionalDepartures, 60)
  assert.equal(steps[4].serviceStopId, 'real-stop')
  steps[4].draft.width = 999
  assert.equal(tourScenario('housing', feature, stop).draft.width, 8, 'Back starts from the declared example, not later edits')
  assert.throws(() => tourScenario('site', { properties: { pin: 'other' } }, stop), /not loaded/)
  assert.equal(tourScenario('transit', feature, null).additionalDepartures, 0, 'no invented stop service when evidence is absent')
})

test('ending the temporary tour restores the entire original plan and undo/redo history', () => {
  const original = initialStudioScenario('other', {})
  original.buildings = [{ id: 'owned-site', pin: 'other', option: { ...original.draft } }]
  original.additionalDepartures = 35
  let saved = scenarioReducer(historyFor(original), { type: 'weight', key: 'demand', value: 44 })
  saved = scenarioReducer(saved, { type: 'undo' })
  const snapshot = JSON.stringify(saved)
  let temporary = scenarioReducer(saved, { type: 'restoreHistory', history: historyFor(tourScenario('transit', feature, stop)) })
  assert.equal(temporary.present.pin, TOUR_PIN)
  assert.equal(temporary.present.buildings.length, 0)
  temporary = scenarioReducer(temporary, { type: 'restoreHistory', history: saved })
  assert.equal(temporary, saved)
  assert.equal(JSON.stringify(temporary), snapshot)
  assert.equal(scenarioReducer(temporary, { type: 'redo' }).present.weights.demand, 44)
})

test('tour narration uses computed scores and access, never canned winners or benefits', () => {
  const result = { proposal: { single_family: { label: 'Single-family', eligible: false, total: null, gate: 'Footprint does not fit' } } }
  assert.match(tourEvidence('housing', feature, result, stop), /Footprint does not fit/)
  assert.match(tourEvidence('transit', feature, result, stop), /not assessed/)
  result.baseline = { single_family: { service: { minutes: 12.9 } } }
  result.proposal.single_family.service = { minutes: 10.8, added: 60 }
  assert.match(tourEvidence('transit', feature, result, stop), /88 scheduled \+ 60 assumed.*12.9 → 10.8/)
})
