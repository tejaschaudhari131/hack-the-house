"use client"

import { useMemo, useState } from "react"

import Explanation from "./Explanation.js"
import SiteFacts from "./SiteFacts.js"
import SourcesList from "./SourcesList.js"
import WeightPresets from "./WeightPresets.js"
import WeightSliders from "./WeightSliders.js"
import { TYPE_COLORS } from "../lib/colors.js"
import { useExplanation } from "../lib/explainClient.js"
import { TOP_SITES, buildSitesContext, explainSitesTemplate } from "../lib/explainSites.js"
import {
  CITY_STATUS_LABELS,
  DEFAULT_SITE_FILTERS,
  EXAMPLE_QUERIES,
  HIGH_DISPLACEMENT,
  PERMISSION_LABELS,
  SITE_CAVEAT,
  SORT_OPTIONS,
  TYPE_OPTIONS,
  filtersFor,
  placeDisplacement,
  sitesCsv,
} from "../lib/sites.js"

const URA_URL = "https://www.ura.org/"
const LAND_BANK_URL = "https://pittsburghlandbank.org/"
const ZONING_PAGE_URL = "https://www.pittsburghpa.gov/Business-Development/City-Planning/Zoning"
const PAGE = 40

const SITE_SOURCE_NAMES = new Set([
  "City-Owned Properties",
  "City of Pittsburgh Property Tax Delinquency",
  "Condemned and Dead-End Properties",
  "Allegheny County property assessments",
  "HUD Low-Income Housing Tax Credit (LIHTC) properties",
  "HUD Qualified Census Tracts 2026",
  "Pittsburgh Regional Transit GTFS",
  "ACS 2024 5-year table B25003 (tenure)",
  "ACS 2015-2019 5-year table B25064 (median gross rent)",
  "Comprehensive Housing Affordability Strategy (CHAS)",
  "Census 2020 to 2010 tract relationship file, Pennsylvania",
  "EIA Residential Energy Consumption Survey 2020, Table CE1.2",
  "Embodied carbon by residential building form",
])

function typeLabel(typeId) {
  return TYPE_OPTIONS.find((option) => option.id === typeId)?.label || typeId
}

