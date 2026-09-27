import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'
import { locateNeighborhood } from './neighborhoodLoader.js'

const DATA_DIR = path.join(process.cwd(), 'public', 'data')
const SOURCE_DIR = path.resolve(process.cwd(), '../pipeline/data/processed/parcels')
const readJson = async name => JSON.parse(await readFile(path.join(DATA_DIR,name),'utf8'))
let pending = null
const chunks = new Map()

async function metadata() {
  if (!pending) pending=Promise.all(['studio/manifest.json','zoning.json','sources.json','summary.json','stops.geojson'].map(readJson))
    .then(([manifest,zoning,sources,summary,stops])=>({manifest,zoning,sources,summary,stops}))
    .catch(error=>{pending=null; throw error})
  return pending
}

async function neighborhood(descriptor) {
  if (chunks.has(descriptor.id)) {
    const value=chunks.get(descriptor.id); chunks.delete(descriptor.id); chunks.set(descriptor.id,value); return value
  }
  const data=JSON.parse(gunzipSync(await readFile(path.join(SOURCE_DIR,`${descriptor.id}.geojson.gz`))))
  chunks.set(descriptor.id,data)
  while (chunks.size>4) chunks.delete(chunks.keys().next().value)
  return data
}

/** Rebuild explanation facts from trusted, compressed neighborhood sources, never a citywide heap. */
export async function loadServerData(input) {
  const data=await metadata()
  let descriptors
  if (input?.kind==='sites') {
    if (!input.filters.area) throw Object.assign(new Error('Choose a neighborhood before requesting a site explanation.'),{status:400})
    descriptors=data.manifest.neighborhoods.filter(n=>n.name===input.filters.area || n.area===input.filters.area)
    if (!descriptors.length) throw Object.assign(new Error('Neighborhood is not in this release.'),{status:400})
  } else {
    const pins=input?.kind==='compare' ? [input.a.pin,input.b.pin] : [input?.pin]
    const readLookup=async url=>({ok:true,json:()=>readJson(url.replace('/data/',''))})
    descriptors=(await Promise.all(pins.map(pin=>locateNeighborhood(data.manifest,pin,undefined,readLookup)))).filter(Boolean)
  }
  const unique=[...new Map(descriptors.map(n=>[n.id,n])).values()]
  const features=(await Promise.all(unique.map(neighborhood))).flatMap(c=>c.features)
  return {...data,features,byPin:new Map(features.map(f=>[f.properties.pin,f]))}
}
