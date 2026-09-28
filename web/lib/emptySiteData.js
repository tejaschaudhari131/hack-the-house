import { BUILDING_IDS } from './buildings.js'
import { spatialIndex } from './studioData.js'

export const EMPTY_SITE_DATA_VERSION = 1

/** Read build-generated results only; the browser never repeats the legal/fit screen. */
export function preparedEmptySiteIndex(chunk) {
  if (chunk.emptySites?.version !== EMPTY_SITE_DATA_VERSION || !Array.isArray(chunk.emptySites.matches)) throw new Error('Empty-site candidates are unavailable for this data release.')
  const parcels = new Map(chunk.parcels.features.map(f => [f.properties.pin, f])), seen = new Set()
  const features = chunk.emptySites.matches.map(match => {
    const parcel = parcels.get(match.pin)
    if (!parcel || seen.has(match.pin) || !BUILDING_IDS.includes(match.typeId)) throw new Error('Empty-site candidates do not match this neighborhood release.')
    seen.add(match.pin)
    return { geometry: parcel.geometry, properties: match }
  })
  const index = spatialIndex(features)
  return { query: bounds => index.query(bounds).map(f => f.properties) }
}