function Chip({ on, children, tone }) {
  if (!on) return null
  return <span className={`chip ${tone || ""}`}>{children}</span>
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function downloadCsv(rows) {
  const blob = new Blob([sitesCsv(rows)], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "find-sites-screening.csv"
  link.click()
  URL.revokeObjectURL(url)
}

export default function FindSitesPanel({
  filters,
  onFilters,
  sort,
  onSort,
  rows,
  weights,
  onWeights,
  selectedPin,
  onSelectPin,
  onOpenParcel,
  sources,
  activeExample,
  onExample,
  onCompareSite,
  onAntiDisplacement = null,
  guide = null,
}) {
  const [shown, setShown] = useState(PAGE)
  const sitesAi = useExplanation(JSON.stringify([filters, sort, weights]))
  const set = (patch) => {
    onExample(null)
    onFilters({ ...filters, ...patch })
    setShown(PAGE)
  }
  const byHood = useMemo(() => {
    const counts = {}
    for (const row of rows) counts[row.props.neighborhood] = (counts[row.props.neighborhood] || 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [rows])
  const selected = rows.find((row) => row.pin === selectedPin) || null

  return (
    <aside className="panel" id="panel">
      {guide}
      <section className="limitations">
        <h2>Find sites: where could we build what?</h2>
        <p>
          <strong>{SITE_CAVEAT}</strong>
        </p>
        <p>
          <a href={URA_URL} target="_blank" rel="noreferrer">
            URA
          </a>
          {" · "}
          <a href={LAND_BANK_URL} target="_blank" rel="noreferrer">
            Pittsburgh Land Bank
          </a>
          {" · "}
          <a href={ZONING_PAGE_URL} target="_blank" rel="noreferrer">
            City Planning zoning page
          </a>
          . Zoning readings come from §911.02 and still need expert review. Screening aid only.
        </p>
      </section>

      <section>
        <h2>Example questions</h2>
        <div className="examples">
          {EXAMPLE_QUERIES.map((example) => (
            <button
              key={example.id}
              type="button"
              className={activeExample === example.id ? "on" : ""}
              onClick={() => {
                onExample(example.id)
                onFilters(filtersFor(example))
                if (example.weights) onWeights({ ...weights, ...example.weights })
                setShown(PAGE)
              }}
            >
              {example.label}
            </button>
          ))}
        </div>
        {activeExample ? (
          <p className="hint">{EXAMPLE_QUERIES.find((example) => example.id === activeExample)?.detail}</p>
        ) : null}
      </section>

      <section className="filters">
        <h2>Filters</h2>
        <fieldset>
          <legend>Public records</legend>
          <label className="toggle">
            <input type="checkbox" checked={filters.vacant} onChange={(event) => set({ vacant: event.target.checked })} />
            Vacant land (county land use, or the City&apos;s class)
          </label>
          <label className="toggle">
            <input type="checkbox" checked={filters.cityOwned} onChange={(event) => set({ cityOwned: event.target.checked })} />
            City-owned
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={filters.taxDelinquent}
              onChange={(event) => set({ taxDelinquent: event.target.checked })}
            />
            City tax-delinquent (any)
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={filters.taxDelinquentPrior}
              onChange={(event) => set({ taxDelinquentPrior: event.target.checked })}
            />
            Tax-delinquent for a prior year too
          </label>
          <label className="toggle">
            <input type="checkbox" checked={filters.condemned} onChange={(event) => set({ condemned: event.target.checked })} />
            Condemned or dead-end
          </label>
          <div className="zoom-row">
            <button type="button" className={filters.combine === "all" ? "on" : ""} onClick={() => set({ combine: "all" })}>
              Match all checked
            </button>
            <button type="button" className={filters.combine === "any" ? "on" : ""} onClick={() => set({ combine: "any" })}>
              Match any checked
            </button>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={filters.excludeOpenSpace}
              onChange={(event) => set({ excludeOpenSpace: event.target.checked })}
            />
            Leave out City greenways and parks
          </label>
          <label className="toggle">
            <input type="checkbox" checked={filters.qctOnly} onChange={(event) => set({ qctOnly: event.target.checked })} />
            HUD Qualified Census Tract (2026) only
          </label>
        </fieldset>

        <fieldset>
          <legend>Housing type and zoning (§911.02)</legend>
          <label>
            Housing type
            <select value={filters.typeId} onChange={(event) => set({ typeId: event.target.value })}>
              {TYPE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zoning reading
            <select value={filters.permission} onChange={(event) => set({ permission: event.target.value })}>
              <option value="any">Any, including not allowed</option>
              <option value="by_right">Allowed by right (P), or by right for some unit counts</option>
              <option value="by_right_or_special">By right or with special approval (A, S, C)</option>
            </select>
          </label>
          <p className="hint">
            Districts outside the use table (SP, planned developments) never pass a zoning filter. Check those with the City.
          </p>
        </fieldset>

        <fieldset>
          <legend>Hazards</legend>
          <label>
            FEMA flood
            <select value={filters.flood} onChange={(event) => set({ flood: event.target.value })}>
              <option value="any">Any</option>
              <option value="no_sfha">No Special Flood Hazard Area</option>
              <option value="none">No mapped flood zone (SFHA or 0.2%)</option>
            </select>
          </label>
          <label>
            Steep slope (25%+, landslide-risk proxy)
            <select
              value={filters.maxSlopePct === null ? "" : String(filters.maxSlopePct)}
              onChange={(event) => set({ maxSlopePct: numberOrNull(event.target.value) })}
            >
              <option value="">Any</option>
              <option value="0">None on the parcel</option>
              <option value="10">At most 10% of the parcel</option>
              <option value="25">At most 25% of the parcel</option>
            </select>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={filters.excludeUndermined}
              onChange={(event) => set({ excludeUndermined: event.target.checked })}
            />
            No mapped undermined area
          </label>
        </fieldset>

        <fieldset>
          <legend>Transit, lot, place</legend>
          <label>
            Walk to frequent transit (60+ weekday trips at a stop)
            <select
              value={filters.maxWalkMin === null ? "" : String(filters.maxWalkMin)}
              onChange={(event) => set({ maxWalkMin: numberOrNull(event.target.value) })}
            >
              <option value="">Any</option>
              <option value="5">Within 5 min (straight line)</option>
              <option value="10">Within 10 min (straight line)</option>
              <option value="15">Within 15 min (straight line)</option>
            </select>
          </label>
          <label>
            Minimum lot size (sq ft)
            <input
              type="number"
              min="0"
              step="500"
              value={filters.minLotSqft ?? ""}
              onChange={(event) => set({ minLotSqft: numberOrNull(event.target.value) })}
              placeholder="Any"
            />
          </label>
          <label>
            Displacement risk (tract screen)
            <select value={filters.displacement} onChange={(event) => set({ displacement: event.target.value })}>
              <option value="any">Any</option>
              <option value="high">High only ({HIGH_DISPLACEMENT}+), for anti-displacement work</option>
              <option value="not_high">Leave out high ({HIGH_DISPLACEMENT}+)</option>
            </select>
          </label>
          <label>
            Area
            <select value={filters.area} onChange={(event) => set({ area: event.target.value })}>
              <option value="">Hazelwood and Lawrenceville</option>
              <option value="Hazelwood">Hazelwood</option>
              <option value="Lawrenceville">Lawrenceville (Lower, Central, Upper)</option>
            </select>
          </label>
        </fieldset>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onExample(null)
            onFilters(DEFAULT_SITE_FILTERS)
          }}
        >
          Reset filters
        </button>
      </section>

      <section>
        <h2>Weights</h2>
        <p className="hint">The list is ranked by the weighted score of the chosen type, or of the best type the zoning filter lets through.</p>
        <WeightPresets weights={weights} onWeights={onWeights} onAntiDisplacement={onAntiDisplacement} />
        <WeightSliders weights={weights} onWeights={onWeights} />
      </section>

      <section>
        <h2 aria-live="polite">
          {rows.length.toLocaleString()} parcel{rows.length === 1 ? "" : "s"} match
        </h2>
        <p className="hint">
          {byHood.map(([name, count]) => `${name} ${count}`).join(" · ") || "No matches. Loosen a filter."}
        </p>
        <div className="results-tools">
          <label>
            Sort by
            <select value={sort} onChange={(event) => onSort(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={!rows.length} onClick={() => downloadCsv(rows)}>
            Download CSV
          </button>
        </div>
        <button
          type="button"
          className="explain"
          disabled={!rows.length || sitesAi.explaining}
          onClick={() =>
            sitesAi.run({ kind: "sites", weights, filters, sort }, () =>
              explainSitesTemplate(buildSitesContext({ rows, filters, sort, weights, sources, summary: null, zoningRules: null })),
            )
          }
        >
          {sitesAi.explaining ? "Writing explanation…" : `Explain the top ${Math.min(TOP_SITES, rows.length) || ""} sites`}
        </button>
        <Explanation explanation={sitesAi.explanation} />

        {selected ? (
          <article className="site-detail" style={{ borderColor: TYPE_COLORS[selected.scoreType] }}>
            <header>
              <span>{selected.props.address || selected.pin}</span>
              <strong>{selected.composite ?? "n/a"}</strong>
            </header>
            <p className="hint">
              {selected.props.neighborhood} · parcel {selected.pin} · zoning {selected.props.zoning_code || "not matched"}
            </p>
            <p>
              Ranked as {typeLabel(selected.typeId)}.{" "}
              <span className={`badge ${selected.permission === "by_right" || selected.permission === "partial" ? "allowed" : selected.permission === "special" ? "approval" : selected.permission === "not_allowed" ? "not_allowed" : "unreviewed"}`}>
                {PERMISSION_LABELS[selected.permission]}
              </span>
            </p>
            <SiteFacts props={selected.props} compact />
            <div className="action-row">
              {onCompareSite ? (
                <button type="button" className="explain" onClick={() => onCompareSite(selected.pin, filters.typeId || selected.typeId)}>
                  Compare two options on this parcel
                </button>
              ) : null}
              <button type="button" className="secondary" onClick={() => onOpenParcel(selected.pin)}>
                Open full parcel detail
              </button>
            </div>
            {filters.typeId === "triplex" ? (
              <p className="hint">
                The comparison keeps the triplex as 3 units read from the §911.02 Three-Unit row. Its score uses the small
                apartment (3–19 units) score; the unit count does not change the score.
              </p>
            ) : null}
          </article>
        ) : null}

        <ol className="site-list">
          {rows.slice(0, shown).map((row) => {
            const props = row.props
            const risk = placeDisplacement(props)
            return (
              <li key={row.pin}>
                <button
                  type="button"
                  className={row.pin === selectedPin ? "on" : ""}
                  onClick={() => onSelectPin(row.pin)}
                >
                  <span className="site-row-head">
                    <span>
                      <i style={{ background: TYPE_COLORS[row.scoreType] }} /> {props.address || row.pin}
                    </span>
                    <strong>{row.composite ?? "n/a"}</strong>
                  </span>
                  <span className="site-row-meta">
                    {props.neighborhood} · {typeLabel(row.typeId)} · {PERMISSION_LABELS[row.permission]}
                    {props.lot_sqft ? ` · ${Math.round(props.lot_sqft).toLocaleString()} sq ft` : ""}
                    {props.walk_min_frequent !== null && props.walk_min_frequent !== undefined
                      ? ` · ${Math.round(props.walk_min_frequent)} min to frequent transit`
                      : ""}
                  </span>
                  <span className="chips">
                    <Chip on={props.vacant_lot}>Vacant</Chip>
                    <Chip on={props.city_owned} tone="city">
                      City · {CITY_STATUS_LABELS[props.city_status] || "status unknown"}
                    </Chip>
                    <Chip on={props.tax_delinquent} tone="warn">
                      {props.tax_delinquent_prior_years ? "Delinquent, prior year" : "Delinquent"}
                    </Chip>
                    <Chip on={props.condemned_or_dead_end} tone="warn">Condemned / dead-end</Chip>
                    <Chip on={props.qct_2026}>QCT</Chip>
                    <Chip on={(props.sfha_overlap || 0) > 0} tone="hazard">Flood SFHA</Chip>
                    <Chip on={(props.steep_slope_overlap || 0) > 0} tone="hazard">
                      Slope {Math.round((props.steep_slope_overlap || 0) * 100)}%
                    </Chip>
                    <Chip on={(props.undermined_overlap || 0) > 0} tone="hazard">Undermined</Chip>
                    <Chip on={risk !== null && risk >= HIGH_DISPLACEMENT} tone="warn">Displacement {risk}</Chip>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        {rows.length > shown ? (
          <button type="button" onClick={() => setShown((count) => count + PAGE)}>
            Show {Math.min(PAGE, rows.length - shown)} more
          </button>
        ) : null}
      </section>

      <section>
        <SourcesList sources={sources} filter={(row) => SITE_SOURCE_NAMES.has(row.name)} />
      </section>
    </aside>
  )
}
