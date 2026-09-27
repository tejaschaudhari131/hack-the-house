import test from 'node:test'
import assert from 'node:assert/strict'
import { networkDisplayIndex } from './networkDisplay.js'
import { segmentTouchesPolygon } from './plannerGeometry.js'

const box=(w,s,e,n)=>({type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]})
test('network display keeps original vertices, removes duplicate directions, and culls off-screen and distant neighborhoods',()=>{
  const network={nodes:[[0,0],[1,1],[2,0],[10,10],[11,11]],edges:[[0,1,2],[1,0,2],[1,2,3],[3,4,4]]}
  network.nodes=network.nodes.map(p=>p.map(v=>v/1000))
  const original=structuredClone(network)
  const neighborhoods={features:[{properties:{name:'Here'},geometry:box(-1,-1,3,3)},{properties:{name:'Away'},geometry:box(9,9,12,12)}]}
  for(const f of neighborhoods.features)f.geometry.coordinates=f.geometry.coordinates.map(r=>r.map(p=>p.map(v=>v/1000)))
  const index=networkDisplayIndex(network,neighborhoods)
  const visible=index.query([-.001,-.001,.020,.020],['here'])
  assert.equal(visible.length,2)
  assert.deepEqual(visible.map(f=>f.geometry.coordinates),[[network.nodes[0],network.nodes[1]],[network.nodes[1],network.nodes[2]]])
  assert.equal(visible[0].geometry.coordinates[0],network.nodes[0])
  assert.equal(index.query([.009,.009,.012,.012],['here']).length,0)
  assert.equal(index.query([-.001,-.001,.020,.020],[]).length,0)
  assert.equal(index.query([.009,.009,.012,.012],['away']).length,1)
  assert.deepEqual(network,original,'display culling never edits routing evidence')
})
test('road membership includes crossing segments even when both endpoints are outside',()=>{
  assert.ok(segmentTouchesPolygon([-2,0],[2,0],box(-1,-1,1,1)))
  assert.ok(!segmentTouchesPolygon([-2,2],[2,2],box(-1,-1,1,1)))
  const hole={type:'Polygon',coordinates:[box(-3,-3,3,3).coordinates[0],box(-1,-1,1,1).coordinates[0]]}
  assert.ok(!segmentTouchesPolygon([-.5,0],[.5,0],hole))
})
