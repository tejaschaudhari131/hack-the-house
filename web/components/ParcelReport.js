"use client"

import { useEffect, useMemo, useState } from "react"

import { AI_LABEL } from "./Explanation.js"
import { buildParcelContext } from "../lib/explainFacts.js"
import { explainTemplate } from "../lib/explainTemplate.js"
import { loadFlags } from "../lib/flags.js"
import { matchPreset } from "../lib/presets.js"
import { describeRobustness, parcelRobustness } from "../lib/robustness.js"

const ZONING_PAGE_URL = "https://www.pittsburghpa.gov/Business-Development/City-Planning/Zoning"

function fmt(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "missing"
  return `${typeof value === "number" ? value.toLocaleString("en-US") : value}${suffix}`
}

function Outline({ geometry }) {
  const ring = geometry?.type === "Polygon" ? geometry.coordinates[0] : geometry?.type === "MultiPolygon" ? geometry.coordinates[0]?.[0] : null
  if (!ring?.length) return null
  const lat = ring[0][1]
  const kx = Math.cos((lat * Math.PI) / 180)
  const xs = ring.map((c) => c[0] * kx)
  const ys = ring.map((c) => c[1])
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const span = Math.max(maxX - minX, maxY - minY) || 1
  const points = ring.map((_, i) => `${(((xs[i] - minX) / span) * 80 + 10).toFixed(1)},${(((maxY - ys[i]) / span) * 80 + 10).toFixed(1)}`).join(" ")
  return (
    <svg className="report-outline" viewBox="0 0 100 100" role="img" aria-label="Parcel outline, north up, not to scale">
      <polygon points={points} fill="#e0e7ff" stroke="#1d4e89" strokeWidth="2" />
    </svg>
  )
}

function inputRows(inputs) {
  const pctText = (value) => (value === null || value === undefined ? "missing" : `${value}%`)
  return [
    ["Median valid sale price per sq ft (neighborhood)", fmt(inputs.demand.neighborhood_median_valid_sale_price_per_sqft, " $/sq ft"), inputs.demand.source],
    ["Valid sales per 100 parcels (neighborhood)", fmt(inputs.demand.neighborhood_valid_sales_per_100_parcels), inputs.demand.source],
    ["Weekday scheduled trips within 400 m", fmt(inputs.transit.weekday_scheduled_trips_within_400m), inputs.transit.source],
    ["Nearest stop", inputs.transit.nearest_stop_name ? `${inputs.transit.nearest_stop_name}, ${fmt(inputs.transit.nearest_stop_meters, " m")}` : "missing", inputs.transit.source],
    [`Median household income (${inputs.equity.census_geography})`, inputs.equity.median_household_income ? `$${fmt(inputs.equity.median_household_income)} (county $${fmt(inputs.equity.county_median_income)})` : "missing", inputs.equity.sources[0]],
    ["Renters paying 30%+ of income (ACS, all renters)", pctText(inputs.equity.acs_renters_paying_30pct_or_more_percent), inputs.equity.sources[0]],
    ["Low-income renters paying over 30% (CHAS, tract)", pctText(inputs.equity.chas_low_income_renters_paying_over_30pct_percent), inputs.equity.sources[1]],
    ["FEMA Special Flood Hazard Area overlap", pctText(inputs.flood.fema_special_flood_hazard_area_overlap_percent), inputs.flood.source],
    ["25%+ slope overlap (landslide-risk proxy)", pctText(inputs.steep_slope.overlap_percent), inputs.steep_slope.source],
    ["Undermined-area overlap (preliminary screen)", pctText(inputs.undermined.overlap_percent), inputs.undermined.source],
  ]
}

