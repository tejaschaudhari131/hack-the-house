/** Read the zoning rules. §911.02 rows can filter types. Districts that are not in
 * the use table do not become "not allowed."
 */

const REVIEW = "Needs expert review. This is not a zoning determination."

function varianceEntry(district, typeId) {
  const list = district?.variance_or_exception || []
  for (const item of list) {
    if (item === typeId) return { type: typeId, letter: "" }
    if (item && item.type === typeId) return item
  }
  return null
}

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
      note: "This district is not in zoning/districts.json. Check with the City. Nothing was marked prohibited.",
    }
  }
  const codeUrl = district.code_url || rules.meta?.use_table_url || rules.meta?.code_url || null
  if (district.not_in_use_table) {
    return {
      status: "not_in_use_table",
      allowed: null,
      district,
      code,
      note: district.notes,
      needsExpertReview: true,
      codeSection: null,
      codeUrl,
    }
  }
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
  const rankWith = new Set([...(district.allowed || []), ...(district.partial || [])])
  return {
    status: "use_table",
    allowed: rankWith,
    district,
    code,
    note: district.notes,
    needsExpertReview: district.needs_expert_review !== false,
    codeSection: district.code_section,
    codeUrl,
  }
}

function cite(zoningInfo) {
  const section = zoningInfo.codeSection || "§911.02"
  return `${section}. ${REVIEW}`
}

/** Badge for one housing type. A/S/C are special approval, not a variance. */
export function dropZoningBadge(typeId, zoningInfo) {
  if (!zoningInfo || zoningInfo.status === "not_in_use_table" || zoningInfo.status === "unmapped" || zoningInfo.status === "no_zoning") {
    return {
      id: "unreviewed",
      label: "Check with the city / needs review",
      detail: `This district is not covered by the §911.02 columns used here, so the type is not marked allowed and not marked prohibited. ${REVIEW}`,
    }
  }
  if (zoningInfo.status !== "use_table" || !zoningInfo.allowed) {
    return {
      id: "unreviewed",
      label: "Needs expert review",
      detail: `The use table was not read, so this type is not marked allowed and not marked prohibited. ${REVIEW}`,
    }
  }
  const district = zoningInfo.district || {}
  const note = district.use_notes?.[typeId]
  const approval = varianceEntry(district, typeId)
  if (approval) {
    const letter = approval.letter ? ` (${approval.letter})` : ""
    return {
      id: "approval",
      label: `Needs special approval${letter}`,
      detail: `${note || "The use table marks this as A, S, or C, not permitted by right."} ${cite(zoningInfo)}`,
    }
  }
  if ((district.partial || []).includes(typeId)) {
    return {
      id: "partial",
      label: note || "Only some unit counts are permitted by right",
      detail: `${note || "Three-Unit and Multi-Unit do not match for this district."} ${cite(zoningInfo)}`,
    }
  }
  if (zoningInfo.allowed.has(typeId) && (district.allowed || []).includes(typeId)) {
    return {
      id: "allowed",
      label: "Allowed",
      detail: `${note || "§911.02 marks the mapped use permitted by right (P)."} ${cite(zoningInfo)}`,
    }
  }
  return {
    id: "not_allowed",
    label: "Not allowed",
    detail: `${note || "§911.02 leaves this use blank, which the code treats as not permitted."} ${cite(zoningInfo)}`,
  }
}
