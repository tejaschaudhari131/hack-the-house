/** Evidence behind each factor for one parcel and one scored type, from the parcel record and the source manifest. */

import { sourceList } from "./explainFacts.js"
import { FACTORS } from "./factors.js"

const MODEL_DIMENSION = { demand: "demand", transit: "transit", equity: "equity", climate: "climate_risk", displacement: "displacement_risk", carbon: "carbon_index" }

function pct(value) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : null
}

function num(value, suffix = "") {
  return typeof value === "number" ? `${value.toLocaleString("en-US")}${suffix}` : null
}

function money(value) {
  return typeof value === "number" ? `$${Math.round(value).toLocaleString("en-US")}` : null
}

/** [label, value-or-null] pairs. A null value is listed as missing. */
function observed(id, props, typeId, summary) {
  const f = props.factors || {}
  switch (id) {
    case "demand":
      return [
        ["Neighborhood median valid sale price", num(f.price_per_sqft, " $/sq ft")],
        ["Neighborhood valid sales per 100 parcels", num(f.turnover_per_100)],
        ["Neighborhood valid sales counted", num(f.valid_sales)],
        ["Lot area", num(props.lot_sqft, " sq ft")],
        [`Assumed lot-fit value for this type (0–1)`, num(f.lot_fit?.[typeId])],
      ]
    case "transit":
      return [
        ["Weekday scheduled trips within 400 m", num(props.trips_within_400m)],
        ["Nearest stop", props.nearest_stop_name ? `${props.nearest_stop_name}, ${num(props.nearest_stop_m, " m")} straight-line` : null],
        ["Routes within 400 m", (props.routes_within_400m || []).join(", ") || null],
        ["Straight-line walk to a frequent stop (60+ weekday trips)", num(props.walk_min_frequent, " min")],
      ]
    case "equity":
      return [
        [`Median household income (${props.census_geography === "tract" ? "tract" : "block group"})`, money(props.median_income)],
        ["Margin of error on that income", money(props.income_moe)],
        ["Allegheny County median income", money(summary?.county_median_income)],
        ["Renters paying 30%+ of income (ACS, all renters)", pct(props.rent_burden_share)],
        ["Low-income renters paying over 30% (CHAS, tract)", pct(props.chas_rent_burden_share)],
      ]
    case "climate":
      return [
        ["FEMA Special Flood Hazard Area overlap", pct(props.sfha_overlap)],
        ["FEMA 0.2% annual-chance zone overlap", pct(props.flood_02_overlap)],
        ["25%+ slope overlap (landslide-risk proxy)", pct(props.steep_slope_overlap)],
        ["Undermined-area overlap (preliminary screen)", pct(props.undermined_overlap)],
      ]
    case "displacement":
      return [
        ["Tract renter share of occupied homes", pct(props.renter_share)],
        ["Low-income renters paying over 30% (CHAS, tract)", pct(props.chas_rent_burden_share)],
        ["Tract rent growth minus county, 2015–19 to 2020–24", typeof props.rent_change_vs_county === "number" ? `${Math.round(props.rent_change_vs_county * 100)} percentage points` : null],
        ["HUD Qualified Census Tract 2026", typeof props.qct_2026 === "boolean" ? (props.qct_2026 ? "yes" : "no") : null],
      ]
    case "carbon":
      return [
        ["Building type used for energy and the embodied tier", typeId],
        ["Transport term input (this place's transit score)", num(props.scores?.[typeId]?.transit)],
        ["Transport component recorded by the pipeline (0–1)", num(f.carbon_transport)],
      ]
    default:
      return []
  }
}

/** One entry per factor: sources with links, vintage, geography, observed inputs, assumptions, missing data, and limits. */
export function buildEvidence({ props, typeId, sources, summary, zoningRules, model }) {
  const cited = sourceList(sources, summary, zoningRules)
  const dims = Object.fromEntries((model?.dimensions || []).map((dim) => [dim.id, dim]))
  const score = props.scores?.[typeId] || {}
  return FACTORS.map((factor) => {
    const dim = dims[MODEL_DIMENSION[factor.id]]
    const rows = observed(factor.id, props, typeId, summary)
    const factorSources = factor.sourceIds.map((key) => cited[key]).filter((source) => source?.name)
    const value = score[factor.scoreKey]
    const missing = rows.filter(([, v]) => v === null || v === undefined).map(([label]) => label)
    return {
      id: factor.id,
      label: factor.label,
      value: typeof value === "number" ? value : null,
      direction: factor.direction,
      geography: factor.scope,
      sources: factorSources.map((source) => ({ name: source.name, vintage: source.vintage, url: source.url, limit: source.caveat })),
      observed: rows.filter(([, v]) => v !== null && v !== undefined),
      assumptions: [factor.meaning, ...(dim?.normative || [])],
      missing: typeof value === "number" ? missing : [`No ${factor.label.toLowerCase()} score for this type; it is left out and the other weights renormalize.`, ...missing],
    }
  })
}
