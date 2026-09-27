// A lossless view for the studio. The explorer keeps the complete source dataset.
export const PLANNER_PROPERTIES = [
  'pin', 'address', 'neighborhood', 'area', 'land_use', 'lot_sqft', 'zoning_code',
  'vacant_lot', 'city_owned', 'median_income', 'income_moe', 'median_gross_rent',
  'census_geoid', 'census_geography', 'chas_tract_geoid', 'chas_vintage',
  'chas_rent_burden_share', 'chas_low_income_renter_households',
  'flood_zones', 'sfha_overlap', 'flood_02_overlap', 'steep_slope_overlap', 'undermined_overlap',
  'confidence_notes',
]
export const PLANNER_SCORES = ['demand', 'displacement_risk', 'carbon_index']
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]))

export function compactPlannerParcels(source) {
  return { type: 'FeatureCollection', features: source.features.map(feature => ({
    type: 'Feature', geometry: feature.geometry,
    properties: { ...pick(feature.properties, PLANNER_PROPERTIES), scores: Object.fromEntries(Object.entries(feature.properties.scores || {}).map(([type, scores]) => [type, pick(scores, PLANNER_SCORES)])) },
  })) }
}
