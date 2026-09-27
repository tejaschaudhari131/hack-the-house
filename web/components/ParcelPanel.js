"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import Explanation from "./Explanation.js"
import EvidenceDrawer from "./EvidenceDrawer.js"
import Robustness from "./Robustness.js"
import WeightPresets from "./WeightPresets.js"
import { NOT_EVALUATED } from "../lib/explainFacts.js"
import { FACTOR_BY_ID, breakdown, coverageText, transitTotalShare } from "../lib/factors.js"
import { SHARED_FACTOR_NOTE, describeRobustness, parcelRobustness, sweepPair } from "../lib/robustness.js"
import SiteFacts from "./SiteFacts.js"
import SourcesList from "./SourcesList.js"
import { TYPE_COLORS } from "../lib/colors.js"
import { clearFlag, loadFlags, saveFlag } from "../lib/flags.js"
import { TYPE_LABELS, WEIGHT_LABELS } from "../lib/rank.js"
import { dropZoningBadge, unitPermission } from "../lib/zoning.js"

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
  const badge = dropZoningBadge(row.id, zoningInfo)
  return (
    <p className="zoning-badge">
      <span className={`badge ${badge.id}`}>{badge.label}</span>
      {whatIf && zoningInfo?.status === "use_table" ? <span className="badge scenario">What-if ordering on</span> : null}
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
  matchTotal = 0,
  onSelectPin,
  selected,
  ranked,
  zoningInfo,
  explanation,
  explaining,
  onExplain,
  onPrint,
  sources,
  onBackToSites,
  siteType = null,
  onAntiDisplacement = null,
  zoning = null,
  share = null,
  onCompareSite = null,
}) {
  const [showModel, setShowModel] = useState(false)
  const headingRef = useRef(null)
  const selectedRef = useRef(null)
  const topSweep = useMemo(() => {
    const scored = (ranked || []).filter((row) => row.composite !== null)
    if (!selected || scored.length < 2) return null
    const [first, second] = scored
    const grouped = !whatIf && zoningInfo?.status === "use_table" && first.allowed !== second.allowed
    return {
      rows: grouped ? null : sweepPair({ label: first.label, scores: selected.scores[first.id] }, { label: second.label, scores: selected.scores[second.id] }, weights),
      note: grouped
        ? `${first.label} is listed first because §911.02 permits it by right and ${second.label} is not; no weight change moves a type across that line.`
        : `Sweep compares the first two types listed (${first.label} vs ${second.label}). ${SHARED_FACTOR_NOTE}`,
    }
  }, [ranked, selected, weights, whatIf, zoningInfo])
  const robustness = useMemo(
    () => (selected ? parcelRobustness(selected.scores, zoningInfo, weights, whatIf) : null),
    [selected, zoningInfo, weights, whatIf],
  )

  useEffect(() => {
    const heading = headingRef.current
    const section = selectedRef.current || heading
    if (!selected?.pin || !heading) return
    heading.focus({ preventScroll: true })
    const panel = section.closest(".panel")
    if (panel && panel.scrollHeight > panel.clientHeight && getComputedStyle(panel).overflowY !== "visible") {
      panel.scrollTo({ top: panel.scrollTop + section.getBoundingClientRect().top - panel.getBoundingClientRect().top - 8, behavior: "smooth" })
    } else {
      section.scrollIntoView({ block: "start", behavior: "smooth" })
    }
  }, [selected?.pin])
  const [flags, setFlags] = useState({})
  const [flagNote, setFlagNote] = useState("")
  const failed = summary?.sources_failed || []

  useEffect(() => {
    setFlags(loadFlags())
  }, [])

  useEffect(() => {
    setFlagNote("")
  }, [selected?.pin])

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
      const result = breakdown(selected?.scores?.[row.id], weights)
      current.rows.push({ ...row, place, coverage: result.noScoreReason || coverageText(result) })
    }
    return blocks
  }, [ranked, whatIf, zoningInfo, selected, weights])

  return (
    <aside className="panel" id="panel">
      <details className="limitations" open={!selected}>
        <summary>
          <h2 id="limits-heading">Limitations / what this tool can&apos;t tell you</h2>
        </summary>
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
            The carbon-related proxy is relative and per home, not tonnes: existing-stock site energy by building type (EIA
            RECS 2020, Northeast; energy is not an emissions inventory), an assumed embodied-carbon tier, and transit
            access as a travel term. There is no project baseline, so it is not true marginal CO2.
          </li>
          <li>
            The factors overlap. Transit counts directly and inside the carbon proxy, so with complete data and these
            weights transit carries about{" "}
            {Math.round(transitTotalShare(weights, model?.normative_choices?.carbon_transport_weight) * 1000) / 10}% of the
            total. Need indicators feed both equity and displacement.
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
      </details>

      <section>
        <h2>Weights</h2>
        <p className="hint">These are choices. They re-rank every parcel on the map.</p>
        <WeightPresets weights={weights} onWeights={onWeights} onAntiDisplacement={onAntiDisplacement} />
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
          What-if ordering: rank all four types by score, ignoring §911.02 grouping
        </label>
        <p className="hint">
          Only the order changes. Scores and each type&apos;s zoning reading stay as they are. This is not a zoning
          amendment.
        </p>
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
            name="address-search" placeholder="Try a street name"
          />
        </label>
        {query.trim() && matches.length === 0 ? <p className="hint">No address match in the MVP area.</p> : null}
        {matchTotal > matches.length ? (
          <p className="hint">
            Showing {matches.length} of {matchTotal.toLocaleString()} matches. Add a house number to narrow it, for example
            &quot;4200 butler&quot;.
          </p>
        ) : null}
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
          <h2 ref={headingRef} tabIndex={-1} className="parcel-heading">
            {selected.address || selected.pin}
          </h2>
          <p className="screening-line">
            <strong>Screening aid only.</strong> Not a determination of what may be built. Confirm with City Planning
            (links below).
          </p>
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
            Data coverage (thin-data heuristic): <strong>{selected.confidence_label}</strong> ({selected.confidence}). It
            counts missing inputs. It is not accuracy, statistical confidence, or a grade for the value judgments.
          </p>
          <p className="hint">
            <strong>Not evaluated:</strong> {NOT_EVALUATED.join(" ")}
          </p>
          {siteType === "triplex" ? (
            <div className="guide-banner">
              <p>
                You searched Find Sites for a triplex. §911.02 Three-Unit row here:{" "}
                <strong>{unitPermission("small_apartment", "Three-Unit", zoningInfo, 3).label}</strong>. The small apartment
                card below scores 3–19 units broadly and shows the four-type reading.
              </p>
              {onCompareSite ? (
                <button type="button" className="explain" onClick={() => onCompareSite(selected.pin, "triplex")}>
                  Compare a triplex with another option on this parcel
                </button>
              ) : null}
            </div>
          ) : onCompareSite ? (
            <p>
              <button type="button" className="secondary" onClick={() => onCompareSite(selected.pin, ranked?.find((row) => row.composite !== null)?.id)}>
                Compare the top option with another on this parcel
              </button>
            </p>
          ) : null}
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
                  <p className="hint">{row.coverage}</p>
                  <ZoningBadge row={row} whatIf={whatIf} zoningInfo={zoningInfo} />
                  <Bar label={FACTOR_BY_ID.demand.label} value={row.demand} hint="Neighborhood valid-sale price and turnover, blended with an assumed lot-size fit curve. Not demand for the type." />
                  <Bar label={FACTOR_BY_ID.transit.label} value={row.transit} hint="Measured for the place; same for every type" />
                  <Bar label={FACTOR_BY_ID.equity.label} value={row.equity} hint="Measured need (ACS income and rent burden, CHAS low-income cost burden), then team-chosen type multipliers (assumptions)" />
                  <Bar
                    label={`${FACTOR_BY_ID.climate.label} (higher is worse)`}
                    value={row.climate_risk}
                    hint="Flood, steep-slope proxy, and undermined area. Higher means more mapped hazard."
                  />
                  <Bar
                    label={`${FACTOR_BY_ID.displacement.label} (higher is worse)`}
                    value={row.displacement_risk}
                    hint="Tract renters, cost burden, and rent growth versus the county. Same for every type. Higher means more risk."
                  />
                  <Bar
                    label={`${FACTOR_BY_ID.carbon.label} (higher is worse)`}
                    value={row.carbon_index}
                    hint="Existing-stock building energy, an assumed embodied tier, and transit access. Not tonnes or true marginal CO2."
                  />
                </article>
              ))}
            </div>
          ))}

          {ranked?.length ? (
            <EvidenceDrawer
              props={selected}
              typeId={(ranked.find((row) => row.composite !== null) || ranked[0]).id}
              typeLabel={(ranked.find((row) => row.composite !== null) || ranked[0]).label}
              sources={sources}
              summary={summary}
              zoning={zoning}
              model={model}
            />
          ) : null}

          {robustness ? (
            <Robustness
              analysis={robustness.analysis}
              note={[robustness.note, SHARED_FACTOR_NOTE].filter(Boolean).join(" ")}
              sweep={topSweep?.rows || null}
              sweepNote={topSweep?.note || null}
              secondary={
                robustness.whatIfAnalysis ? (
                  <p className="hint">
                    <strong>If zoning were not binding (what-if):</strong> {describeRobustness(robustness.whatIfAnalysis)}
                  </p>
                ) : null
              }
            />
          ) : null}

          <div className="action-row">
            <button type="button" className="explain" onClick={onExplain} disabled={explaining}>
              {explaining ? "Writing explanation…" : "Explain the top two"}
            </button>
            <button type="button" className="secondary" onClick={onPrint}>
              Print one-page report
            </button>
          </div>
          {share}
          <Explanation explanation={explanation} />

          <h3>Check it with the City, or flag it</h3>
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
                    name="flag-note" placeholder="What looks wrong? Optional."
                  />
                </label>
                <button type="submit">Save flag on this browser</button>
                <p className="hint">The flag stays in this browser. It is not sent to City Planning.</p>
              </form>
            )}
          </div>
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
