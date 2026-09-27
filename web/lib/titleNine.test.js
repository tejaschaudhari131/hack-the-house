import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateTitleNine, housingSpec } from './titleNine.js'
import { districtStandards } from './titleNineRules.js'
import { rectangleAt, fitMassing } from './plannerGeometry.js'
import { initialStudioScenario, optionFor } from './plannerState.js'
import { evaluatePlanner } from './plannerModel.js'

function fixture(code = 'LNC') {
  const feature = { type: 'Feature', geometry: rectangleAt([-79.94, 40.41], 100, 100), properties: { pin: 'site', zoning_code: code, lot_sqft: 10000, scores: { townhouse_duplex: { demand: 75, carbon_index: 30, displacement_risk: 20 } } } }
  const zoning = { districts: { [code]: { use_table_read: true, code_section: '911.02', allowed: ['single_family', 'townhouse_duplex', 'small_apartment', 'large_apartment'], use_rows: { 'Single-Unit Detached': 'P', 'Single-Unit Attached': '', 'Two-Unit': 'P', 'Three-Unit': 'P', 'Multi-Unit': 'P' } } } }
  const option = optionFor('townhouse_duplex', 1000)
  return { feature, zoning, option, existingBuildings: [], massing: fitMassing(feature.geometry, option.width, option.depth, null, []), siteInputs: {} }
}
const rule = (input, id) => evaluateTitleNine(input).checks.find(c => c.id === id)

test('base dimensions include separate height and story limits; threshold equality is allowed', () => {
  const input = fixture()
  input.option.height = 45 * .3048
  assert.equal(rule(input, 'height').status, 'pass')
  input.option.height += .001
  assert.equal(rule(input, 'height').status, 'conflict')
  input.option.height = 10; input.option.floors = 4
  assert.equal(rule(input, 'stories').status, 'conflict')
  input.option.floors = 2.5
  assert.equal(rule(input, 'dimensions').status, 'conflict')
  assert.equal(districtStandards('RM-VH').height, 180)
  assert.equal(districtStandards('R1D-H').minLot, 1200)
  assert.equal(districtStandards('R1A-VH').minLot, null)
  assert.equal(districtStandards('SP-10'), null)
})

test('unknown code evidence is excluded, never treated as a failure or permission', () => {
  const input = fixture('SP-10'); input.zoning = {}
  const result = evaluateTitleNine(input)
  assert.equal(result.eligible, true)
  assert.equal(result.conflict, false)
  for (const id of ['use', 'district', 'overlays', 'parking-regime', 'grading', 'trees']) {
    assert.ok(result.excluded.includes(id), id)
    assert.ok(!result.assessed.includes(id), id)
  }
  input.siteInputs.overlayStatus = 'none'; input.feature.properties.sfha_overlap = .2
  assert.equal(rule(input, 'sfha_overlap').status, 'conditional')
  assert.ok(evaluateTitleNine(input).excluded.includes('sfha_overlap'))
})

test('duplex and attached house use distinct legal rows and unit counts', () => {
  const input = fixture('R1D-M')
  assert.equal(housingSpec(input.option).units, 2)
  assert.equal(rule(input, 'use').status, 'pass')
  input.option.residentialForm = 'attached'
  assert.equal(housingSpec(input.option).units, 1)
  assert.equal(rule(input, 'use').status, 'conflict')
  input.siteInputs.lotWidthFt = 35
  assert.equal(rule(input, 'attached-width').status, 'pass')
  input.siteInputs.lotWidthFt = 35.01
  assert.equal(rule(input, 'attached-width').status, 'conditional')
})

test('setback pass requires clearing every edge; frontage uncertainty is not a conflict', () => {
  const input = fixture('R1D-M')
  assert.equal(rule(input, 'setbacks').status, 'pass')
  input.massing = fitMassing(input.feature.geometry, 9, 14, { east: 44, north: 0, bearing: 0 }, [])
  assert.equal(input.massing.fits, true)
  assert.equal(rule(input, 'setbacks').status, 'unknown')
})

test('FAR and coverage include every proposal on the lot, and preserve unknown existing stock', () => {
  const input = fixture()
  input.feature.properties.lot_sqft = 3000
  const one = { option: input.option, feature: input.feature, massing: input.massing }
  input.members = [one]
  assert.equal(rule(input, 'far').status, 'pass')
  input.members = [one, one]
  assert.equal(rule(input, 'far').status, 'conflict')
  input.members = [one]; input.existingBuildings = [{ geometry: rectangleAt([-79.94, 40.41], 1, 1) }]
  assert.equal(rule(input, 'far').status, 'unknown')
  input.siteInputs.existingGfaSqft = 3000
  assert.equal(rule(input, 'far').status, 'conflict')
  input.siteInputs = {}; input.members = [one, one]
  assert.equal(rule(input, 'far').status, 'conflict', 'proposals alone already exceed FAR, even if existing GFA is unknown')
})

