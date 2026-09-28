import { BUILDING_IDS } from './buildings.js'
import { optionFor } from './plannerState.js'
import { fitMassing, geometriesOverlap, geometryBounds } from './plannerGeometry.js'
import { evaluateTitleNine, housingPermission } from './titleNine.js'
import { EMPTY_SITE_DATA_VERSION } from './emptySiteData.js'

// Vacancy is affirmative source evidence, not an inference from residential zoning,
// ownership, a missing assessment, or the absence of a footprint.
export function recordedEmptySite(props) {
  return props.vacant_lot === true && props.city_open_space !== true
    && (!props.land_use || /^VACANT\b/i.test(props.land_use))
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

/** Offline preparation uses the same exact geometry and rule evaluator as Studio. */
export function prepareEmptySites(parcels, zoning, buildingIndex) {
  const matches = []
  for (const feature of parcels.features) {
    if (!recordedEmptySite(feature.properties)) continue
    const match = screenEmptySite(feature, zoning, buildingIndex?.query(geometryBounds(feature.geometry)) ?? null)
    if (match) matches.push(match)
  }
  return { version: EMPTY_SITE_DATA_VERSION, matches }
}
