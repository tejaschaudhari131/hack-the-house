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
      `${num(parcel.rent_burden_share * 100, 0)}% of renters with a computed ratio pay 30% or more of income in rent`,
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

function biggestGap(top, second) {
  const fields = [
    ["demand", "demand"],
    ["transit", "transit access"],
    ["equity", "equity"],
    ["climate_suitability", "lower climate hazard"],
  ]
  let best = null
  for (const [key, label] of fields) {
    if (top[key] === null || top[key] === undefined || second[key] === null || second[key] === undefined) continue
    const gap = top[key] - second[key]
    if (!best || gap > best.gap) best = { label, gap, top: top[key], second: second[key] }
  }
  return best
}

export function explainTemplate({ parcel, ranked, weights, whatIf, zoning, countyMedianIncome }) {
  const place = parcel.address || `Parcel ${parcel.pin}`
  const top = ranked[0]
  const second = ranked[1]
  const measured = listMeasured(parcel, countyMedianIncome)
  const gap = second ? biggestGap(top, second) : null
  const weightText = `demand ${weights.demand}, transit ${weights.transit}, equity ${weights.equity}, climate ${weights.climate}`

  const paragraphs = []
  paragraphs.push(
    `${place} in ${parcel.neighborhood} is a decision-support comparison, not legal, zoning, or financial advice. With your weights (${weightText}), ${top.label} ranks first${top.composite === null ? "" : ` at ${top.composite}`} and ${second ? `${second.label} is next${second.composite === null ? "" : ` at ${second.composite}`}` : "there is no second type"}.`,
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
    "Value judgments, not measurements: the weights themselves; the lot-fit curves that prefer townhouses on small lots and larger buildings on big lots; the equity rule that gives bigger buildings more weight where incomes are lower and a larger penalty where sales are hot; the 50/30/20 blend of flood, steep-slope proxy, and undermined area; and a small climate penalty that rises with building size. Steep slope is not a landslide map. Confidence (" +
      `${parcel.confidence_label || "unknown"}, ${parcel.confidence ?? "n/a"}) is only about thin data. It does not say the value judgments are right.`,
  )
  if (parcel.confidence_notes?.length) {
    paragraphs.push(`Thin-data notes: ${parcel.confidence_notes.join(" ")}`)
  }
  if (whatIf) {
    paragraphs.push(
      "The what-if zoning toggle is on, so all four types are ranked as if the stub rules allowed them. That is a scenario, not a rezoning, and the stub rules still need expert review.",
    )
  } else if (zoning?.status === "stub") {
    const allowed = [...(zoning.allowed || [])].map((id) => TYPE_LABELS[id] || id)
    paragraphs.push(
      `Stub zoning for ${zoning.code} marks these types as allowed: ${allowed.length ? allowed.join(", ") : "none of the four"}. Types outside that list are flagged and sorted below. ${zoning.note || ""} This is not a determination of what may be built.`,
    )
  } else if (zoning?.note) {
    paragraphs.push(zoning.note)
  }
  return paragraphs.join("\n\n")
}
