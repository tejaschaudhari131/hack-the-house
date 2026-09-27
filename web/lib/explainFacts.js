/** Grounded facts for the explanation. Only fields listed here reach the model or the template.
 * Shares are converted to whole percents here so the model never has to do arithmetic.
 */

import { BUILDINGS, WALK_RADIUS_M } from "./buildings.js"
import { compareDrops } from "./compare.js"
import { featurePoint, stopsWithin } from "./geo.js"
import { TYPE_LABELS, rankTypes } from "./rank.js"
import { dropZoningBadge, resolveZoning } from "./zoning.js"

const USE_TABLE = "Pittsburgh Zoning Code §911.02 use table"

function pct(share) {
  if (share === null || share === undefined || Number.isNaN(Number(share))) return null
  return Math.round(Number(share) * 100)
}

function present(value) {
  return value === undefined ? null : value
}

function sourceByName(sources, name) {
  return (sources || []).find((item) => item.name === name) || null
}

function cite(sources, name, vintage) {
  const row = sourceByName(sources, name)
  const caveat = row?.caveat ? String(row.caveat).slice(0, 220) : null
  return { name, vintage, pulled: row?.pulled_at || null, caveat }
}

/** Source names match data/processed/sources.json. Vintages follow docs/DATA_NOTES.md. */
export function sourceList(sources, summary, zoningRules) {
  const saleCutoff = summary?.sale_cutoff || "2021-09-26"
  const serviceDate = summary?.transit_service_date || "2026-09-25"
  return {
    assessment: cite(
      sources,
      "Allegheny County property assessments",
      `Assessment roll as pulled; valid sales (county code 0, price at least $10,000) on or after ${saleCutoff}`,
    ),
    acs: cite(sources, "ACS 2024 5-year tables B19013, B25064, and B25070", "2024 ACS 5-year (survey years 2020–2024), block group"),
    chas: cite(sources, "Comprehensive Housing Affordability Strategy (CHAS)", "HUD CHAS 2018–2022, Table 8, census tract"),
    transit: cite(sources, "Pittsburgh Regional Transit GTFS", `Scheduled weekday service on ${serviceDate}`),
    flood: cite(sources, "FEMA National Flood Hazard Layer flood zones", "NFHL layer 28 as published on the pull date"),
    slope: cite(sources, "Pittsburgh Steep Slopes (25% or greater)", "City layer as published on the pull date"),
    undermined: cite(sources, "Pittsburgh Undermined Areas", "City/county layer as published on the pull date"),
    zoningMap: cite(sources, "City of Pittsburgh zoning districts", "Zoning map as published on the pull date (district code only)"),
    zoningCode: {
      name: USE_TABLE,
      vintage: "Saved copy of the use table read for this build",
      pulled: null,
      caveat: zoningRules?.meta?.code_access ? String(zoningRules.meta.code_access).slice(0, 220) : null,
      url: zoningRules?.meta?.use_table_url || "https://ecode360.com/45476524#45476524",
    },
  }
}

function zoningFacts(props, zoningInfo, zoningRules, whatIf) {
  const district = zoningInfo?.district || {}
  return {
    district_code: props.zoning_code || null,
    district_label: props.zoning_label || null,
    status: zoningInfo?.status || "missing_rules",
    status_meaning: {
      use_table: "The district is a column in §911.02, so each housing type has a reading.",
      not_in_use_table: "The district is not a column in §911.02. Nothing is marked prohibited. Check with the City.",
      use_table_unread: "The use table was not read for this district. Nothing was filtered.",
      unmapped: "The district is not in the rules file. Check with the City. Nothing is marked prohibited.",
      no_zoning: "No zoning polygon covered this parcel.",
      missing_rules: "The zoning rules file did not load.",
    }[zoningInfo?.status || "missing_rules"],
    citation: zoningInfo?.status === "use_table" ? `${USE_TABLE} (${zoningInfo.codeSection || "§911.02"})` : null,
    citation_url: zoningInfo?.codeUrl || zoningRules?.meta?.use_table_url || null,
    legend: zoningRules?.meta?.legend || null,
    mapping_assumption: zoningRules?.meta?.mapping_assumption || null,
    standards_cited: district.standards ? [...new Set(district.standards)] : [],
    needs_expert_review: true,
    what_if_zoning_on: Boolean(whatIf),
    note: zoningInfo?.note || null,
  }
}

