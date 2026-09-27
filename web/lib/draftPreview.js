import { PLACEMENT_COLORS } from './buildingUses.js'

/** A visible draft is not a committed building or a passing placement check. */
export function draftPreview(option, pending = false) {
  if (!option?.massing?.geometry) return null
  const valid = option.massing.fits && option.massing.collisions === 0 && option.permission?.category === 'permitted'
  return { type: 'Feature', geometry: option.massing.geometry, properties: {
    height: option.height,
    color: pending ? '#94a3b8' : valid ? PLACEMENT_COLORS.valid : PLACEMENT_COLORS.invalid,
    status: pending ? 'Checking placement…' : valid ? 'Placement screen passed' : 'Placement needs review',
  } }
}
