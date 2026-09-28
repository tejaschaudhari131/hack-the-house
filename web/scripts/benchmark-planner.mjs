import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { evaluatePlanner, nearbyStops, preferredStop } from '../lib/plannerModel.js'
import { createPlannerEvaluator } from '../lib/plannerEvaluation.js'
import { initialStudioScenario, EXAMPLES } from '../lib/plannerState.js'
import { BUILDING_IDS } from '../lib/buildings.js'
import { prepareNetwork } from '../lib/networkModel.js'
import { geometryBounds, boundsOverlap } from '../lib/plannerGeometry.js'

// The frozen production study is a stable CPU benchmark; city transport sizes use benchmark:studio.
const raw = name => readFileSync(new URL(`../testdata/study/${name}`, import.meta.url), 'utf8')
const read = name => JSON.parse(raw(name))
const measure = (fn, count = 20) => {
  for (let i = 0; i < 3; i++) fn()
  const times = Array.from({ length: count }, () => { const start = performance.now(); fn(); return performance.now() - start }).sort((a, b) => a - b)
  return { p50Ms: +times[Math.floor(count * .5)].toFixed(2), p95Ms: +times[Math.ceil(count * .95) - 1].toFixed(2), runs: count }
}
const sourceRaw = raw('parcels.geojson'), parcels = JSON.parse(sourceRaw)
const network = read('walking-network.json'), start = performance.now(), networkContext = prepareNetwork(network), graphPreparationMs = performance.now() - start
const zoning = read('zoning.json'), stops = read('stops.geojson'), buildings = read('existing-buildings.geojson')
const result = { runtime: process.version, cpu: cpus()[0].model, scope: 'Local Node CPU benchmark; excludes network download, worker transfer, React and WebGL rendering. Not a citywide or mobile performance guarantee.', parcels: { count: parcels.features.length, sourceBytes: Buffer.byteLength(sourceRaw), sourceParse: measure(() => JSON.parse(sourceRaw)) }, graphPreparationMs: +graphPreparationMs.toFixed(2), evaluation: {} }
for (const example of EXAMPLES) {
  const feature = parcels.features.find(f => f.properties.pin === example.pin), stop = preferredStop(nearbyStops(feature, stops))
  const scenario = { ...initialStudioScenario(example.pin, feature.properties, String(stop.stop_id)), comparisonTypes: BUILDING_IDS, accessMode: 'network', additionalDepartures: 60, spareBoardings: 3 }
  const existingBuildings = buildings.features.filter(b => boundsOverlap(geometryBounds(feature.geometry), geometryBounds(b.geometry)))
  const input = { feature, stop, scenario, zoning, existingBuildings, networkContext }, evaluator = createPlannerEvaluator()
  evaluator.evaluate(input)
  let changes = 0
  result.evaluation[example.id] = { full: measure(() => evaluatePlanner(input)), prioritiesOnly: measure(() => evaluator.evaluate({ ...input, scenario: { ...scenario, weights: { ...scenario.weights, demand: ++changes % 100 } } })) }
}
console.log(JSON.stringify(result, null, 2))
