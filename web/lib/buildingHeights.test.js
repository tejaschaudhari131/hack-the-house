import test from 'node:test'
import assert from 'node:assert/strict'
import { buildingHeightDescription, buildingHeightCoverage, buildingHeightSource } from './buildingHeights.js'

test('height explanations distinguish source records from illustrative priors', () => {
  assert.match(buildingHeightDescription({ height_m: 16.5, height_method: 'typology_estimate', height_profile: 'apartments_large' }), /no building-specific height record/)
  assert.match(buildingHeightDescription({ height_m: 7.5, height_method: 'stories_estimate', stories: 2, footprint_role: 'dominant' }), /dominant footprint/)
  assert.match(buildingHeightDescription({ height_m: 12, height_method: 'osm_height' }), /not independently verified/)
  assert.equal(buildingHeightSource({ height_method: 'osm_levels', height_ref: 'way/123' }), 'https://www.openstreetmap.org/way/123')
  assert.equal(buildingHeightSource({ height_method: 'osm_levels', height_ref: '../malformed' }), null)
  assert.equal(buildingHeightSource({ height_method: 'typology_estimate' }), null)
  assert.match(buildingHeightCoverage({ stories_estimate: 20, osm_height: 5, osm_levels: 5, typology_estimate: 10, placeholder: 2 }), /^30 heights.*10 use inferred.*2 remain placeholders/)
})
