import test from 'node:test'
import { rectangleAt } from './plannerGeometry.js'
import assert from 'node:assert/strict'
import { prepareNetwork, networkAccess, infrastructureReservations, validateConnection } from './networkModel.js'
import { snapToEdge, endpointCoordinates, routeBetween, graphWithJunctions, traverseGraph } from './networkRouting.js'
const nodes=[[-80,40.4],[-80,40.402],[-79.998,40.402],[-79.998,40.4]]
const network={nodes,ground:[1,1,1,1],edges:[[0,1,3],[1,0,3],[1,2,2],[2,1,2],[2,3,3],[3,2,3]],parks:[]}
const p=prepareNetwork(network)
test('two clicks snap to the middle of segments and follow a bent route',()=>{
 const a=snapToEdge(network,[-80,40.401]),b=snapToEdge(network,[-79.998,40.401])
 assert.ok(a.distance<.001);assert.equal(typeof a.endpoint,'object')
 const route=routeBetween(p,a.endpoint,b.endpoint)
 assert.equal(route.coordinates.length,4);assert.ok(Math.abs(route.minutes-5)<1e-8)
 assert.deepEqual(route.coordinates.slice(1,3),[nodes[1],nodes[2]])
 assert.equal(snapToEdge(network,[-80.2,40.4]),null)
})
test('same-edge routes preserve one-way direction and proportional cost',()=>{
 const one={...network,edges:[[0,1,4]]},prepared=prepareNetwork(one),a={edge:[0,1],t:.25},b={edge:[0,1],t:.75}
 assert.equal(routeBetween(prepared,a,b).minutes,2)
 assert.equal(routeBetween(prepared,b,a),null)
 assert.equal(routeBetween(prepared,a,a),null)
 assert.equal(endpointCoordinates(one,{edge:[0,2],t:.5}),null)
 assert.equal(snapToEdge({...one,ground:[0,0,1,1]},[-80,40.401]),null)
})
test('new edge-interior connections join the graph without mutating the source',()=>{
 const before=JSON.stringify(network),a={edge:[0,1],t:.5},b={edge:[2,3],t:.5}
 const graph=graphWithJunctions(p,[],[{from:a,to:b}]),result=traverseGraph(graph,0)
 assert.ok(result.distances[3]<8);assert.equal(JSON.stringify(network),before)
 assert.equal(graph.nodes.length,6)
})
test('geometric crossings do not invent junctions or straight-line fallbacks',()=>{
 const cross={nodes:[[-80,40.4],[-79.998,40.402],[-79.998,40.4],[-80,40.402]],ground:[1,1,1,1],edges:[[0,1,3],[1,0,3],[2,3,3],[3,2,3]],parks:[]}
 assert.equal(routeBetween(prepareNetwork(cross),0,2),null)
})

test('saving an existing route adds no simulated land reservation or access gain',()=>{
 const feature={geometry:rectangleAt(nodes[0],10,10)},stop={coordinates:nodes[3]},state={connections:[],parks:[]}
 const route=routeBetween(p,0,3), withRoute={...state,routes:[route]}
 assert.deepEqual(networkAccess(p,feature,stop,state,true),networkAccess(p,feature,stop,withRoute,true))
 assert.deepEqual(infrastructureReservations(network,withRoute),[])
 const connection={from:{edge:[0,1],t:.5},to:{edge:[2,3],t:.5},kind:'path',width:3}
 assert.equal(validateConnection(network,connection),null)
 assert.equal(infrastructureReservations(network,{...state,connections:[connection]}).length,1)
 assert.ok(networkAccess(p,feature,stop,{...state,connections:[connection]},true).walkMinutes<networkAccess(p,feature,stop,state,true).walkMinutes)
})

test('bridge edges cannot become interior junctions even when their endpoints meet ground-level streets',()=>{
 const bridge={...network,edges:[[0,1,3,0],[1,0,3,0]]}
 assert.equal(snapToEdge(bridge,[-80,40.401]),null)
 assert.equal(endpointCoordinates(bridge,{edge:[0,1],t:.5}),null)
 assert.equal(routeBetween(prepareNetwork(bridge),0,1).minutes,3)
})
