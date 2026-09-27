/** Find Sites: filter parcels on public-record flags, zoning, hazards, and transit, then rank. */

import { TYPE_LABELS, rankTypes } from "./rank.js"
import { dropZoningBadge, resolveZoning } from "./zoning.js"

export const SITE_CAVEAT =
  "A public record is not availability. City ownership, vacancy, tax delinquency, and condemnation do not mean a parcel is for sale, empty today, or buildable. Verify with the Urban Redevelopment Authority (URA), the Pittsburgh Land Bank, or the City before acting."

export const HIGH_DISPLACEMENT = 60

export const TYPE_OPTIONS = [
  { id: "", label: "Any of the four types" },
  { id: "single_family", label: TYPE_LABELS.single_family, scoreType: "single_family" },
  { id: "townhouse_duplex", label: TYPE_LABELS.townhouse_duplex, scoreType: "townhouse_duplex" },
  { id: "triplex", label: "Triplex (3 units, §911.02 Three-Unit row)", scoreType: "small_apartment" },
  { id: "small_apartment", label: TYPE_LABELS.small_apartment, scoreType: "small_apartment" },
  { id: "large_apartment", label: TYPE_LABELS.large_apartment, scoreType: "large_apartment" },
]

export const CITY_STATUS_LABELS = {
  available: "Available for sale",
  sale_pending: "Sale pending",
  acquisition_pending: "Acquisition pending",
  hold_for_study: "Hold for study",
  permanent: "Permanent City holding",
  unknown: "Status unknown",
}

export const DEFAULT_SITE_FILTERS = {
  vacant: false,
  cityOwned: false,
  taxDelinquent: false,
  taxDelinquentPrior: false,
  condemned: false,
  combine: "all",
  excludeOpenSpace: true,
  typeId: "",
  permission: "any",
  flood: "any",
  maxSlopePct: null,
  excludeUndermined: false,
  maxWalkMin: null,
  minLotSqft: null,
  displacement: "any",
  qctOnly: false,
  area: "",
}

export const EXAMPLE_QUERIES = [
  {
    id: "city-triplex",
    label: "City-owned vacant lots where a triplex is allowed by right, outside flood zones, near frequent transit",
    detail: "Frequent transit here means a stop with 60+ weekday trips within a 10-minute straight-line walk.",
    filters: {
      vacant: true,
      cityOwned: true,
      combine: "all",
      excludeOpenSpace: true,
      typeId: "triplex",
      permission: "by_right",
      flood: "none",
      maxWalkMin: 10,
    },
  },
  {
    id: "acquisition",
    label: "Vacant lots tax-delinquent for more than the current year where a townhouse or duplex is allowed by right, with no mapped flood zone, steep slope, or undermined area",
    detail: "A starting list for a Land Bank or acquisition conversation. Delinquency can be paid or appealed at any time; every record needs checking.",
    filters: {
      vacant: true,
      taxDelinquentPrior: true,
      typeId: "townhouse_duplex",
      permission: "by_right",
      combine: "all",
      flood: "none",
      maxSlopePct: 0,
      excludeUndermined: true,
    },
  },
  {
    id: "anti-displacement",
    label: "Vacant lots of 3,000+ sq ft in high displacement-risk tracts where a small apartment building is allowed by right or with special approval",
    detail:
      "An intervention question: it looks for high-risk tracts on purpose. Choosing it also sets the displacement weight to 0, so the ranking does not push these places down. That is a choice about the objective; it does not lower anyone's risk, and the risk values stay visible.",
    weights: { displacement: 0 },
    filters: {
      vacant: true,
      typeId: "small_apartment",
      permission: "by_right_or_special",
      displacement: "high",
      minLotSqft: 3000,
    },
  },
]

const PERMISSION_FROM_BADGE = {
  allowed: "by_right",
  partial: "partial",
  approval: "special",
  not_allowed: "not_allowed",
  unreviewed: "unknown",
}

export const PERMISSION_LABELS = {
  by_right: "Allowed by right",
  partial: "By right for some unit counts",
  special: "Special approval",
  not_allowed: "Not allowed",
  unknown: "Check with the City",
}

