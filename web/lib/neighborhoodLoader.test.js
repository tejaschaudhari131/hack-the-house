import test from 'node:test'
import assert from 'node:assert/strict'
import { loadNeighborhood, locateNeighborhood } from './neighborhoodLoader.js'
import { regionalNetwork } from '../scripts/prepare-studio-data.mjs'
const descriptor={id:'brookline',name:'Brookline',examplePin:'000ABC123',parcelFiles:['brookline-parcels.abc.json','brookline-parcels.def.json'],buildingFiles:['brookline-buildings.abc.json']}

test('Explorer loads only parcel chunks; Studio also loads recorded collision evidence',async()=>{
  const requests=[]
  const fetcher=async(url,options)=>{ requests.push([url,options.signal]); return {ok:true,json:async()=>({features:[{id:url}]})} }
  const controller=new AbortController()
  const explorer=await loadNeighborhood(descriptor,controller.signal,fetcher,false)
  assert.equal(requests.length,2)
  assert.equal(explorer.parcels.features.length,2)
  assert.equal(explorer.buildings.features.length,0)
  requests.length=0
  const studio=await loadNeighborhood(descriptor,controller.signal,fetcher)
  assert.equal(requests.length,3)
  assert.equal(studio.buildings.features.length,1)
  assert.ok(requests.every(([,signal])=>signal===controller.signal))
})

test('PIN links resolve from one small prefix index, never a citywide parcel download',async()=>{
  const manifest={neighborhoods:[descriptor],pinLookup:{'005':'pins-005.abc.json'}}
  let calls=0
  const fetcher=async url=>{calls++; assert.equal(url,'/data/studio/pins-005.abc.json');return {ok:true,json:async()=>({'005ABC123':'brookline'})}}
  assert.equal((await locateNeighborhood(manifest,'005ABC123',undefined,fetcher)).id,'brookline')
  assert.equal((await locateNeighborhood(manifest,'000ABC123',undefined,fetcher)).id,'brookline')
  assert.equal(await locateNeighborhood(manifest,'../private',undefined,fetcher),null)
  assert.equal(calls,1)
})

test('failed parts reject a neighborhood rather than silently dropping buildings or scores',async()=>{
  await assert.rejects(loadNeighborhood(descriptor,undefined,async()=>({ok:false,status:503})),/503/)
  await assert.rejects(loadNeighborhood({...descriptor,parcelFiles:['../private.json']},undefined,()=>{throw Error('must not fetch')}),/Invalid/)
})

test('regional graph remapping preserves one-way edges, costs, access nodes and real crossings',()=>{
  const graph={schemaVersion:1,nodes:[[0,0],[1,0],[1,1],[50,50]],ground:[1,1,1,0],edges:[[0,1,2],[1,2,3]],parks:[{id:'p',nodes:[2,3]}]}
  const region=regionalNetwork(graph,[0,-1,1,1],0)
  assert.deepEqual(region.nodes,graph.nodes.slice(0,3))
  assert.deepEqual(region.edges,graph.edges)
  assert.deepEqual(region.parks,[{id:'p',nodes:[2]}])
  assert.equal(region.nodes.length,3)
})
