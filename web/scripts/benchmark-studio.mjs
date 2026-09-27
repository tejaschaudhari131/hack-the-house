import { readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { performance } from 'node:perf_hooks'
import { cpus } from 'node:os'
import { spatialIndex } from '../lib/studioData.js'
import { geometryBounds } from '../lib/plannerGeometry.js'

const root=new URL('../public/data/',import.meta.url)
const read=name=>readFileSync(new URL(name,root))
const manifestRaw=read('studio/manifest.json'), manifest=JSON.parse(manifestRaw)
const bytes=buffers=>({rawBytes:buffers.reduce((n,b)=>n+b.length,0),gzipBytes:buffers.reduce((n,b)=>n+gzipSync(b).length,0)})
const measure=(fn,runs=10)=>{const times=Array.from({length:runs},()=>{const t=performance.now();fn();return performance.now()-t}).sort((a,b)=>a-b);return {p50Ms:+times[Math.floor(runs*.5)].toFixed(2),p95Ms:+times.at(-1).toFixed(2)}}
const shared=['neighborhoods.geojson','stops.geojson','zoning.json','summary.json','existing-buildings.sources.json','walking-network.sources.json'].map(read)
const files=readdirSync(new URL('studio/',root)).map(file=>({file,bytes:statSync(new URL(`studio/${file}`,root)).size}))
const result={runtime:process.version,cpu:cpus()[0].model,scope:'Local file/CPU measurements, not browser frame rate. Initial Studio data includes its buffered regional graph; excludes JS/CSS, basemap tiles, and adjacent neighborhoods requested by the camera. Gzip assumes compressed delivery.',parcels:manifest.parcelCount,neighborhoods:manifest.neighborhoods.length,manifest:bytes([manifestRaw]),largestFile:files.sort((a,b)=>b.bytes-a.bytes)[0],totalTransportBytes:files.reduce((n,f)=>n+f.bytes,0),examples:{}}
for(const name of ['Hazelwood','Lower Lawrenceville','Squirrel Hill North','East Liberty','Carrick','Middle Hill','Brookline']) {
 const n=manifest.neighborhoods.find(n=>n.name===name),raws=[...n.parcelFiles,...n.buildingFiles].map(file=>read(`studio/${file}`))
 const parcels=n.parcelFiles.flatMap(file=>JSON.parse(read(`studio/${file}`)).features),buildings=n.buildingFiles.flatMap(file=>JSON.parse(read(`studio/${file}`)).features)
 const index=spatialIndex(buildings),selected=parcels.find(f=>f.properties.pin===n.examplePin)
 result.examples[name]={pin:n.examplePin,parcels:n.parcels,initialStudioData:bytes([manifestRaw,...shared,...raws,read(`studio/${n.networkFile}`)]),parcelAndBuildingParse:measure(()=>raws.forEach(b=>JSON.parse(b))),nearbyBuildingQuery:measure(()=>index.query(geometryBounds(selected.geometry)))}
}
console.log(JSON.stringify(result,null,2))