function letterPermission(letter) {
  if (letter === undefined || letter === null) return "unknown"
  const text = String(letter).trim().toUpperCase()
  if (text === "P") return "by_right"
  if (text === "") return "not_allowed"
  return "special"
}

/** §911.02 reading for one type, or for a triplex from the Three-Unit row. */
export function typePermission(typeId, zoningInfo) {
  if (typeId === "triplex") {
    if (zoningInfo?.status !== "use_table") return "unknown"
    return letterPermission(zoningInfo.district?.use_rows?.["Three-Unit"])
  }
  return PERMISSION_FROM_BADGE[dropZoningBadge(typeId, zoningInfo).id] || "unknown"
}

export function permissionPasses(permission, wanted) {
  if (!wanted || wanted === "any") return true
  if (wanted === "by_right") return permission === "by_right" || permission === "partial"
  if (wanted === "by_right_or_special") {
    return permission === "by_right" || permission === "partial" || permission === "special"
  }
  return true
}

function scoreTypeFor(typeId) {
  return TYPE_OPTIONS.find((option) => option.id === typeId)?.scoreType || null
}

export function placeDisplacement(props) {
  const value = props?.scores?.small_apartment?.displacement_risk
  return value === undefined ? null : value
}

const FLAG_FILTERS = [
  ["vacant", "vacant_lot"],
  ["cityOwned", "city_owned"],
  ["taxDelinquent", "tax_delinquent"],
  ["taxDelinquentPrior", "tax_delinquent_prior_years"],
  ["condemned", "condemned_or_dead_end"],
]

/** Filters that do not depend on zoning or weights. Unknown data fails a filter that asks about it. */
export function passesRecordFilters(props, filters) {
  const active = FLAG_FILTERS.filter(([key]) => filters[key])
  if (active.length) {
    const hits = active.map(([, prop]) => props[prop] === true)
    const ok = filters.combine === "any" ? hits.some(Boolean) : hits.every(Boolean)
    if (!ok) return false
  }
  if (filters.excludeOpenSpace && (props.city_open_space === true || props.land_use === "PUBLIC PARK")) return false
  if (filters.area && props.area !== filters.area) return false
  if (filters.flood === "none") {
    if (props.sfha_overlap === null || props.sfha_overlap === undefined) return false
    if ((props.sfha_overlap || 0) > 0 || (props.flood_02_overlap || 0) > 0) return false
  } else if (filters.flood === "no_sfha") {
    if (props.sfha_overlap === null || props.sfha_overlap === undefined) return false
    if ((props.sfha_overlap || 0) > 0) return false
  }
  if (filters.maxSlopePct !== null && filters.maxSlopePct !== undefined && filters.maxSlopePct !== "") {
    if (props.steep_slope_overlap === null || props.steep_slope_overlap === undefined) return false
    if (props.steep_slope_overlap * 100 > Number(filters.maxSlopePct)) return false
  }
  if (filters.excludeUndermined) {
    if (props.undermined_overlap === null || props.undermined_overlap === undefined) return false
    if (props.undermined_overlap > 0) return false
  }
  if (filters.maxWalkMin !== null && filters.maxWalkMin !== undefined && filters.maxWalkMin !== "") {
    if (props.walk_min_frequent === null || props.walk_min_frequent === undefined) return false
    if (props.walk_min_frequent > Number(filters.maxWalkMin)) return false
  }
  if (filters.minLotSqft) {
    if (!props.lot_sqft || props.lot_sqft < Number(filters.minLotSqft)) return false
  }
  if (filters.displacement && filters.displacement !== "any") {
    const risk = placeDisplacement(props)
    if (risk === null) return false
    if (filters.displacement === "high" && risk < HIGH_DISPLACEMENT) return false
    if (filters.displacement === "not_high" && risk >= HIGH_DISPLACEMENT) return false
  }
  if (filters.qctOnly && props.qct_2026 !== true) return false
  return true
}

