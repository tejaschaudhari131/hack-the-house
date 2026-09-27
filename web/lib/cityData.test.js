import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { prepareStudioData } from '../scripts/prepare-studio-data.mjs'
import { loadNeighborhood, locateNeighborhood } from './neighborhoodLoader.js'
import { PITTSBURGH_NEIGHBORHOODS } from './pittsburgh.js'

test('all city chunks preserve canonical parcel evidence and hashes, with bounded files and valid routing indices',async()=>{
 const {manifest}=await prepareStudioData(), pins=new Set(),files=new Set()
 const fetcher=async url=>({ok:true,json:async()=>JSON.parse(await readFile(new URL(`../public${url}`,import.meta.url)))})
 assert.deepEqual(manifest.neighborhoods.map(n=>n.name).sort(),[...PITTSBURGH_NEIGHBORHOODS].sort())
 assert.equal(manifest.catalogue,undefined)
 assert.ok(Buffer.byteLength(JSON.stringify(manifest))<150000)
 for(const n of manifest.neighborhoods) {
   const source=JSON.parse(gunzipSync(await readFile(new URL(`../../pipeline/data/processed/parcels/${n.id}.geojson.gz`,import.meta.url))))
   const actual=await loadNeighborhood(n,undefined,fetcher,false)
   assert.deepEqual(actual.parcels,source,n.name)
   assert.equal(actual.parcels.features.length,n.parcels)
   assert.ok(n.parcels>0,n.name)
   for(const f of actual.parcels.features){assert.equal(f.properties.neighborhood,n.name);assert.ok(!pins.has(f.properties.pin));pins.add(f.properties.pin);assert.ok(f.properties.scores && f.properties.factors);assert.ok('confidence' in f.properties)}
   assert.equal((await locateNeighborhood(manifest,n.examplePin,undefined,fetcher)).id,n.id)
   for(const file of [...n.parcelFiles,...n.buildingFiles,n.networkFile,n.roadsFile])files.add(file)
 }
 for(const file of Object.values(manifest.pinLookup))files.add(file)
 for(const file of files) {
   const raw=await readFile(new URL(`../public/data/studio/${file}`,import.meta.url))
   assert.ok(raw.length<50000000,file)
   assert.equal(file.split('.').at(-2),createHash('sha256').update(raw).digest('hex').slice(0,16))
   if(file.includes('-network.')){
     const g=JSON.parse(raw)
     assert.equal(g.ground.length,g.nodes.length)
     for(const [a,b,cost] of g.edges){assert.ok(g.nodes[a]&&g.nodes[b]);assert.ok(Number.isFinite(cost)&&cost>=0)}
     for(const park of g.parks)for(const n of park.nodes)assert.ok(g.nodes[n])
   }
 }
 assert.equal(pins.size,manifest.parcelCount)
 assert.ok(pins.size>100000)
})
