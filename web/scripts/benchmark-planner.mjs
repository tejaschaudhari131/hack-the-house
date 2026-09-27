import { readFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { compactPlannerParcels } from '../lib/plannerData.js'
import { evaluatePlanner, nearbyStops, preferredStop } from '../lib/plannerModel.js'
import { initialScenario, EXAMPLES } from '../lib/plannerState.js'
import { prepareNetwork } from '../lib/networkModel.js'
import { geometryBounds, boundsOverlap } from '../lib/plannerGeometry.js'

const raw = name => readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8')
const read = name => JSON.parse(raw(name))
const measure = (fn, count = 20) => {
  for (let i = 0; i < 3; i++) fn()
  const times = Array.from({ length: count }, () => { const start = performance.now(); fn(); return performance.now() - start }).sort((a, b) => a - b)
  return { p50Ms: +times[Math.floor(count * .5)].toFixed(2), p95Ms: +times[Math.ceil(count * .95) - 1].toFixed(2), runs: count }
}
const sourceRaw = raw('parcels.geojson'), source = JSON.parse(sourceRaw), compact = compactPlannerParcels(source), compactRaw = JSON.stringify(compact)
const network = read('walking-network.json'), start = performance.now(), networkContext = prepareNetwork(network), graphPreparationMs = performance.now() - start
const zoning = read('zoning.json'), stops = read('stops.geojson'), buildings = read('existing-buildings.geojson')
const result = { runtime: process.version, cpu: cpus()[0].model, scope: 'Local Node CPU benchmark; excludes network download, worker transfer, React and WebGL rendering. Not a citywide or mobile performance guarantee.', parcels: { count: compact.features.length, sourceBytes: Buffer.byteLength(sourceRaw), compactBytes: Buffer.byteLength(compactRaw), sourceParse: measure(() => JSON.parse(sourceRaw)), compactParse: measure(() => JSON.parse(compactRaw)) }, graphPreparationMs: +graphPreparationMs.toFixed(2), evaluation: {} }
for (const example of EXAMPLES) {
  const feature = compact.features.find(f => f.properties.pin === example.pin), stop = preferredStop(nearbyStops(feature, stops))
  const scenario = { ...initialScenario(example.pin, feature.properties, String(stop.stop_id)), accessMode: 'network', additionalDepartures: 60, spareBoardings: 3 }
  const existingBuildings = buildings.features.filter(b => boundsOverlap(geometryBounds(feature.geometry), geometryBounds(b.geometry)))
  result.evaluation[example.id] = measure(() => evaluatePlanner({ feature, stop, scenario, zoning, existingBuildings, networkContext }))
}
console.log(JSON.stringify(result, null, 2))