function typeZoning(typeId, zoningInfo, whatIf) {
  const badge = dropZoningBadge(typeId, zoningInfo)
  const specialApproval = badge.id === "approval"
  return {
    reading: badge.label,
    detail: badge.detail,
    needs_special_approval: specialApproval,
    treated_as_allowed_by_what_if: Boolean(whatIf && zoningInfo?.status === "use_table"),
  }
}

function placeInputs(props, summary, sources) {
  const factors = props.factors || {}
  return {
    demand: {
      neighborhood_median_valid_sale_price_per_sqft: present(factors.price_per_sqft),
      neighborhood_valid_sales_per_100_parcels: present(factors.turnover_per_100),
      neighborhood_valid_sales_count: present(factors.valid_sales),
      lot_sqft: present(props.lot_sqft),
      source: sources.assessment,
    },
    transit: {
      weekday_scheduled_trips_within_400m: present(props.trips_within_400m),
      nearest_stop_name: present(props.nearest_stop_name),
      nearest_stop_meters: present(props.nearest_stop_m),
      routes_within_400m: (props.routes_within_400m || []).slice(0, 8),
      same_for_every_housing_type: true,
      source: sources.transit,
    },
    equity: {
      median_household_income: present(props.median_income),
      median_income_margin_of_error: present(props.income_moe),
      census_geography: props.census_geography === "tract" ? "census tract (block group missing)" : "block group",
      county_median_income: present(summary?.county_median_income),
      acs_renters_paying_30pct_or_more_percent: pct(props.rent_burden_share),
      chas_low_income_renters_paying_over_30pct_percent: pct(props.chas_rent_burden_share),
      chas_tract: present(props.chas_tract_geoid),
      acs_vs_chas: "Different measures: ACS covers all renters (2020–2024, block group). CHAS covers renters at or below 80% of HAMFI (2018–2022, tract). Do not merge them.",
      sources: [sources.acs, sources.chas],
    },
    flood: {
      fema_special_flood_hazard_area_overlap_percent: pct(props.sfha_overlap),
      fema_0_2pct_annual_chance_overlap_percent: pct(props.flood_02_overlap),
      flood_zones: props.flood_zones || [],
      meaning: "Map overlap only. Not a flood determination or survey.",
      source: sources.flood,
    },
    steep_slope: {
      overlap_percent: pct(props.steep_slope_overlap),
      meaning: "Slopes of 25% or greater, a landslide-risk proxy. Not a landslide inventory.",
      source: sources.slope,
    },
    undermined: {
      overlap_percent: pct(props.undermined_overlap),
      meaning: "Preliminary mine-subsidence screen. Historic mine maps can be incomplete. Not a safety determination.",
      source: sources.undermined,
    },
  }
}

const VALUE_JUDGMENTS = [
  "The four weights, set by the person using the tool.",
  "Lot-fit curves that prefer townhouses on small lots and larger buildings on big lots (part of demand).",
  "Equity type factors: larger buildings get more production value where incomes are lower and more displacement exposure where sales are hot.",
  "The 50/30/20 blend of flood, steep-slope proxy, and undermined area, and a small climate penalty that rises with building size.",
  "Fixed score anchors (for example $80–$350 per square foot). A high score is high on that anchor, not a citywide percentile.",
]

function weightFacts(weights) {
  return {
    demand: weights.demand,
    transit: weights.transit,
    equity: weights.equity,
    climate: weights.climate,
    note: "Value judgments chosen by the user. The weighted total is the weighted average of demand, transit, equity, and climate suitability (100 minus climate risk). Missing scores are skipped, not treated as zero.",
  }
}

