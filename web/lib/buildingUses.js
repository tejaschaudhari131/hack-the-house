/** Recorded parcel use, never the recommended type or a height-derived dwelling count. */
export const USE_LEGEND = [
  { id: 'single_family', label: 'Single-family', color: '#1d4e89', simulated: '#528bd0' },
  { id: 'townhouse_duplex', label: 'Townhouse / duplex', color: '#0f766e', simulated: '#35b6a7' },
  { id: 'small_apartment', label: 'Apartments · 3–19', color: '#c2410c', simulated: '#f58d50' },
  { id: 'large_apartment', label: 'Apartments · 20+', color: '#9f1239', simulated: '#e55e85' },
  { id: 'other_residential', label: 'Other / mixed residential', color: '#7c3aed' },
  { id: 'nonresidential', label: 'Commercial / other nonresidential', color: '#64748b' },
  { id: 'unknown', label: 'Use unknown', color: '#cbd5e1' },
]
export const USE_BY_ID = Object.fromEntries(USE_LEGEND.map(use => [use.id, use]))
export const PLACEMENT_COLORS = { valid: '#16a34a', invalid: '#dc2626' }
export function simulatedColor(typeId) { return USE_BY_ID[typeId === 'triplex' ? 'small_apartment' : typeId]?.simulated || '#cbd5e1' }

export function recordedUse(parcel, footprint = {}) {
  const use = String(parcel?.land_use || '').toUpperCase(), group = parcel?.land_use_class
  if (!use || /VACANT|DEVELOPMENTAL LAND|COMMON PROPERTY/.test(use)) return 'unknown'
  if (footprint.footprint_role === 'auxiliary') return group === 'RESIDENTIAL' ? 'other_residential' : 'nonresidential'
  if (use === 'SINGLE FAMILY') return 'single_family'
  if (['ROWHOUSE', 'TOWNHOUSE', 'TWO FAMILY'].includes(use)) return 'townhouse_duplex'
  if (['THREE FAMILY', 'FOUR FAMILY', 'APART: 5-19 UNITS', 'COMM APRTM CONDOS 5-19 UNITS'].includes(use)) return 'small_apartment'
  if (['APART:20-39 UNITS', 'APART:40+ UNITS'].includes(use)) return 'large_apartment'
  if (group === 'RESIDENTIAL' || /APT'S OVER|APARTMENTS OVER|SENIORS|HOUSING AU|NURSING HOME/.test(use)) return 'other_residential'
  if (['COMMERCIAL', 'INDUSTRIAL', 'GOVERNMENT', 'UTILITIES', 'OTHER'].includes(group)) return 'nonresidential'
  return 'unknown'
}

export function colorBuildingUses(buildings, byPin) {
  return { ...buildings, features: buildings.features.map(feature => {
    const parcel = byPin.get(feature.properties.pin)?.properties
    const use = recordedUse(parcel, feature.properties)
    return { ...feature, properties: { ...feature.properties, use_type: use, use_color: USE_BY_ID[use].color,
      use_label: USE_BY_ID[use].label, recorded_land_use: parcel?.land_use || 'Unknown',
      use_evidence: parcel ? 'Matched parcel assessment use; individual footprint occupancy is unverified.' : 'No matched parcel assessment use.' } }
  }) }
}
