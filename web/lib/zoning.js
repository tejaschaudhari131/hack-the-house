/** Read Chris's rules file. Unknown districts are not treated as "nothing allowed." */

export function resolveZoning(code, rules) {
  if (!rules) {
    return { status: "missing_rules", allowed: null, district: null, code: code || null }
  }
  if (!code) {
    return {
      status: "no_zoning",
      allowed: null,
      district: null,
      code: null,
      note: "No zoning polygon covered this parcel, so nothing was filtered.",
    }
  }
  const district = rules.districts?.[code]
  if (!district) {
    return {
      status: "unmapped",
      allowed: null,
      district: null,
      code,
      note: "This district is not in zoning/districts.json, so nothing was filtered. Add it before treating the result as a zoning scenario.",
    }
  }
  return {
    status: "stub",
    allowed: new Set(district.allowed || []),
    district,
    code,
    note: district.notes,
    needsExpertReview: district.needs_expert_review !== false,
  }
}