function scoreRow(row) {
  return {
    type: row.id,
    label: row.label,
    weighted_total: row.composite,
    demand: row.demand,
    transit: row.transit,
    equity: row.equity,
    climate_risk: row.climate_risk,
    climate_suitability: row.climate_suitability,
  }
}

function templateParcel(props) {
  return {
    pin: props.pin,
    address: props.address,
    neighborhood: props.neighborhood,
    land_use: props.land_use,
    lot_sqft: props.lot_sqft,
    zoning_code: props.zoning_code,
    zoning_label: props.zoning_label,
    census_geography: props.census_geography,
    median_income: props.median_income,
    rent_burden_share: props.rent_burden_share,
    chas_rent_burden_share: props.chas_rent_burden_share,
    chas_tract_geoid: props.chas_tract_geoid,
    chas_vintage: props.chas_vintage,
    sfha_overlap: props.sfha_overlap,
    steep_slope_overlap: props.steep_slope_overlap,
    undermined_overlap: props.undermined_overlap,
    flood_zones: props.flood_zones,
    trips_within_400m: props.trips_within_400m,
    nearest_stop_m: props.nearest_stop_m,
    nearest_stop_name: props.nearest_stop_name,
    routes_within_400m: props.routes_within_400m,
    confidence: props.confidence,
    confidence_label: props.confidence_label,
    confidence_notes: props.confidence_notes,
  }
}

/** One parcel, four housing types. Returns the model facts and the template input from the same numbers. */
export function buildParcelContext({ props, weights, whatIf = false, zoningRules, sources, summary }) {
  const zoningInfo = resolveZoning(props.zoning_code, zoningRules)
  const ranked = rankTypes(props.scores, weights, { allowed: zoningInfo.allowed || null, whatIf })
  const cited = sourceList(sources, summary, zoningRules)
  const facts = {
    task: "Explain why the four housing types rank as they do on this one parcel, especially the top two.",
    place: {
      address: props.address || null,
      neighborhood: props.neighborhood || null,
      land_use: props.land_use || null,
      lot_sqft: present(props.lot_sqft),
    },
    weights: weightFacts(weights),
    ranking: ranked.map((row, index) => ({
      rank: index + 1,
      ...scoreRow(row),
      zoning: typeZoning(row.id, zoningInfo, whatIf),
    })),
    ranking_rule:
      zoningInfo.status === "use_table" && !whatIf
        ? "Types §911.02 permits by right (including partial unit counts) are listed first; the rest follow by weighted total."
        : "Ranked by weighted total with no zoning filter.",
    zoning: zoningFacts(props, zoningInfo, zoningRules, whatIf),
    inputs: placeInputs(props, summary, cited),
    value_judgments: VALUE_JUDGMENTS,
    confidence: {
      label: props.confidence_label || null,
      value: present(props.confidence),
      meaning: "Only about missing or thin data. Not a grade for the value judgments.",
      notes: props.confidence_notes || [],
    },
    zoning_source: cited.zoningCode,
    zoning_map_source: cited.zoningMap,
  }
  const templateInput = {
    parcel: templateParcel(props),
    ranked: ranked.map((row) => ({ ...scoreRow(row), id: row.id, composite: row.composite, allowed: row.allowed })),
    weights,
    whatIf,
    zoning: {
      status: zoningInfo.status,
      code: zoningInfo.code,
      allowed: zoningInfo.allowed ? [...zoningInfo.allowed] : null,
      note: zoningInfo.note,
      use_notes: zoningInfo.district?.use_notes || null,
    },
    countyMedianIncome: summary?.county_median_income ?? null,
  }
  return { facts, templateInput, ranked, zoningInfo }
}

