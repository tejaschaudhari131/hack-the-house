import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { geometryBounds, boundsOverlap } from '../lib/plannerGeometry.js'
import { colorBuildingUses } from '../lib/buildingUses.js'
import { collection, neighborhoodId } from '../lib/studioData.js'

// Derived transport files only: original source records and Explorer stay unchanged.
export function partitionStudioData(parcels, buildings, neighborhoods) {
  const colored = colorBuildingUses(buildings, new Map(parcels.features.map(f => [f.properties.pin, f])))
  const buildingBounds = colored.features.map(feature => ({ feature, bounds: geometryBounds(feature.geometry) }))
  const chunks = [], catalogue = [], descriptors = []
  for (const neighborhood of neighborhoods.features) {
    const name = neighborhood.properties.name, id = neighborhoodId(name)
    const features = parcels.features.filter(f => f.properties.neighborhood === name)
    if (!features.length) continue
    const boxes = [geometryBounds(neighborhood.geometry), ...features.map(f => geometryBounds(f.geometry))]
    const bounds = [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))]
    // Include every recorded outline intersecting the extent, including unlinked
    // buildings and adjacent-neighborhood footprints crossing a parcel boundary.
    const chunk = { parcels: collection(features), buildings: collection(buildingBounds.filter(b => boundsOverlap(bounds, b.bounds)).map(b => b.feature)) }
    const content = JSON.stringify(chunk), hash = createHash('sha256').update(content).digest('hex').slice(0, 16)
    const file = `${id}.${hash}.json`
    descriptors.push({ id, name, area: neighborhood.properties.group, bounds, file, parcels: features.length, buildings: chunk.buildings.features.length, bytes: Buffer.byteLength(content) })
    chunks.push({ id, file, content, data: chunk })
    for (const f of features) catalogue.push([f.properties.pin, f.properties.address || '', id])
  }
  return { manifest: { version: 1, neighborhoods: descriptors, catalogue }, chunks }
}

export async function prepareStudioData() {
  const root = new URL('../public/data/', import.meta.url), destination = new URL('studio/', root)
  const [parcels, buildings, neighborhoods] = await Promise.all(['parcels.geojson', 'existing-buildings.geojson', 'neighborhoods.geojson'].map(async name => JSON.parse(await readFile(new URL(name, root), 'utf8'))))
  const result = partitionStudioData(parcels, buildings, neighborhoods)
  await mkdir(destination, { recursive: true })
  for (const chunk of result.chunks) await writeFile(new URL(chunk.file, destination), chunk.content)
  await writeFile(new URL('manifest.json', destination), JSON.stringify(result.manifest))
  console.log(`Prepared ${result.chunks.length} Studio neighborhood chunks; source files unchanged.`)
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareStudioData()
