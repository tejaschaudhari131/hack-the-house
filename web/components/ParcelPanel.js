"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import SiteFacts from "./SiteFacts.js"
import SourcesList from "./SourcesList.js"
import { TYPE_COLORS } from "../lib/colors.js"
import { clearFlag, loadFlags, saveFlag } from "../lib/flags.js"
import { TYPE_LABELS, WEIGHT_LABELS } from "../lib/rank.js"
import { dropZoningBadge } from "../lib/zoning.js"

const CODE_URL = "https://ecode360.com/45474054"
const MAP_URL =
  "https://pittsburghpa.maps.arcgis.com/apps/instant/sidebar/index.html?appid=4bb79ea64bf848b3a0560e3856efeccb"
const ZONING_PAGE_URL = "https://www.pittsburghpa.gov/Business-Development/City-Planning/Zoning"

function formatScore(value) {
  if (value === null || value === undefined) return "n/a"
  return Number(value).toFixed(1)
}

function Bar({ label, value, hint }) {
  const width = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div className="bar-row">
      <div className="bar-label">
        <span>{label}</span>
        <span>{formatScore(value)}</span>
      </div>
      <div className="bar-track" aria-hidden="true">
        <div className="bar-fill" style={{ width: `${width}%` }} />
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

function ZoningBadge({ row, whatIf, zoningInfo }) {
  if (whatIf && zoningInfo?.status === "use_table") {
    return <span className="badge scenario">What-if: treated as allowed</span>
  }
  const badge = dropZoningBadge(row.id, zoningInfo)
  return (
    <p className="zoning-badge">
      <span className={`badge ${badge.id}`}>{badge.label}</span>
      <span className="hint">{badge.detail}</span>
    </p>
  )
}

export default function ParcelPanel({
  summary,
  model,
  weights,
  onWeights,
  whatIf,
  onWhatIf,
  focus,
  onFocus,
  query,
  onQuery,
  matches,
  onSelectPin,
  selected,
  ranked,
  zoningInfo,
  explanation,
  explaining,
  onExplain,
  sources,
  onBackToSites,
}) {
  const [showModel, setShowModel] = useState(false)
  const [flags, setFlags] = useState({})
  const [flagNote, setFlagNote] = useState("")
  const failed = summary?.sources_failed || []

  useEffect(() => {
    setFlags(loadFlags())
  }, [])

  useEffect(() => {
    setFlagNote("")
  }, [selected?.pin])

  const selectedRef = useRef(null)
  useEffect(() => {
    const node = selectedRef.current
    const panel = node?.closest(".panel")
    if (onBackToSites && selected?.pin && panel) panel.scrollTop = node.offsetTop - panel.offsetTop
  }, [onBackToSites, selected?.pin])
  const groups = useMemo(() => {
    if (!ranked) return []
    const blocks = []
    let current = null
    let place = 0
    for (const row of ranked) {
      const flagged = !whatIf && zoningInfo?.status === "use_table" && row.allowed === false
      const key = flagged ? "flagged" : "ranked"
      if (!current || current.key !== key) {
        current = { key, rows: [] }
        blocks.push(current)
      }
      place += 1
      current.rows.push({ ...row, place })
    }
    return blocks
  }, [ranked, whatIf, zoningInfo])

  return (
    <aside className="panel">
      <section className="limitations" aria-labelledby="limits-heading">
        <h2 id="limits-heading">Limitations / what this tool can&apos;t tell you</h2>
        <p>
          This is decision support. It is not legal, zoning, financial, or permitting advice, and it
          will not tell you what may be built or what a project will cost.
        </p>
        <ul>
          <li>
            Zoning permissions come from Pittsburgh Zoning Code §911.02, mapped onto four housing types by an
            assumption (detached, attached or two-unit, three-unit versus 4+ units). A, S, and C mean special
            approval, not a variance. Districts that are not in that table say to check with the City. This is
            not a zoning determination. Every district still needs expert review.
          </li>
          <li>The sliders are value judgments. Confidence is only about thin or missing data.</li>
          <li>
            Climate here is FEMA flood zones, city slopes of 25% or greater used only as a landslide-risk proxy,
            and mapped undermined areas as a preliminary mine screen. It is not a survey, a flood determination,
            a geotechnical study, or future rainfall.
          </li>
          <li>
            Displacement risk is a tract-level screening signal (renter share, low-income renter cost burden, and rent
            growth versus the county). It is not a prediction that anyone will be displaced, and it is the same for all
            four types.
          </li>
          <li>
            Marginal carbon is a relative estimate, not tonnes of CO2: published per-household energy by building type
            (EIA RECS 2020, Northeast), a coarse embodied-carbon tier, and transit access as a travel proxy.
          </li>
          <li>
            Site records (vacant, City-owned, tax-delinquent, condemned) are not availability. Verify with the URA, the
            Land Bank, or the City before acting.
          </li>
          <li>
            Assessed value is not market value and is not used. Demand uses valid sale prices from the assessment
            file, not the separate sales dataset.
          </li>
          <li>
            Equity keeps two rent measures. ACS 2024 is the share of all renters paying 30% or more of income.
            HUD CHAS 2018–2022 is the share of renter households at or below 80% of HAMFI paying more than 30%.
            CHAS lags the ACS by several years, and a tract is larger than a block group. ACS figures have margins of error.
          </li>
          <li>The zoning map is not the zoning code. Overlays, exceptions, and review rules are not in the stub.</li>
          <li>No infrastructure capacity, school seats, subsidies, or loan terms.</li>
          <li>Scores use fixed anchors for these neighborhoods. They are not a citywide percentile.</li>
        </ul>
        {failed.length ? (
          <p className="warning">
            These sources failed and were not filled in with made-up numbers: {failed.map((item) => item.name).join("; ")}.
          </p>
        ) : null}
      </section>

      <section>
        <h2>Weights</h2>
        <p className="hint">These are choices. They re-rank every parcel on the map.</p>
        {Object.entries(weights).map(([key, value]) => (
          <label key={key} className="slider">
            <span>
              {WEIGHT_LABELS[key] || key}{" "}
              <strong>{value}</strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={value}
              onChange={(event) => onWeights({ ...weights, [key]: Number(event.target.value) })}
            />
          </label>
        ))}
        <label className="toggle">
          <input type="checkbox" checked={whatIf} onChange={(event) => onWhatIf(event.target.checked)} />
          What if zoning changed (rank all four types)
        </label>
        <div className="zoom-row">
          <button type="button" className={focus === "Hazelwood" ? "on" : ""} onClick={() => onFocus("Hazelwood")}>
            Hazelwood
          </button>
          <button type="button" className={focus === "Lawrenceville" ? "on" : ""} onClick={() => onFocus("Lawrenceville")}>
            Lawrenceville
          </button>
          <button type="button" className={focus ? "" : "on"} onClick={() => onFocus(null)}>
            Both
          </button>
        </div>
      </section>

      <section>
        <h2>Find a parcel</h2>
        <label>
          Address search
          <input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Try a street name"
          />
        </label>
        {query.trim() && matches.length === 0 ? <p className="hint">No address match in the MVP area.</p> : null}
        <ul className="matches">
          {matches.map((feature) => (
            <li key={feature.properties.pin}>
              <button type="button" onClick={() => onSelectPin(feature.properties.pin)}>
                {feature.properties.address || feature.properties.pin}
                <span>{feature.properties.neighborhood}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {!selected ? (
        <section>
          <h2>Click a parcel</h2>
          <p>{summary?.why_these_places}</p>
          <ul className="stats">
            {(summary?.neighborhoods || []).map((neighborhood) => (
              <li key={neighborhood.name}>
                <strong>{neighborhood.name}</strong>
                {" · "}
                {neighborhood.parcel_count?.toLocaleString?.() || neighborhood.parcel_count} parcels
                {neighborhood.price_per_sqft ? ` · median valid sale $${neighborhood.price_per_sqft}/sq ft` : ""}
                {neighborhood.turnover_per_100 ? ` · ${neighborhood.turnover_per_100} valid sales per 100 parcels` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section ref={selectedRef}>
          {onBackToSites ? (
            <button type="button" className="text-button" onClick={onBackToSites}>
              ← Back to Find Sites results
            </button>
          ) : null}
          <h2>{selected.address || selected.pin}</h2>
          <div className="review-box">
            <p>
              <strong>Screening aid only.</strong> This result is not a determination of what may be built. A
              consequential decision should go to City Planning / the Zoning Administrator, or to a qualified
              professional.
            </p>
            <p>
              <a href={ZONING_PAGE_URL} target="_blank" rel="noreferrer">
                City Planning zoning page
              </a>
              {" · "}
              <a href={CODE_URL} target="_blank" rel="noreferrer">
                Zoning code
              </a>
              {" · "}
              <a href={MAP_URL} target="_blank" rel="noreferrer">
                Zoning map
              </a>
              . The zoning page lists 412-255-2621 at the City-County Building, 414 Grant Street.
            </p>
            {flags[selected.pin] ? (
              <p className="warning">
                Flagged in this browser on {flags[selected.pin].flaggedAt.slice(0, 10)}
                {flags[selected.pin].note ? `: ${flags[selected.pin].note}` : ""}. The flag is not sent to the City.
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setFlags(clearFlag(selected.pin))}
                >
                  Remove flag
                </button>
              </p>
            ) : (
              <form
                className="flag-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  setFlags(saveFlag(selected.pin, { address: selected.address, note: flagNote }))
                }}
              >
                <label>
                  Flag this result as wrong
                  <input
                    value={flagNote}
                    onChange={(event) => setFlagNote(event.target.value)}
                    placeholder="What looks wrong? Optional."
                  />
                </label>
                <button type="submit">Save flag on this browser</button>
                <p className="hint">The flag stays in this browser. It is not sent to City Planning.</p>
              </form>
            )}
          </div>
          <p>
            {selected.neighborhood}
            {selected.land_use ? ` · ${selected.land_use}` : ""}
            {selected.lot_sqft ? ` · ${Number(selected.lot_sqft).toLocaleString()} sq ft` : ""}
          </p>
          <p>
            Zoning: {selected.zoning_code || "not matched"}
            {selected.zoning_label ? ` (${selected.zoning_label})` : ""}
          </p>
          {zoningInfo?.status === "use_table" ? (
            <p className="hint">
              Use table {zoningInfo.codeSection}. Still needs expert review. {zoningInfo.note}{" "}
              {zoningInfo.codeUrl ? (
                <a href={zoningInfo.codeUrl} target="_blank" rel="noreferrer">
                  §911.02
                </a>
              ) : null}
            </p>
          ) : zoningInfo?.status === "not_in_use_table" ? (
            <p className="hint">
              Check with the city / needs review. {zoningInfo.note} This district is not marked prohibited.
            </p>
          ) : (
            <p className="hint">
              {zoningInfo?.note}{" "}
              {zoningInfo?.codeUrl ? (
                <a href={zoningInfo.codeUrl} target="_blank" rel="noreferrer">
                  Open the code
                </a>
              ) : null}
            </p>
          )}
          <p>
            Data confidence: <strong>{selected.confidence_label}</strong> ({selected.confidence}). This is not a
            grade for the value judgments.
          </p>
          {selected.confidence_notes?.length ? (
            <ul>
              {selected.confidence_notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          <SiteFacts props={selected} />

          {groups.map((group) => (
            <div key={group.key}>
              <h3>
                {group.key === "flagged"
                  ? "Not permitted by right under §911.02"
                  : whatIf && zoningInfo?.status === "use_table"
                    ? "Ranked as if zoning allowed all four"
                    : zoningInfo?.status === "use_table"
                      ? "Ranked among types §911.02 permits by right, including partial unit counts"
                      : "Ranked without a zoning filter"}
              </h3>
              {group.rows.map((row) => (
                <article key={row.id} className="type-card" style={{ borderColor: TYPE_COLORS[row.id] }}>
                  <header>
                    <span>
                      {row.place}. {TYPE_LABELS[row.id]}
                    </span>
                    <strong>{formatScore(row.composite)}</strong>
                  </header>
                  <ZoningBadge row={row} whatIf={whatIf} zoningInfo={zoningInfo} />
                  <Bar label="Demand" value={row.demand} hint="Sales, turnover, and a lot-fit rule" />
                  <Bar label="Transit" value={row.transit} hint="Measured for the place; same for every type" />
                  <Bar label="Equity" value={row.equity} hint="ACS income and rent burden, plus CHAS low-income renter cost burden, then a normative type rule" />
                  <Bar
                    label="Climate risk"
                    value={row.climate_risk}
                    hint="Flood, steep-slope proxy, and undermined area. Higher means more mapped hazard."
                  />
                  <Bar
                    label="Displacement risk (screen)"
                    value={row.displacement_risk}
                    hint="Tract renters, cost burden, and rent growth versus the county. Same for every type. Higher means more risk."
                  />
                  <Bar
                    label="Marginal carbon (estimate)"
                    value={row.carbon_index}
                    hint="Relative index per new home: building energy and embodied tier, plus transit access. Higher means more."
                  />
                </article>
              ))}
            </div>
          ))}

          <button type="button" className="explain" onClick={onExplain} disabled={explaining}>
            {explaining ? "Writing explanation…" : "Explain the top two"}
          </button>
          {explanation ? (
            <div className="explanation">
              <p className="badge">
                {explanation.source === "llm" ? `Language model (${explanation.model})` : "Template explanation"}
              </p>
              {explanation.notice ? <p className="warning">{explanation.notice}</p> : null}
              {explanation.text.split("\n").filter(Boolean).map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{paragraph}</p>
              ))}
            </div>
          ) : null}
        </section>
      )}

      <section>
        <button type="button" className="text-button" onClick={() => setShowModel((open) => !open)}>
          {showModel ? "Hide score ingredients" : "Show score ingredients"}
        </button>
        {showModel && model ? (
          <div className="model">
            {model.dimensions.map((dimension) => (
              <div key={dimension.id}>
                <h3>{dimension.label}</h3>
                <p>{dimension.higher_means}</p>
                <p>
                  <strong>Measured:</strong> {dimension.measured.join(" ")}
                </p>
                <p>
                  <strong>Value judgments:</strong> {dimension.normative.join(" ")}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        <SourcesList sources={sources} />
      </section>
    </aside>
  )
}
