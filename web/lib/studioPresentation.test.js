import test from 'node:test'
import assert from 'node:assert/strict'
import { templateTradeoffs,studioSites,STUDIO_PRESETS } from './studioPresentation.js'
import { PLANNER_FACTORS } from './plannerState.js'
test('pros/cons follow weighted differences and omit shared, excluded and ineligible factors',()=>{
 const a={id:'a',proposal:{eligible:true,total:60,scores:{demand:60,access:90,carbon:20}}}
 const b={id:'b',proposal:{eligible:true,label:'Other',total:50,scores:{demand:40,access:90,carbon:80}}}
 const result=templateTradeoffs(a,[a,b], [{id:'demand',included:true,effectiveWeight:.5},{id:'access',included:true,effectiveWeight:.5},{id:'carbon',included:false}], 'proposal')
 assert.deepEqual(result.pros.map(x=>[x.id,x.points]),[['demand',10]])
 assert.equal(result.cons.length,0)
 a.proposal.eligible=false;assert.equal(templateTradeoffs(a,[a,b],[],'proposal').reference,null)
})
test('discovery filters records within the study area and never ranks by recommended type',()=>{
 const f=(pin,props)=>({properties:{pin,area:'Hazelwood',...props}})
 const parcels={features:[f('b',{address:'B',vacant_lot:true}),f('a',{address:'A',vacant_lot:true}),f('elsewhere',{area:'Lawrenceville',vacant_lot:true}),f('occupied',{vacant_lot:false})]}
 assert.deepEqual(studioSites(parcels,{},'Hazelwood',{vacant:true}).map(f=>f.properties.pin),['a','b'])
 assert.equal(studioSites(parcels,{},'Hazelwood',{flood:'none'}).length,0)
 assert.equal(studioSites(parcels,{},'Hazelwood',{typeId:'triplex'}).length,0)
 for(const p of STUDIO_PRESETS) for(const f of PLANNER_FACTORS) assert.ok(Number.isFinite(p.weights[f.id]))
})
