import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { geometryBounds, boundsOverlap } from '../lib/plannerGeometry.js'
import { colorBuildingUses } from '../lib/buildingUses.js'
import { collection, neighborhoodId, spatialIndex } from '../lib/studioData.js'

// Legacy study partitioner retained for transport-parity regression tests.
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

const CHUNK_BYTES = 12 * 1024 * 1024
const fc = collection
const json = async url => JSON.parse(await readFile(url, 'utf8'))
const gz = async url => JSON.parse(gunzipSync(await readFile(url)))
const hash = content => createHash('sha256').update(content).digest('hex').slice(0, 16)

export function regionalNetwork(network, bounds, buffer = .036) {
  const box = [bounds[0] - buffer / .76, bounds[1] - buffer, bounds[2] + buffer / .76, bounds[3] + buffer]
  const inside = p => p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]
  // Keep complete edges touching the buffer and remap indices. Shared OSM nodes
  // remain shared; clipping must never create a new intersection or shortcut.
  const edges = network.edges.filter(e => inside(network.nodes[e[0]]) || inside(network.nodes[e[1]]))
  const used = new Set(edges.flatMap(e => e.slice(0, 2))), indices = new Map([...used].sort((a,b) => a-b).map((id,i) => [id,i]))
  const parks = network.parks.map(p => ({ ...p, nodes: p.nodes.filter(n => indices.has(n)).map(n => indices.get(n)) })).filter(p => p.nodes.length)
  return { schemaVersion: network.schemaVersion, nodes: [...indices.keys()].map(i => network.nodes[i]), ground: [...indices.keys()].map(i => network.ground[i]), edges: edges.map(([a,b,...attributes]) => [indices.get(a),indices.get(b),...attributes]), parks }
}