function dropSide(slot, drop, feature, weights, zoningRules, stops, summary, cited) {
  const props = feature.properties
  const zoningInfo = resolveZoning(props.zoning_code, zoningRules)
  const ranked = rankTypes(props.scores, weights, { allowed: zoningInfo.allowed || null, whatIf: false })
  const row = ranked.find((item) => item.id === drop.typeId) || null
  const point = featurePoint(feature.geometry)
  const ring = point && stops ? stopsWithin(stops, point[0], point[1], WALK_RADIUS_M) : null
  const spec = BUILDINGS[drop.typeId]
  return {
    card: {
      pin: props.pin,
      address: props.address,
      neighborhood: props.neighborhood,
      typeLabel: TYPE_LABELS[drop.typeId],
      composite: row?.composite ?? null,
      demand: row?.demand ?? null,
      transit: row?.transit ?? null,
      equity: row?.equity ?? null,
      climate_suitability: row?.climate_suitability ?? null,
    },
    facts: {
      building: slot,
      housing_type: TYPE_LABELS[drop.typeId],
      homes_shown: spec?.units ?? null,
      homes_note: "Display default for the type. Not a permit or unit count, and it does not change the scores.",
      place: {
        address: props.address || null,
        neighborhood: props.neighborhood || null,
        land_use: props.land_use || null,
        lot_sqft: present(props.lot_sqft),
      },
      scores: row ? scoreRow(row) : null,
      zoning: {
        ...zoningFacts(props, zoningInfo, zoningRules, false),
        this_type: typeZoning(drop.typeId, zoningInfo, false),
      },
      walk_ring_800m: ring
        ? { stops: ring.count, weekday_scheduled_trips: ring.trips, routes: ring.routes }
        : null,
      inputs: placeInputs(props, summary, cited),
      confidence: {
        label: props.confidence_label || null,
        value: present(props.confidence),
        notes: props.confidence_notes || [],
      },
    },
  }
}

/** Two dropped buildings (scenario A and B). */
export function buildCompareContext({ a, b, featureA, featureB, weights, zoningRules, stops, sources, summary }) {
  const cited = sourceList(sources, summary, zoningRules)
  const left = dropSide("A", a, featureA, weights, zoningRules, stops, summary, cited)
  const right = dropSide("B", b, featureB, weights, zoningRules, stops, summary, cited)
  const sentence = compareDrops(left.card, right.card)
  const facts = {
    task: "Explain why scenario A and scenario B rank differently. Each scenario is one housing type dropped on one parcel.",
    same_parcel: featureA.properties.pin === featureB.properties.pin,
    weights: weightFacts(weights),
    scenario_a: left.facts,
    scenario_b: right.facts,
    rule_based_comparison: sentence,
    value_judgments: VALUE_JUDGMENTS,
    zoning_source: cited.zoningCode,
    zoning_map_source: cited.zoningMap,
  }
  return { facts, sentence, left, right }
}

/** Template fallback for the two-scenario comparison. Uses the same facts the model sees. */
export function explainCompareTemplate(context) {
  const { facts, sentence } = context
  const sideText = (side) => {
    const zoning = side.zoning.this_type
    const scores = side.scores
    const where = side.place.address || "the parcel"
    const total = scores?.weighted_total ?? "n/a"
    return `Building ${side.building}, ${side.housing_type} at ${where} (${side.place.neighborhood}): weighted total ${total}; demand ${scores?.demand ?? "n/a"}, transit ${scores?.transit ?? "n/a"}, equity ${scores?.equity ?? "n/a"}, climate risk ${scores?.climate_risk ?? "n/a"}. Zoning reading: ${zoning.reading}. ${zoning.detail}`
  }
  const w = facts.weights
  return [
    `${sentence}`,
    sideText(facts.scenario_a),
    sideText(facts.scenario_b),
    `Value judgments, not measurements: your weights (demand ${w.demand}, transit ${w.transit}, equity ${w.equity}, climate ${w.climate}), the lot-fit curves, the equity type factors, and the flood/slope/undermined blend. Home counts are display defaults and do not change the scores.`,
    "This is a screening comparison, not legal, zoning, or financial advice. A consequential decision should go to City Planning / the Zoning Administrator or a qualified professional.",
  ].join("\n\n")
}
