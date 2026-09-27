/** Grounded facts and a template for a Find Sites result list. Same rules as the parcel facts. */

import { VALUE_JUDGMENTS, scoreRow, sourceList, weightFacts } from "./explainFacts.js"
import {
  CITY_STATUS_LABELS,
  DEFAULT_SITE_FILTERS,
  PERMISSION_LABELS,
  SITE_CAVEAT,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  placeDisplacement,
} from "./sites.js"

export const TOP_SITES = 5

function pct(share) {
  if (share === null || share === undefined || Number.isNaN(Number(share))) return null
  return Math.round(Number(share) * 100)
}

function typeLabel(typeId) {
  return TYPE_OPTIONS.find((option) => option.id === typeId)?.label || typeId
}

const FILTER_TEXT = {
  vacant: () => "vacant land-use record",
  cityOwned: () => "City-owned",
  taxDelinquent: () => "tax-delinquent",
  taxDelinquentPrior: () => "tax-delinquent for more than the current year",
  condemned: () => "condemned or dead-end record",
  excludeOpenSpace: () => "City open space and parks left out",
  typeId: (value) => `ranked as ${typeLabel(value)}`,
  permission: (value) => ({ by_right: "§911.02 permits it by right", by_right_or_special: "§911.02 permits it by right or with special approval" })[value] || null,
  flood: (value) => ({ none: "no mapped FEMA flood zone", no_sfha: "no FEMA Special Flood Hazard Area" })[value] || null,
  maxSlopePct: (value) => `at most ${value}% of the lot on a 25%+ slope`,
  excludeUndermined: () => "no mapped undermined area",
  maxWalkMin: (value) => `within ${value} minutes' straight-line walk of a frequent stop`,
  minLotSqft: (value) => `lot at least ${Number(value).toLocaleString("en-US")} sq ft`,
  displacement: (value) => ({ high: "displacement screen 60 or higher", not_high: "displacement screen below 60" })[value] || null,
  qctOnly: () => "in a 2026 HUD Qualified Census Tract",
  area: (value) => `in ${value}`,
}

/** Plain-language list of the filters that differ from the defaults. */
export function describeFilters(filters) {
  const parts = []
  for (const [key, text] of Object.entries(FILTER_TEXT)) {
    const value = filters?.[key]
    if (value === null || value === undefined || value === "" || value === false || value === "any") continue
    const line = text(value)
    if (line) parts.push(line)
  }
  const records = ["vacant", "cityOwned", "taxDelinquent", "taxDelinquentPrior", "condemned"].filter((key) => filters?.[key])
  if (records.length > 1) parts.push(filters.combine === "any" ? "any one of the record filters" : "all of the record filters")
  return parts
}

function siteFacts(row, index) {
  const props = row.props
  return {
    rank: index + 1,
    address: props.address || null,
    neighborhood: props.neighborhood || null,
    zoning_district: props.zoning_code || null,
    ranked_as: typeLabel(row.typeId),
    zoning_reading: PERMISSION_LABELS[row.permission] || "Check with the City",
    weighted_total: row.composite,
    scores: row.row ? scoreRow(row.row) : null,
    records: {
      vacant_land_use: props.vacant_lot ?? null,
      city_owned: props.city_owned ?? null,
      city_status: props.city_status ? CITY_STATUS_LABELS[props.city_status] || props.city_status : null,
      tax_delinquent: props.tax_delinquent ?? null,
      tax_delinquent_prior_years: props.tax_delinquent_prior_years ?? null,
      condemned_or_dead_end: props.condemned_or_dead_end ?? null,
    },
    lot_sqft: props.lot_sqft ?? null,
    walk_minutes_to_frequent_stop_straight_line: props.walk_min_frequent ?? null,
    frequent_stop_name: props.frequent_stop_name ?? null,
    fema_flood_zone_overlap_percent: pct(props.sfha_overlap),
    steep_slope_overlap_percent: pct(props.steep_slope_overlap),
    undermined_overlap_percent: pct(props.undermined_overlap),
    displacement_risk_screen: placeDisplacement(props),
    qualified_census_tract_2026: props.qct_2026 ?? null,
    lihtc_projects_within_800m: props.lihtc_projects_800m ?? null,
  }
}

