import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { compactPlannerParcels, PLANNER_PROPERTIES, PLANNER_SCORES } from '../lib/plannerData.js'

const data = new URL('../public/data/', import.meta.url)
const source = await readFile(new URL('parcels.geojson', data))
const compact = compactPlannerParcels(JSON.parse(source))
const output = JSON.stringify(compact)
const hash = value => createHash('sha256').update(value).digest('hex')
await writeFile(new URL('planner-parcels.geojson', data), output)
await writeFile(new URL('planner-parcels.sources.json', data), JSON.stringify({
  schemaVersion: 1, source: '/data/parcels.geojson', sourceSha256: hash(source), sha256: hash(output),
  count: compact.features.length, sourceBytes: source.length, outputBytes: Buffer.byteLength(output),
  properties: PLANNER_PROPERTIES, scoreFields: PLANNER_SCORES,
  transformation: 'Property projection only. All source parcels and coordinates retained without simplification or rounding.',
}, null, 2))
console.log(`Planner parcels: ${compact.features.length.toLocaleString()} retained, ${(Buffer.byteLength(output) / 1e6).toFixed(2)} MB (${(100 * (1 - Buffer.byteLength(output) / source.length)).toFixed(1)}% smaller).`)
