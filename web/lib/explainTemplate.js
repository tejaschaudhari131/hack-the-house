import { TYPE_LABELS } from "./rank.js"

function num(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function money(value) {
  const text = num(value, 0)
  return text === null ? null : `$${text}`
}

function listMeasured(parcel, countyMedian) {
  const bits = []
  if (parcel.lot_sqft) bits.push(`the lot is about ${num(parcel.lot_sqft)} square feet`)
  if (parcel.land_use) bits.push(`the county land-use description is ${parcel.land_use}`)
  if (parcel.median_income) {
    const geo = parcel.census_geography === "tract" ? "census tract" : "block group"
    bits.push(`median household income in this ${geo} is ${money(parcel.median_income)}`)
  }
  if (countyMedian) bits.push(`the Allegheny County median is ${money(countyMedian)}`)
  if (parcel.rent_burden_share !== null && parcel.rent_burden_share !== undefined) {
    bits.push(
      `ACS 2024: ${num(parcel.rent_burden_share * 100, 0)}% of renters with a computed ratio pay 30% or more of income in rent`,
    )
  }
  if (parcel.chas_rent_burden_share !== null && parcel.chas_rent_burden_share !== undefined) {
    bits.push(
      `HUD CHAS 2018–2022${parcel.chas_tract_geoid ? `, census tract ${parcel.chas_tract_geoid}` : ""}: ${num(parcel.chas_rent_burden_share * 100, 0)}% of renter households at or below 80% of HAMFI with a computed cost burden pay more than 30% of income. That table is several years older than the ACS figure and counts only lower-income renters`,
    )
  }
  if (parcel.trips_within_400m !== null && parcel.trips_within_400m !== undefined) {
    const routes = (parcel.routes_within_400m || []).slice(0, 6).join(", ")
    bits.push(
      `about ${num(parcel.trips_within_400m)} weekday transit trips stop within 400 meters${routes ? ` (${routes})` : ""}`,
    )
  }
  if (parcel.nearest_stop_name && parcel.nearest_stop_m !== null && parcel.nearest_stop_m !== undefined) {
    bits.push(`the nearest stop is ${parcel.nearest_stop_name}, about ${num(parcel.nearest_stop_m)} meters away`)
  }
  if (parcel.sfha_overlap) bits.push(`about ${num(parcel.sfha_overlap * 100, 0)}% of the parcel overlaps a FEMA Special Flood Hazard Area`)
  else if (parcel.flood_zones?.includes("0.2%")) bits.push("the parcel touches the FEMA 0.2% annual-chance flood zone")
  else if (parcel.sfha_overlap === 0) bits.push("the parcel does not overlap a mapped Special Flood Hazard Area")
  if (parcel.steep_slope_overlap) {
    bits.push(
      `about ${num(parcel.steep_slope_overlap * 100, 0)}% is on a mapped slope of 25% or greater, used here only as a landslide-risk proxy, not as a landslide inventory`,
    )
  } else if (parcel.steep_slope_overlap === 0) {
    bits.push("the parcel does not overlap the city's 25% steep-slope layer (a landslide-risk proxy, not a landslide inventory)")
  }
  if (parcel.undermined_overlap) {
    bits.push(
      `about ${num(parcel.undermined_overlap * 100, 0)}% overlaps a mapped undermined area, which is a preliminary mine-subsidence screen and not a safety determination`,
    )
  } else if (parcel.undermined_overlap === 0) {
    bits.push("the parcel does not overlap a mapped undermined area")
  }
  return bits
}

function lowerIsBetter(value) {
  return value === null || value === undefined ? null : Math.round((100 - Number(value)) * 10) / 10
}

function biggestGap(top, second) {
  const fields = [
    ["demand", "demand", (row) => row.demand],
    ["transit", "transit access", (row) => row.transit],
    ["equity", "equity", (row) => row.equity],
    ["climate", "lower climate hazard", (row) => row.climate_suitability],
    ["displacement", "lower displacement risk (screening signal)", (row) => lowerIsBetter(row.displacement_risk_screen ?? row.displacement_risk)],
    ["carbon", "lower carbon (estimate)", (row) => lowerIsBetter(row.marginal_carbon_index_estimate ?? row.carbon_index)],
  ]
  let best = null
  for (const [, label, get] of fields) {
    const high = get(top)
    const low = get(second)
    if (high === null || high === undefined || low === null || low === undefined) continue
    const gap = high - low
    if (!best || gap > best.gap) best = { label, gap, top: high, second: low }
  }
  return best
}

export function explainTemplate({ parcel, ranked, weights, whatIf, zoning, countyMedianIncome }) {
  const place = parcel.address || `Parcel ${parcel.pin}`
  const top = ranked[0]
  const second = ranked[1]
  const measured = listMeasured(parcel, countyMedianIncome)
  const gap = second ? biggestGap(top, second) : null
  const weightText = Object.entries(weights)
    .map(([key, value]) => `${key} ${value}`)
    .join(", ")

  const at = (row) => (row.composite === null || row.composite === undefined ? "" : ` at ${row.composite}`)
  const splitByZoning = !whatIf && top.allowed === true && second?.allowed === false
  const rankText = splitByZoning
    ? `among the types §911.02 permits by right, ${top.label} ranks first${at(top)}. ${second.label} is listed next${at(second)} even if it scores higher, because the use table does not permit it by right`
    : `${top.label} ranks first${at(top)} and ${second ? `${second.label} is next${at(second)}` : "there is no second type"}`

  const paragraphs = []
  paragraphs.push(
    `${place} in ${parcel.neighborhood} is a screening aid, not legal, zoning, or financial advice. With your weights (${weightText}), ${rankText}. A consequential decision should go to City Planning / the Zoning Administrator or a qualified professional.`,
  )
  paragraphs.push(
    measured.length
      ? `Observed for this place: ${measured.join("; ")}.`
      : "Several observed inputs are missing for this parcel, so the scores rest on less evidence.",
  )
  if (gap && gap.gap > 0.5) {
    paragraphs.push(
      `${top.label} leads ${second.label} most clearly on ${gap.label} (${gap.top} versus ${gap.second}). Transit access is a property of the place, so it is the same for every housing type and only changes the ranking when you change its weight.`,
    )
  } else if (second) {
    paragraphs.push(
      `${top.label} and ${second.label} are close. Small weight changes can flip them. Transit access is the same for every type because it describes the place, not the building.`,
    )
  }
  paragraphs.push(
    "Value judgments, not measurements: the weights themselves; the lot-fit curves that prefer townhouses on small lots and larger buildings on big lots; the equity rule that gives bigger buildings more weight where incomes are lower and a larger penalty where sales are hot; the 50/30/20 blend of flood, steep-slope proxy, and undermined area; a small climate penalty that rises with building size; the displacement screen's anchors (a tract-level screening signal, the same for every type, not a prediction); and the carbon estimate's embodied-carbon tier (a relative index, not tonnes). Steep slope is not a landslide map. Confidence (" +
      `${parcel.confidence_label || "unknown"}, ${parcel.confidence ?? "n/a"}) is only about thin data. It does not say the value judgments are right.`,
  )
  if (parcel.confidence_notes?.length) {
    paragraphs.push(`Thin-data notes: ${parcel.confidence_notes.join(" ")}`)
  }
  if (zoning?.status === "not_in_use_table") {
    paragraphs.push(
      `${zoning.code || "This district"} is not a column in Pittsburgh Zoning Code §911.02, so no housing type was marked prohibited. Check with the City. This is a screening aid, not a zoning determination.`,
    )
  } else if (zoning?.status === "use_table_unread") {
    paragraphs.push(
      `The Pittsburgh Zoning Code use table was not read for ${zoning.code || "this district"}, so no housing type was filtered. That is not a finding that every type is allowed. ${zoning.note || ""}`,
    )
  } else if (whatIf && zoning?.status === "use_table") {
    paragraphs.push(
      "The what-if zoning toggle is on, so all four types are ranked as if §911.02 allowed them. That is a scenario, not a rezoning, and the result still needs expert review.",
    )
  } else if (zoning?.status === "use_table") {
    const allowed = [...(zoning.allowed || [])].map((id) => TYPE_LABELS[id] || id)
    const notes = Object.values(zoning.use_notes || zoning.district?.use_notes || {})
    paragraphs.push(
      `§911.02 for ${zoning.code} permits by right, or only for some unit counts: ${allowed.length ? allowed.join(", ") : "none of the four"}. Other types need special approval or are blank in the table. ${notes.join(" ")} The mapping from code uses to these four types is an assumption. This is not a determination of what may be built.`,
    )
  } else if (zoning?.note) {
    paragraphs.push(zoning.note)
  }
  return paragraphs.join("\n\n")
}
