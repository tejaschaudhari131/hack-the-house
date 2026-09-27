/** Read Chris's rules file. Unknown districts are not treated as "nothing allowed."
 * A row filters types only after a person has cited a code section and set use_table_read.
 */

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
  const codeUrl = district.code_url || rules.meta?.code_url || null
  const grounded = district.use_table_read === true && Boolean(district.code_section)
  if (!grounded) {
    return {
      status: "use_table_unread",
      allowed: null,
      district,
      code,
      note: district.todo || district.notes,
      needsExpertReview: true,
      codeSection: null,
      codeUrl,
    }
  }
  return {
    status: "stub",
    allowed: new Set(district.allowed || []),
    district,
    code,
    note: district.notes,
    needsExpertReview: district.needs_expert_review !== false,
    codeSection: district.code_section,
    codeUrl,
  }
}

/** Badge for a dropped housing type. Empty or unread rules are not treated as "not allowed." */
export function dropZoningBadge(typeId, zoningInfo) {
  const review = "Needs expert review. This is not a zoning determination."
  if (!zoningInfo || zoningInfo.status !== "stub" || !zoningInfo.allowed) {
    return {
      id: "unreviewed",
      label: "Needs expert review",
      detail: `The use table was not read, so this type is not marked allowed, not marked as a variance, and not marked prohibited. ${review}`,
    }
  }
  const variance = new Set(zoningInfo.district?.variance_or_exception || [])
  if (zoningInfo.allowed.has(typeId)) {
    return {
      id: "allowed",
      label: "Allowed",
      detail: `The rules file lists this type as allowed. ${review}`,
    }
  }
  if (variance.has(typeId)) {
    return {
      id: "variance",
      label: "Likely needs variance or special exception",
      detail: `The rules file lists this type as likely needing a variance or special exception. ${review}`,
    }
  }
  return {
    id: "not_allowed",
    label: "Not allowed",
    detail: `The rules file does not list this type as allowed. ${review}`,
  }
}