/** Print-only one-page report for the selected parcel. Hidden on screen; see @media print in globals.css. */
export default function ParcelReport({ feature, weights, whatIf, zoning, summary, explanation }) {
  const [sources, setSources] = useState(null)
  const [flag, setFlag] = useState(null)
  const pin = feature.properties.pin
  useEffect(() => {
    const read = () => setFlag(loadFlags()[pin] || null)
    read()
    window.addEventListener("beforeprint", read)
    return () => window.removeEventListener("beforeprint", read)
  }, [pin])
  useEffect(() => {
    let cancelled = false
    fetch("/data/sources.json")
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled) setSources(json)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const props = feature.properties
  const context = useMemo(
    () => buildParcelContext({ props, weights, whatIf, zoningRules: zoning, sources, summary }),
    [props, weights, whatIf, zoning, sources, summary],
  )
  const robustness = useMemo(
    () => parcelRobustness(props.scores, context.zoningInfo, weights, whatIf),
    [props.scores, context.zoningInfo, weights, whatIf],
  )
  const { facts } = context
  const preset = matchPreset(weights)
  const ai = explanation?.source === "ai" && !explanation.streaming
  const summaryText = ai ? explanation.text : explainTemplate(context.templateInput)
  const generated = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })

  return (
    <article className="print-report">
      <header className="report-head">
        <div>
          <p className="report-kicker">Housing Typology, Equity &amp; Climate Matchmaker · Parcel screening report</p>
          <h1>{props.address || `Parcel ${props.pin}`}</h1>
          <p>
            {props.neighborhood} · PIN {props.pin} · {fmt(props.land_use)} · lot {fmt(props.lot_sqft, " sq ft")} · zoning{" "}
            {fmt(props.zoning_code)}
            {props.zoning_label ? ` (${props.zoning_label})` : ""}
          </p>
          <p className="report-callout">
            <strong>Screening aid only.</strong> Not a zoning determination, permit, appraisal, or legal advice. Confirm
            with City Planning / the Zoning Administrator ({ZONING_PAGE_URL}, 412-255-2621) or a qualified professional.
          </p>
        </div>
        <Outline geometry={feature.geometry} />
      </header>

      <section>
        <h2>Housing types ranked, with the §911.02 reading</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Type</th>
              <th>Total</th>
              <th>Demand</th>
              <th>Transit</th>
              <th>Equity</th>
              <th>Climate risk</th>
              <th>§911.02 reading</th>
            </tr>
          </thead>
          <tbody>
            {facts.ranking.map((row) => (
              <tr key={row.type}>
                <td>{row.rank}</td>
                <td>{row.label}</td>
                <td>{fmt(row.weighted_total)}</td>
                <td>{fmt(row.demand)}</td>
                <td>{fmt(row.transit)}</td>
                <td>{fmt(row.equity)}</td>
                <td>{fmt(row.climate_risk)}</td>
                <td>
                  {row.zoning.treated_as_allowed_by_what_if ? "What-if: treated as allowed" : row.zoning.reading}
                  {row.zoning.needs_special_approval ? " (special approval, not a variance)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="report-small">
          {facts.ranking_rule} Source: {facts.zoning_source.name} ({facts.zoning_source.url}). {facts.zoning.legend} The
          four types are mapped onto the code&apos;s uses by an assumption. Needs expert review. Overlays and lot width are
          not applied. Scores are 0–100 on fixed anchors; climate risk is higher-is-worse.
        </p>
      </section>

      <section className="report-two">
        <div>
          <h2>Weights used (value judgments)</h2>
          <p>
            {Object.entries(weights)
              .map(([key, value]) => `${key} ${value}`)
              .join(" · ")}
            {preset ? ` — preset: ${preset.label}` : " — custom"}
            {whatIf ? " · what-if zoning on" : ""}
          </p>
          <h2>Does #1 hold under other weights?</h2>
          <p>{describeRobustness(robustness.analysis)}</p>
          {robustness.note ? <p className="report-small">{robustness.note}</p> : null}
          <p className="report-small">
            {robustness.analysis.presets.map((row) => `${row.label}: ${row.winner?.label || "n/a"}`).join(" · ")}
          </p>
        </div>
        <div>
          <h2>Data confidence</h2>
          <p>
            {fmt(props.confidence_label)} ({fmt(props.confidence)}). Only about missing or thin data, not about the value
            judgments.
          </p>
          {props.confidence_notes?.length ? <p className="report-small">{props.confidence_notes.join(" ")}</p> : null}
          {flag ? (
            <p className="report-small">
              Flagged as wrong in this browser on {flag.flaggedAt.slice(0, 10)}
              {flag.note ? `: ${flag.note}` : ""}. Not sent to the City.
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <h2>Measured inputs, sources, and vintages</h2>
        <table className="report-inputs">
          <thead>
            <tr>
              <th>Input</th>
              <th>Value</th>
              <th>Source · vintage</th>
            </tr>
          </thead>
          <tbody>
            {inputRows(facts.inputs).map(([label, value, source]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{value}</td>
                <td>
                  {source?.name} · {source?.vintage}
                  {source?.pulled ? ` · pulled ${source.pulled}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="report-summary">
        <h2>{ai ? AI_LABEL : "Template explanation (no AI)"}</h2>
        <p className="report-small">
          {ai
            ? `Written by ${explanation.model} via Vercel AI Gateway from the numbers above only. A model can misstate a number; the tables above are authoritative.`
            : "Written by fixed rules from the same numbers. No language model was used."}
        </p>
        {summaryText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, index) => (
            <p key={index}>{line}</p>
          ))}
      </section>

      <footer className="report-small">
        <strong>Limitations.</strong> Zoning map is not the zoning code; overlays, exceptions, and review rules are not
        applied. Flood, 25%+ slope, and undermined overlaps are map screens, not a survey, flood determination, or
        geotechnical study. ACS estimates have margins of error; CHAS 2018–2022 is older and counts only lower-income
        renters. Transit is scheduled service, not reliability. Assessed value is not used. No owner names are in this
        data. Generated {generated} from the committed data files; results change if the weights change.
      </footer>
    </article>
  )
}