/** rows come from findSites(); total is the full match count. */
export function buildSitesContext({ rows, filters, sort, weights, sources, summary, zoningRules }) {
  const cited = sourceList(sources, summary, zoningRules)
  const top = rows.slice(0, TOP_SITES)
  const sortOption = SORT_OPTIONS.find((option) => option.id === sort) || SORT_OPTIONS[0]
  const facts = {
    task: "Explain why the top sites in this Find Sites list rank highest, and what the list does and does not show.",
    matches: rows.length,
    filters_applied: describeFilters({ ...DEFAULT_SITE_FILTERS, ...filters }),
    sorted_by: sortOption.label,
    sort_note:
      sortOption.id === "score"
        ? "Sorted by the weighted total of the type each site is ranked as."
        : "Sorted by this one field, not by the weighted total.",
    weights: weightFacts(weights),
    top_sites: top.map((row, index) => siteFacts(row, index)),
    next_weighted_total_after_top: rows[TOP_SITES]?.composite ?? null,
    public_record_caveat: SITE_CAVEAT,
    value_judgments: VALUE_JUDGMENTS,
    meanings: {
      displacement_risk_screen: "Tract-level screening signal, the same for every type on a parcel. Not a prediction that anyone will be displaced. Higher is worse.",
      marginal_carbon_index_estimate: "Relative 0–100 estimate per new home. Not tonnes of CO2. Higher is worse.",
      walk_minutes: "Straight-line walk to a stop with 60+ weekday scheduled trips. Not a route or reliability measure.",
    },
    sources: [
      cited.assessment,
      cited.cityOwned,
      cited.taxDelinquent,
      cited.condemned,
      cited.transit,
      cited.flood,
      cited.slope,
      cited.undermined,
      cited.tenure,
      cited.rent2019,
      cited.chas,
      cited.recs,
      cited.qct,
      cited.lihtc,
    ],
    zoning_source: cited.zoningCode,
  }
  return { facts, top }
}

/** Template fallback for the Find Sites list. */
export function explainSitesTemplate(context) {
  const { facts } = context
  if (!facts.matches) {
    return "No parcels match these filters, so there is nothing to rank. Loosen a filter. This is a screening aid, not a determination of what may be built."
  }
  const filterText = facts.filters_applied.length ? facts.filters_applied.join("; ") : "no filters"
  const lines = [
    `${facts.matches.toLocaleString("en-US")} parcels match (${filterText}). ${facts.sort_note}`,
  ]
  for (const site of facts.top_sites) {
    const s = site.scores || {}
    const bits = [
      `demand ${s.demand ?? "n/a"}`,
      `transit ${s.transit ?? "n/a"}`,
      `equity ${s.equity ?? "n/a"}`,
      `climate risk ${s.climate_risk ?? "n/a"}`,
      `displacement screen ${s.displacement_risk_screen ?? "n/a"}`,
      `carbon estimate ${s.marginal_carbon_index_estimate ?? "n/a"}`,
    ]
    lines.push(
      `${site.rank}. ${site.address || "Unaddressed parcel"} (${site.neighborhood}, ${site.zoning_district || "no zoning match"}): ${site.ranked_as}, ${site.zoning_reading}, weighted total ${site.weighted_total ?? "n/a"}; ${bits.join(", ")}.`,
    )
  }
  if (facts.next_weighted_total_after_top !== null && facts.sort_note.startsWith("Sorted by the weighted")) {
    lines.push(`The next site after these scores ${facts.next_weighted_total_after_top}. Small gaps can flip with a small weight change.`)
  }
  lines.push(
    `${facts.public_record_caveat} The weights are value judgments. Displacement is a screening signal and carbon is a relative estimate. Take real decisions to City Planning / the Zoning Administrator or a qualified professional.`,
  )
  return lines.join("\n\n")
}
