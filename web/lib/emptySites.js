import { BUILDING_IDS } from './buildings.js'
import { optionFor } from './plannerState.js'
import { fitMassing, geometriesOverlap, geometryBounds } from './plannerGeometry.js'
import { spatialIndex } from './studioData.js'
import { evaluateTitleNine, housingPermission } from './titleNine.js'

// Vacancy is affirmative source evidence, not an inference from residential zoning,
// ownership, a missing assessment, or the absence of a footprint.
export function recordedEmptySite(props) {
  return props.vacant_lot === true && props.city_open_space !== true
    && (!props.land_use || /^VACANT\b/i.test(props.land_use))
}

/** Transfer geometry and screening inputs only; never copy the full scoring payload. */
export function emptySiteChunk(chunk) {
  const keys = ['pin', 'vacant_lot', 'city_open_space', 'land_use', 'zoning_code', 'lot_sqft', 'sfha_overlap', 'steep_slope_overlap', 'undermined_overlap']
  return {
    parcels: chunk.parcels.features.filter(f => recordedEmptySite(f.properties)).map(f => ({ geometry: f.geometry, properties: Object.fromEntries(keys.map(key => [key, f.properties[key]])) })),
    // Use the complete collision context, including cross-boundary buildings.
    buildings: chunk.buildings?.features.map(f => ({ geometry: f.geometry })) ?? null,
  }
}

/** A discovery screen for existing conditions, not a recommendation or approval. */
export function screenEmptySite(feature, zoning, buildings) {
  if (!recordedEmptySite(feature.properties) || buildings === null) return null
  if (!Number.isFinite(feature.properties.lot_sqft) || feature.properties.lot_sqft <= 0) return null
  if (buildings.some(b => geometriesOverlap(feature.geometry, b.geometry))) return null
  for (const typeId of BUILDING_IDS) {
    const option = optionFor(typeId, 0)
    if (housingPermission(option, feature.properties.zoning_code, zoning).category !== 'permitted') continue
    const massing = fitMassing(feature.geometry, option.width, option.depth, null, buildings)
    if (!massing.fits || massing.collisions !== 0) continue
    const review = evaluateTitleNine({ option, feature, zoning, massing, existingBuildings: buildings })
    if (!review.conflict) return { pin: feature.properties.pin, typeId }
  }
  return null
}

/** Results are cached only while their neighborhood is retained by the worker. */
export function emptySiteIndex(chunk, zoning) {
  const parcels = spatialIndex(chunk.parcels), buildings = chunk.buildings === null ? null : spatialIndex(chunk.buildings)
  const cache = new Map()
  return {
    *query(bounds) {
      for (const feature of parcels.query(bounds)) {
        const pin = feature.properties.pin
        if (!cache.has(pin)) cache.set(pin, screenEmptySite(feature, zoning, buildings?.query(geometryBounds(feature.geometry)) ?? null))
        yield cache.get(pin)
      }
    },
  }
}
