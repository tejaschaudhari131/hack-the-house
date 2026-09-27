/** Three next steps chosen by fixed rules from the comparison and the parcels' records. No contacts or outcomes are invented. */

const RECORD_FLAGS = [
  ["city_owned", "City-owned"],
  ["vacant_lot", "vacant land-use"],
  ["tax_delinquent", "tax-delinquent"],
  ["condemned_or_dead_end", "condemned or dead-end"],
]

function share(value) {
  return typeof value === "number" && value > 0
}

export function nextActions(result, propsA, propsB) {
  const parcels = result.sameParcel ? [propsA] : [propsA, propsB]
  const actions = []

  const sides = [result.a, result.b]
  const unsettled = sides.filter((side) => side.permission.category !== "permitted")
  const permissionText = sides.map((side) => `${side.label} (${side.permission.label.toLowerCase()})`).join(" and ")
  actions.push(
    `${unsettled.length ? "Confirm" : "Verify"} with City Planning / the Zoning Administrator whether §911.02 permits ${permissionText} at ${
      result.sameParcel ? `this parcel (${result.a.zoningCode || "district not matched"})` : "these parcels"
    }, and check the dimensional rules this screen does not evaluate: setbacks, lot width, height or FAR, and parking.`,
  )

  const flagged = []
  for (const props of parcels) {
    for (const [key, label] of RECORD_FLAGS) if (props?.[key] === true) flagged.push(label)
  }
  actions.push(
    flagged.length
      ? `Verify control and availability with the property custodian (for City-owned or delinquent parcels, the City, the URA, or the Pittsburgh Land Bank). A ${[...new Set(flagged)].join(", ")} record is not availability or title.`
      : "Confirm ownership and availability from the County record. This screen does not check title, availability, or occupancy.",
  )

  const hazards = []
  for (const props of parcels) {
    if (share(props?.sfha_overlap) || share(props?.flood_02_overlap)) hazards.push("mapped flood zone")
    if (share(props?.steep_slope_overlap)) hazards.push("25%+ slope")
    if (share(props?.undermined_overlap)) hazards.push("undermined area")
  }
  if (hazards.length) {
    actions.push(
      `Seek a site hazard review for the ${[...new Set(hazards)].join(", ")} overlap. Map overlap is a screen, not a survey or geotechnical finding.`,
    )
  } else {
    const stop = parcels.map((props) => props?.frequent_stop_name || props?.nearest_stop_name).find(Boolean)
    actions.push(
      `Walk the route to ${stop ? `the ${stop} stop` : "the nearest frequent stop"} and check pedestrian access. The distances here are straight-line, not a verified or accessible walking route.`,
    )
  }
  return actions
}