export async function prepareStudioData() {
  const root = new URL('../public/data/', import.meta.url), destination = new URL('studio/', root)
  const source = new URL('../../pipeline/data/processed/', import.meta.url)
  const neighborhoods = await json(new URL('neighborhoods.geojson', root))
  if (neighborhoods.features.length !== 90) throw new Error('City release requires all 90 neighborhoods')
  // Remove obsolete hashed outputs: a local rebuild must match a clean deployment.
  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  const write = async (prefix, payload) => {
    const content = JSON.stringify(payload), file = `${prefix}.${hash(content)}.json`
    await writeFile(new URL(file,destination),content)
    return { file, bytes: Buffer.byteLength(content) }
  }
  const writeParts = async (prefix, features) => {
    const files = [], sizes = []; let batch = [], bytes = 50
    async function flush() {
      const part = await write(prefix,fc(batch)); files.push(part.file); sizes.push(part.bytes); batch=[]; bytes=50
    }
    for (const feature of features) {
      const size=Buffer.byteLength(JSON.stringify(feature))+1
      if (bytes+size > CHUNK_BYTES && batch.length) await flush()
      batch.push(feature); bytes+=size
    }
    if (batch.length || !files.length) await flush()
    return { files, sizes }
  }
  const uses = new Map(), pinLookup = {}, descriptors = []
  for (const n of neighborhoods.features) {
    const id=neighborhoodId(n.properties.name), data=await gz(new URL(`parcels/${id}.geojson.gz`, source))
    for (const f of data.features) {
      const p=f.properties
      uses.set(p.pin,{properties:{land_use:p.land_use,land_use_class:p.land_use_class}})
      ;(pinLookup[p.pin.slice(0,3)] ||= {})[p.pin]=id
    }
  }
  const buildings = colorBuildingUses(await gz(new URL('existing-buildings.geojson.gz',source)),uses), index=spatialIndex(buildings.features)
  const network=await gz(new URL('walking-network.json.gz',source)), networkFiles=new Map()
  // Share nine buffered regional graphs instead of duplicating a large graph 90 times.
  const cityBoxes=neighborhoods.features.map(f=>geometryBounds(f.geometry))
  const city=[Math.min(...cityBoxes.map(b=>b[0])),Math.min(...cityBoxes.map(b=>b[1])),Math.max(...cityBoxes.map(b=>b[2])),Math.max(...cityBoxes.map(b=>b[3]))]
  const areaRegions=new Map(), regions=new Map()
  for (const area of new Set(neighborhoods.features.map(f=>f.properties.group))) {
    const boxes=neighborhoods.features.filter(f=>f.properties.group===area).map(f=>geometryBounds(f.geometry))
    const bounds=[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))]
    const x=Math.min(2,Math.floor(((bounds[0]+bounds[2])/2-city[0])/(city[2]-city[0])*3))
    const y=Math.min(2,Math.floor(((bounds[1]+bounds[3])/2-city[1])/(city[3]-city[1])*3))
    const region=`region-${x}-${y}`; areaRegions.set(area,region)
    if (!regions.has(region)) regions.set(region,[])
    regions.get(region).push(bounds)
  }
  const manifest={version:2, neighborhoods:descriptors, pinLookup:{}, parcelCount:uses.size, buildingCount:buildings.features.length, maximumFileBytes:0}
  for (const n of neighborhoods.features) {
    const name=n.properties.name, id=neighborhoodId(name), area=n.properties.group
    const parcels=await gz(new URL(`parcels/${id}.geojson.gz`,source))
    const boxes=[geometryBounds(n.geometry), ...parcels.features.map(f=>geometryBounds(f.geometry))]
    const bounds=[Math.min(...boxes.map(b=>b[0])), Math.min(...boxes.map(b=>b[1])), Math.max(...boxes.map(b=>b[2])), Math.max(...boxes.map(b=>b[3]))]
    const footprints=index.query(bounds)
    const p=await writeParts(`${id}-parcels`,parcels.features), b=await writeParts(`${id}-buildings`,footprints)
    const region=areaRegions.get(area)
    if (!networkFiles.has(region)) {
      const groupBounds=regions.get(region)
      const extent=[Math.min(...groupBounds.map(b=>b[0])),Math.min(...groupBounds.map(b=>b[1])),Math.max(...groupBounds.map(b=>b[2])),Math.max(...groupBounds.map(b=>b[3]))]
      const local=regionalNetwork(network,extent)
      const graph=await write(`${region}-network`,local)
      const segments=new Map(local.edges.map(([a,b])=>[[Math.min(a,b),Math.max(a,b)].join(':'),[local.nodes[a],local.nodes[b]]]))
      const display=fc([{type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:[...segments.values()]}}])
      const lines=await write(`${region}-roads`,display)
      networkFiles.set(region,{networkFile:graph.file,roadsFile:lines.file,networkBytes:graph.bytes,roadsBytes:lines.bytes})
    }
    const favorite={'Hazelwood':'0056F00338000000','Lower Lawrenceville':'0049N00010000000'}[name]
    const example=parcels.features.find(f=>f.properties.pin===favorite) || parcels.features.find(f=>f.properties.vacant_lot && f.properties.lot_sqft>=3500 && f.properties.lot_sqft<30000 && f.properties.zoning_code) || parcels.features[0]
    const descriptor={id,name,area,bounds,viewBounds:geometryBounds(n.geometry),examplePin:example?.properties.pin || null,parcels:parcels.features.length,buildings:footprints.length,parcelFiles:p.files,buildingFiles:b.files,bytes:[...p.sizes,...b.sizes].reduce((a,b)=>a+b,0),...networkFiles.get(region)}
    descriptors.push(descriptor)
    manifest.maximumFileBytes=Math.max(manifest.maximumFileBytes,...p.sizes,...b.sizes,descriptor.networkBytes,descriptor.roadsBytes)
    console.log(`${name}: ${descriptor.parcels} parcels; ${(descriptor.bytes/1e6).toFixed(2)} MB split transport`)
  }
  for (const [prefix,rows] of Object.entries(pinLookup)) {
    const part=await write(`pins-${prefix.toLowerCase()}`,rows)
    manifest.pinLookup[prefix]=part.file
    manifest.maximumFileBytes=Math.max(manifest.maximumFileBytes,part.bytes)
  }
  if (manifest.maximumFileBytes > 50_000_000) throw new Error('A transport file exceeds 50 MB; partition it before release')
  const content=JSON.stringify(manifest)
  await writeFile(new URL('manifest.json',destination),content)
  console.log(`Manifest ${Buffer.byteLength(content)} bytes; largest transport file ${manifest.maximumFileBytes} bytes; ${manifest.parcelCount} parcels across ${descriptors.length} neighborhoods.`)
  return {manifest}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareStudioData()
