import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluatePlanner } from './plannerModel.js'
import { initialScenario, optionFor, historyFor, scenarioReducer, scenarioExport } from './plannerState.js'
import { rectangleAt } from './plannerGeometry.js'

function fixture() {
 const scores=Object.fromEntries(['single_family','townhouse_duplex','small_apartment','large_apartment'].map(id=>[id,{demand:60,displacement_risk:30,carbon_index:20}]))
 const feature={type:'Feature',properties:{pin:'one',zoning_code:'TEST',scores},geometry:rectangleAt([-79.94,40.41],150,150)}
 const zoning={districts:{TEST:{use_table_read:true,code_section:'Synthetic test fixture',allowed:['single_family','townhouse_duplex','small_apartment','large_apartment'],use_rows:{'Single-Unit Detached':'P','Three-Unit':'P','Multi-Unit':'P'}}}}
 const stop={stop_id:'bus',coordinates:[-79.94,40.41],distance:0,weekday_trips:80}
 const scenario=initialScenario('one',feature.properties,'bus')
 scenario.options={A:optionFor('single_family',1000),B:optionFor('small_apartment',1000)}
 scenario.spareBoardings=8; scenario.weights={capacity:100}; scenario.capacityStopId='bus'
 const site={id:'placed',feature,stop,existingBuildings:[],targetIncome:40000,option:{...optionFor('triplex',1000),placement:{east:-40,north:0,bearing:0}}}
 return {feature,zoning,scenario,stop,existingBuildings:[],areaSites:[site]}
}
test('shared transit reserve is counted once and area factors use proposed-home weights',()=>{
 const input=fixture(), r=evaluatePlanner(input)
 assert.equal(r.scope,'area')
 assert.equal(r.proposal.A.eligible,true)
 assert.equal(r.proposal.B.eligible,true)
 assert.equal(r.proposal.A.area.units,4)
 assert.equal(r.proposal.A.scores.capacity,100)
 assert.ok(Math.abs(r.proposal.B.scores.capacity-100*8/30)<1e-9)
 assert.equal(r.proposal.A.area.buildings,2)
 assert.equal(r.proposal.A.area.parcels,1)
 input.areaSites[0].feature={...input.feature,properties:{...input.feature.properties,pin:'two',scores:Object.fromEntries(Object.keys(input.feature.properties.scores).map(id=>[id,{demand:20,displacement_risk:30,carbon_index:20}]))}}
 assert.equal(evaluatePlanner(input).proposal.A.scores.demand,30)
})
test('placed collisions and missing evidence prevent an area winner, including across parcels',()=>{
 const input=fixture()
 input.scenario.options.A.placement={east:-40,north:0,bearing:0}
 let r=evaluatePlanner(input)
 assert.equal(r.proposal.A.eligible,false)
 input.areaSites.push({...input.areaSites[0],id:'overlapping',feature:{...input.feature,properties:{...input.feature.properties,pin:'two'}}})
 r=evaluatePlanner(input)
 assert.equal(r.after,null)
 assert.equal(r.shortlist.proposal.order.length,0)
 input.areaSites=[{...input.areaSites[0],existingBuildings:null}]
 r=evaluatePlanner(input)
 assert.equal(r.after,null)
 assert.ok(r.excluded.includes('physical'))
})
test('service changes affect only their named stop; no-op and noncausal factors stay fixed',()=>{
 const input=fixture()
 input.scenario.serviceStopId='elsewhere';input.scenario.additionalDepartures=60
 let r=evaluatePlanner(input)
 assert.equal(r.proposal.A.service.added,0)
 assert.deepEqual(r.proposal.A.scores,r.baseline.A.scores)
 input.scenario.serviceStopId='bus';r=evaluatePlanner(input)
 assert.ok(r.proposal.B.scores.capacity>r.baseline.B.scores.capacity)
 for(const id of ['demand','affordability','displacement','carbon']) assert.equal(r.proposal.B.scores[id],r.baseline.B.scores[id])
})
test('add/remove are atomic, reversible, and retain complete placement in export',()=>{
 const {scenario,areaSites:[site]}=fixture()
 const building={id:site.id,pin:'one',option:site.option,stopId:'bus',targetIncome:40000}
 let h=historyFor(scenario)
 h=scenarioReducer(h,{type:'addBuilding',slot:'B',building})
 assert.equal(h.present.buildings.length,1)
 assert.deepEqual(scenarioExport(h.present).scenario.buildings[0].option.placement,site.option.placement)
 const added=h.present
 h=scenarioReducer(h,{type:'undo'});assert.deepEqual(h.present,scenario)
 h=scenarioReducer(h,{type:'redo'});assert.deepEqual(h.present,added)
 h=scenarioReducer(h,{type:'removeBuilding',id:site.id});assert.equal(h.present.buildings.length,0)
 h=scenarioReducer(h,{type:'undo'});assert.deepEqual(h.present,added)
})

test('placed-plan totals exclude the draft and use the shared pool only once',()=>{
 const input=fixture(), r=evaluatePlanner(input)
 assert.equal(r.placedPlan.proposal.units,3)
 assert.equal(r.placedPlan.proposal.buildings,1)
 assert.equal(r.placedPlan.proposal.total,100)
 input.scenario.options.A=optionFor('large_apartment',9000)
 const changed=evaluatePlanner(input)
 assert.deepEqual(changed.placedPlan,r.placedPlan)
 assert.equal(evaluatePlanner({...input,areaSites:[]}).placedPlan,null)
})
