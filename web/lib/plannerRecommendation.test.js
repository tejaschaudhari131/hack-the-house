import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluatePlanner, nearbyStops, preferredStop } from './plannerModel.js'
import { initialScenario, EXAMPLES } from './plannerState.js'
import { recommendationAudit, rankedWinner } from './plannerRecommendation.js'
import { prepareNetwork } from './networkModel.js'
import { geometryBounds, boundsOverlap } from './plannerGeometry.js'

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url)))

test('factor contributions exactly reconcile score gaps and infrastructure changes for both examples', () => {
  const parcels = read('parcels.geojson'), zoning = read('zoning.json'), stops = read('stops.geojson'), buildings = read('existing-buildings.geojson'), networkContext = prepareNetwork(read('walking-network.json'))
  for (const example of EXAMPLES) {
    const feature = parcels.features.find(f => f.properties.pin === example.pin), stop = preferredStop(nearbyStops(feature, stops))
    const scenario = { ...initialScenario(example.pin, feature.properties, String(stop.stop_id)), accessMode: 'network', additionalDepartures: 60, spareBoardings: 3 }
    const existingBuildings = buildings.features.filter(b => boundsOverlap(geometryBounds(feature.geometry), geometryBounds(b.geometry)))
    const result = evaluatePlanner({ feature, scenario, stop, zoning, existingBuildings, networkContext })
    for (const state of ['baseline', 'proposal']) close(result.audit.factors.reduce((sum, f) => sum + (f.gaps[state] ?? 0), 0), result[state].A.total - result[state].B.total)
    for (const slot of ['A', 'B']) close(result.audit.factors.reduce((sum, f) => sum + (f.values[slot].weightedDelta ?? 0), 0), result.proposal[slot].total - result.baseline[slot].total)
    close(result.audit.factors.reduce((sum, f) => sum + f.effectiveWeight, 0), 1)
    for (const id of ['demand', 'affordability', 'displacement', 'carbon']) close(result.audit.factors.find(f => f.id === id).values.A.weightedDelta, 0)
    assert.ok(result.audit.factors.find(f => f.id === 'access').values.A.weightedDelta > 0)
    assert.equal(result.audit.hazards.find(h => h.id === 'sfha_overlap').overlap, feature.properties.sfha_overlap)
  }
})

test('sensitivity reveals priority-dependent winners without changing eligibility or claiming confidence', () => {
  const A = { eligible: true, total: 50.6, scores: { demand: 80, affordability: 20 } }, B = { eligible: true, total: 49.4, scores: { demand: 20, affordability: 80 } }
  const result = { baseline: { A, B }, proposal: { A, B }, included: ['demand', 'affordability'] }, scenario = { weights: { demand: 51, affordability: 49 } }
  const original = JSON.stringify(result), audit = recommendationAudit(result, scenario)
  assert.equal(audit.sensitivity.proposal.cases.length, 4)
  assert.ok(audit.sensitivity.proposal.changedCases.some(c => c.factor === 'demand' && c.multiplier === .75 && c.winner === 'B'))
  assert.equal(JSON.stringify(result), original)
  assert.ok(audit.hazards.every(h => h.overlap === null && h.review))
  const failed = { ...result, proposal: { A: { ...A, eligible: false }, B } }
  assert.equal(rankedWinner(failed.proposal), 'B')
  assert.equal(recommendationAudit(failed, scenario).sensitivity.proposal.applicable, false)
})

test('missing factors and zero priorities stay excluded rather than earning zero-point evidence', () => {
  const A = { eligible: true, total: 80, scores: { demand: 80, physical: 100, capacity: null } }, B = { ...A, total: 70, scores: { ...A.scores, demand: 70 } }
  const result = { baseline: { A, B }, proposal: { A, B }, included: ['demand'] }
  const audit = recommendationAudit(result, { weights: { demand: 20, physical: 0, capacity: 10 } })
  const physical = audit.factors.find(f => f.id === 'physical'), capacity = audit.factors.find(f => f.id === 'capacity')
  assert.match(physical.exclusion, /weight is zero/)
  assert.match(capacity.exclusion, /Unknown/)
  assert.equal(capacity.values.A.weightedDelta, null)
  assert.equal(physical.gaps.proposal, null)
  assert.equal(rankedWinner({ A: { ...A, total: null }, B: { ...B, total: null } }), null)
  assert.equal(rankedWinner({ A, B: { ...B, total: A.total + .05 } }), 'tie')
})