/** Zoning check and the score used to rank one parcel. Null when zoning fails the filter. */
export function evaluateSite(props, filters, weights, zoningRules) {
  const zoningInfo = resolveZoning(props.zoning_code, zoningRules)
  const ranked = rankTypes(props.scores, weights, { allowed: zoningInfo.allowed, whatIf: false })
  if (filters.typeId) {
    const permission = typePermission(filters.typeId, zoningInfo)
    if (!permissionPasses(permission, filters.permission)) return null
    const scoreType = scoreTypeFor(filters.typeId)
    const row = ranked.find((item) => item.id === scoreType)
    return { typeId: filters.typeId, scoreType, permission, composite: row?.composite ?? null, row, zoningInfo }
  }
  for (const row of ranked) {
    const permission = typePermission(row.id, zoningInfo)
    if (row.composite === null || !permissionPasses(permission, filters.permission)) continue
    return { typeId: row.id, scoreType: row.id, permission, composite: row.composite, row, zoningInfo }
  }
  return null
}

const SORTS = {
  score: (row) => row.composite ?? -1,
  lot: (row) => row.props.lot_sqft ?? -1,
  walk: (row) => -(row.props.walk_min_frequent ?? 999),
  displacement: (row) => placeDisplacement(row.props) ?? -1,
  low_carbon: (row) => -(row.row?.carbon_index ?? 999),
}

export const SORT_OPTIONS = [
  { id: "score", label: "Weighted score (your sliders)" },
  { id: "lot", label: "Largest lot" },
  { id: "walk", label: "Shortest walk to frequent transit" },
  { id: "displacement", label: "Highest displacement risk" },
  { id: "low_carbon", label: "Lowest carbon estimate" },
]

export function findSites(features, filters, weights, zoningRules, sort = "score") {
  const rows = []
  for (const feature of features || []) {
    const props = feature.properties
    if (!passesRecordFilters(props, filters)) continue
    const site = evaluateSite(props, filters, weights, zoningRules)
    if (!site) continue
    rows.push({ pin: props.pin, props, ...site })
  }
  const key = SORTS[sort] || SORTS.score
  rows.sort((a, b) => key(b) - key(a) || String(a.pin).localeCompare(String(b.pin)))
  return rows
}

export function filtersFor(example) {
  return { ...DEFAULT_SITE_FILTERS, ...(example?.filters || {}) }
}

function csvCell(value) {
  if (value === null || value === undefined) return ""
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const CSV_COLUMNS = [
  ["pin", (row) => row.pin],
  ["address", (row) => row.props.address],
  ["neighborhood", (row) => row.props.neighborhood],
  ["zoning_code", (row) => row.props.zoning_code],
  ["ranked_type", (row) => TYPE_OPTIONS.find((option) => option.id === row.typeId)?.label || row.typeId],
  ["zoning_reading", (row) => PERMISSION_LABELS[row.permission]],
  ["weighted_score", (row) => row.composite],
  ["lot_sqft", (row) => row.props.lot_sqft],
  ["land_use", (row) => row.props.land_use],
  ["vacant_lot", (row) => row.props.vacant_lot],
  ["city_owned", (row) => row.props.city_owned],
  ["city_inventory", (row) => row.props.city_inventory],
  ["city_status", (row) => row.props.city_status],
  ["tax_delinquent", (row) => row.props.tax_delinquent],
  ["tax_delinquent_prior_years", (row) => row.props.tax_delinquent_prior_years],
  ["condemned_or_dead_end", (row) => row.props.condemned_or_dead_end],
  ["qct_2026", (row) => row.props.qct_2026],
  ["sfha_overlap", (row) => row.props.sfha_overlap],
  ["steep_slope_overlap", (row) => row.props.steep_slope_overlap],
  ["undermined_overlap", (row) => row.props.undermined_overlap],
  ["walk_min_frequent_straight_line", (row) => row.props.walk_min_frequent],
  ["displacement_risk_screen", (row) => placeDisplacement(row.props)],
  ["carbon_index_estimate", (row) => row.row?.carbon_index],
  ["lihtc_projects_800m", (row) => row.props.lihtc_projects_800m],
]

export function sitesCsv(rows) {
  const lines = [
    csvCell(`# ${SITE_CAVEAT} Screening aid only; not a zoning determination.`),
    CSV_COLUMNS.map(([name]) => name).join(","),
  ]
  for (const row of rows) lines.push(CSV_COLUMNS.map(([, get]) => csvCell(get(row))).join(","))
  return `${lines.join("\n")}\n`
}
