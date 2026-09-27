import test from 'node:test'
import assert from 'node:assert/strict'
import { recordedUse, colorBuildingUses, simulatedColor } from './buildingUses.js'
test('recorded use classifies four housing bands without using recommendations or heights', () => {
  for (const [land_use, expected] of [['SINGLE FAMILY','single_family'],['ROWHOUSE','townhouse_duplex'],['TWO FAMILY','townhouse_duplex'],['THREE FAMILY','small_apartment'],['APART: 5-19 UNITS','small_apartment'],['APART:40+ UNITS','large_apartment']]) assert.equal(recordedUse({land_use, land_use_class:'COMMERCIAL', scores:{}}), expected)
  assert.equal(recordedUse({land_use:"RETL/APT'S OVER",land_use_class:'COMMERCIAL'}),'other_residential')
  assert.equal(recordedUse({land_use:'CHURCHES, PUBLIC WORSHIP',land_use_class:'COMMERCIAL'}),'nonresidential')
  assert.equal(recordedUse({land_use:'SINGLE FAMILY',land_use_class:'RESIDENTIAL'},{footprint_role:'auxiliary'}),'other_residential')
  assert.equal(recordedUse({land_use:'VACANT LAND',land_use_class:'RESIDENTIAL'}),'unknown')
  assert.equal(recordedUse(null),'unknown')
})
test('colour enrichment retains geometry and distinguishes inferred parcel use from verified occupancy', () => {
 const feature={properties:{pin:'x',height_m:40},geometry:{type:'Polygon',coordinates:[]}}
 const result=colorBuildingUses({features:[feature]},new Map([['x',{properties:{land_use:'SINGLE FAMILY'}}]]))
 assert.equal(result.features[0].properties.use_type,'single_family')
 assert.equal(result.features[0].geometry,feature.geometry)
 assert.equal(feature.properties.use_type,undefined)
 assert.match(result.features[0].properties.use_evidence,/unverified/)
 assert.equal(simulatedColor('triplex'),simulatedColor('small_apartment'))
})
