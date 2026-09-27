import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { performance } from 'node:perf_hooks'
import { cpus } from 'node:os'
import { prepareStudioData } from './prepare-studio-data.mjs'
import { EXAMPLES } from '../lib/plannerState.js'
import { spatialIndex } from '../lib/studioData.js'
import { geometryBounds } from '../lib/plannerGeometry.js'

const { manifest, chunks } = await prepareStudioData()
const read = name => readFileSync(new URL(`../public/data/${name}`, import.meta.url))
const shared = ['neighborhoods.geojson', 'stops.geojson', 'zoning.json', 'summary.json', 'existing-buildings.sources.json', 'walking-network.json', 'walking-network.sources.json'].map(read)
const bytes = buffers => ({ rawMB: +(buffers.reduce((n, b) => n + b.length, 0) / 1e6).toFixed(3), gzipMB: +(buffers.reduce((n, b) => n + gzipSync(b).length, 0) / 1e6).toFixed(3) })
const measure = (fn, runs = 20) => {
  for (let n = 0; n < 3; n++) fn()
  const times = Array.from({ length: runs }, () => { const start = performance.now(); fn(); return performance.now() - start }).sort((a, b) => a - b)
  return { p50Ms: +times[Math.floor(runs * .5)].toFixed(3), p95Ms: +times[Math.ceil(runs * .95) - 1].toFixed(3) }
}
const oldParcels = read('parcels.geojson'), oldBuildings = read('existing-buildings.geojson')
const result = {
  runtime: process.version, cpu: cpus()[0].model,
  scope: 'Local Node CPU and file-size comparison. Includes the shared routing graph. Excludes basemap tiles, JS/CSS, browser rendering and additional neighborhoods loaded after camera movement; gzip sizes assume compressed delivery. Not a browser frame-rate or citywide load test.',
  previousStartup: bytes([...shared, oldParcels, oldBuildings]),
  previousParcelAndBuildingParse: measure(() => { JSON.parse(oldParcels); JSON.parse(oldBuildings) }),
  examples: {},
}
for (const example of EXAMPLES) {
  const id = manifest.catalogue.find(p => p[0] === example.pin)[2], chunk = chunks.find(c => c.id === id)
  const index = spatialIndex(chunk.data.buildings.features), selected = chunk.data.parcels.features.find(f => f.properties.pin === example.pin)
  result.examples[example.id] = {
    startup: bytes([...shared, Buffer.from(JSON.stringify(manifest)), Buffer.from(chunk.content)]),
    neighborhoodParse: measure(() => JSON.parse(chunk.content)),
    nearbyBuildingQuery: measure(() => index.query(geometryBounds(selected.geometry))),
  }
}
console.log(JSON.stringify(result, null, 2))