test('IZ aggregates the project across lots, rounds up, and excludes unmapped boundaries', () => {
  const input = fixture('RM-VH')
  const member = (typeId, pin) => ({ option: optionFor(typeId, 1000), feature: { ...input.feature, properties: { ...input.feature.properties, pin } }, izStatus: 'inside' })
  input.members = [member('small_apartment', 'site'), member('small_apartment', 'other')]
  input.siteInputs.izStatus = 'inside'
  input.projectInputs = { affordableUnits: 2 }
  assert.equal(rule(input, 'iz-units').status, 'conflict')
  input.projectInputs.affordableUnits = 3
  assert.equal(rule(input, 'iz-units').status, 'pass')
  assert.equal(rule(input, 'iz-covenant').status, 'conditional')
  input.members[1].izStatus = undefined
  assert.equal(rule(input, 'iz').status, 'unknown')
  assert.equal(rule(input, 'iz-units'), undefined)
  input.members = [member('small_apartment', 'site')]
  assert.equal(rule(input, 'iz').status, 'not_applicable')
})

test('parking and environmental thresholds require explicit inputs; zero remains a known value', () => {
  const input = fixture()
  assert.equal(rule(input, 'parking-min'), undefined)
  input.siteInputs = { parkingRegime: 'base', parkingSpaces: 0, grading: true, cutFillSlopePercent: 25, gradingClearanceFt: 5, retainingWallHeightFt: 10 }
  assert.equal(rule(input, 'parking-min').status, 'conflict')
  for (const id of ['cut-fill', 'grading-clearance', 'retaining']) assert.equal(rule(input, id).status, 'pass')
  input.siteInputs.cutFillSlopePercent = 26
  assert.equal(rule(input, 'cut-fill').status, 'conditional', 'geotechnical route is not an automatic prohibition')
  input.siteInputs.retainingWallHeightFt = 10.1
  assert.equal(rule(input, 'retaining').status, 'conflict')
  input.siteInputs.matureTreesRemoved = true; input.siteInputs.removedDiameterIn = 24; input.siteInputs.replacementDiameterIn = 23
  assert.equal(rule(input, 'tree-replacement').status, 'conflict')
})

test('protected bicycle calculation uses all provided spaces and statutory half-up rounding', () => {
  const input = fixture('RM-VH'); input.option = optionFor('small_apartment', 1000)
  input.siteInputs = { bikeSpaces: 4, protectedBikeSpaces: 2 }
  assert.equal(rule(input, 'protected-bikes').status, 'pass')
  input.siteInputs.bikeSpaces = 10
  assert.equal(rule(input, 'protected-bikes').status, 'conflict')
  input.siteInputs.protectedBikeSpaces = 6
  assert.equal(rule(input, 'protected-bikes').status, 'pass')
})

test('supported zoning and physical conflicts suppress totals regardless of priorities', () => {
  const input = fixture(), scenario = initialStudioScenario('site', input.feature.properties)
  const run = () => evaluatePlanner({ ...input, scenario, stop: null })
  assert.ok(Number.isFinite(run().proposal.townhouse_duplex.total))
  assert.ok(run().proposal.townhouse_duplex.titleNine.excluded.length > 0)
  scenario.draft.height = 30; scenario.weights = { demand: 100 }
  let result = run()
  assert.equal(result.proposal.townhouse_duplex.total, null)
  assert.equal(result.after, null)
  scenario.draft.height = 10; scenario.draft.width = 110
  assert.equal(run().proposal.townhouse_duplex.total, null)
  scenario.draft.width = 9; input.zoning.districts.LNC.use_rows['Two-Unit'] = ''
  assert.equal(run().proposal.townhouse_duplex.total, null)
})

test('each alternative rechecks placed buildings; removing the addition restores the placed-plan score', () => {
  const input = fixture(), scenario = initialStudioScenario('site', input.feature.properties)
  input.feature.properties.lot_sqft = 3000
  const areaSites = [{ id: 'placed', option: { ...optionFor('townhouse_duplex', 1000), placement: { east: -30, north: 0, bearing: 0 } }, feature: input.feature, existingBuildings: [], stop: null, targetIncome: 40000 }]
  const result = evaluatePlanner({ ...input, scenario, stop: null, areaSites })
  assert.ok(Number.isFinite(result.placedPlan.proposal.total))
  assert.equal(result.proposal.townhouse_duplex.total, null)
  assert.equal(result.proposal.townhouse_duplex.area.invalid.length, 1)
  assert.equal(result.proposal.townhouse_duplex.titleNine.checks.find(c => c.id === 'far').status, 'conflict')
  assert.ok(Number.isFinite(evaluatePlanner({ ...input, scenario, stop: null }).proposal.townhouse_duplex.total))
})
