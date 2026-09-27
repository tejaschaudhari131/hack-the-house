/** Display evidence only. Existing building heights are not recommendation inputs. */
const profiles = {
  small_auxiliary: 'a small auxiliary footprint',
  residential: 'typical residential buildings in this study area',
  mixed_use: 'a mixed-use property',
  apartments_large: 'a large apartment property',
  apartments_medium: 'a medium apartment property',
  apartments_small: 'a small apartment property',
  warehouse: 'a warehouse or storage property',
  industrial: 'an industrial building',
  commercial: 'a commercial building',
}

export function buildingHeightDescription(p) {
  switch (p.height_method) {
    case 'osm_height': return `${p.height_m} m from an OpenStreetMap height tag. Contributor-mapped; not independently verified.`
    case 'osm_levels': return `${p.height_m} m estimated from ${p.stories} OpenStreetMap levels, with an estimated or mapped roof allowance.`
    case 'stories_estimate': return `${p.height_m} m estimated from ${p.stories} recorded stories (3 m/story + 1.5 m assumed roof).${p.footprint_role === 'dominant' ? ' Assigned to the dominant footprint on this parcel.' : ''}`
    case 'typology_estimate': return `${p.height_m} m inferred for ${profiles[p.height_profile] || 'this building type'}. Illustrative relative massing; no building-specific height record.`
    default: return `${p.height_m} m placeholder. Insufficient evidence to differentiate this building’s height.`
  }
}

export function buildingHeightCoverage(methods = {}) {
  const sourced = (methods.stories_estimate || 0) + (methods.osm_height || 0) + (methods.osm_levels || 0)
  return `${sourced.toLocaleString()} heights use recorded stories or mapped height/level tags; ${(methods.typology_estimate || 0).toLocaleString()} use inferred building-type heights; ${(methods.placeholder || 0).toLocaleString()} remain placeholders.`
}

export function buildingHeightSource(p) {
  return /^osm_/.test(p.height_method) && /^(way|relation)\/\d+$/.test(p.height_ref || '') ? `https://www.openstreetmap.org/${p.height_ref}` : null
}
