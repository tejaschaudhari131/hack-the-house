"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import EvidenceDrawer from "./EvidenceDrawer.js"
import Explanation from "./Explanation.js"
import Robustness from "./Robustness.js"
import WeightPresets from "./WeightPresets.js"
import { SHARED_FACTOR_NOTE, analyzeRobustness, compareWinner, sweepPair } from "../lib/robustness.js"
import AnswerCard from "./AnswerCard.js"
import ComparisonView from "./ComparisonView.js"
import WeightsPanel from "./WeightsPanel.js"
import { BUILDINGS, SCORE_TAGS, WALK_RADIUS_M, scoreProxyNote } from "../lib/buildings.js"
import { TYPE_COLORS } from "../lib/colors.js"
import { buildScenario, compareScenarios } from "../lib/comparison.js"
import { FACTOR_BY_ID, breakdown, coverageText } from "../lib/factors.js"
import { useExplanation } from "../lib/explainClient.js"
import { buildCompareContext, buildParcelContext, explainCompareTemplate } from "../lib/explainFacts.js"
import { explainTemplate } from "../lib/explainTemplate.js"
import { clearFlag, loadFlags, saveFlag } from "../lib/flags.js"
import { featurePoint, stopsWithin } from "../lib/geo.js"
import { WEIGHT_LABELS, rankTypes } from "../lib/rank.js"
import { resolveZoning, unitPermission } from "../lib/zoning.js"

const CODE_URL = "https://ecode360.com/45474054"
const MAP_URL =
  "https://pittsburghpa.maps.arcgis.com/apps/instant/sidebar/index.html?appid=4bb79ea64bf848b3a0560e3856efeccb"
const ZONING_PAGE_URL = "https://www.pittsburghpa.gov/Business-Development/City-Planning/Zoning"

function formatScore(value) {
  if (value === null || value === undefined) return "n/a"
  return Number(value).toFixed(1)
}

function ScoreLine({ label, value, measured, choice }) {
  return (
    <div className="score-line">
      <div className="bar-label">
        <span>{label}</span>
        <strong>{formatScore(value)}</strong>
      </div>
      <p className="hint">
        <span className="tag measured">Measured</span> {measured}
      </p>
      <p className="hint">
        <span className="tag choice">Weighting choice</span> {choice}
      </p>
    </div>
  )
}

function FlagBox({ flagId, address }) {
  const [flags, setFlags] = useState({})
  const [note, setNote] = useState("")
  useEffect(() => {
    setFlags(loadFlags())
  }, [])
  const current = flags[flagId]
  if (current) {
    return (
      <p className="warning">
        Flagged in this browser on {current.flaggedAt.slice(0, 10)}
        {current.note ? `: ${current.note}` : ""}. The flag is not sent to the City.
        <button type="button" className="text-button" onClick={() => setFlags(clearFlag(flagId))}>
          Remove flag
        </button>
      </p>
    )
  }
  return (
    <form
      className="flag-form"
      onSubmit={(event) => {
        event.preventDefault()
        setFlags(saveFlag(flagId, { address, note }))
      }}
    >
      <label>
        Flag this result as wrong
        <input value={note} onChange={(event) => setNote(event.target.value)} name="flag-note" placeholder="What looks wrong? Optional." />
      </label>
      <button type="submit">Save flag on this browser</button>
    </form>
  )
}

function DropCard({ drop, feature, weights, zoning, stops, summary, onClear }) {
  const { explanation, explaining, run } = useExplanation(JSON.stringify(weights))
  const props = feature.properties
  const spec = BUILDINGS[drop.typeId]
  const zoningInfo = resolveZoning(props.zoning_code, zoning)
  const ranked = rankTypes(props.scores, weights, { allowed: zoningInfo.allowed, whatIf: false })
  const row = ranked.find((item) => item.id === spec.scoreType)
  const permission = unitPermission(spec.scoreType, spec.useRow, zoningInfo, spec.units)
  const coverage = coverageText(breakdown(props.scores?.[spec.scoreType], weights))
  const proxy = scoreProxyNote(drop.typeId)
  const point = featurePoint(feature.geometry)
  const transit = point ? stopsWithin(stops, point[0], point[1], WALK_RADIUS_M) : null
  const flagId = `drop:${drop.pin}:${drop.typeId}`

  function onExplain() {
    run({ kind: "parcel", pin: props.pin, weights, whatIf: false }, () =>
      explainTemplate(buildParcelContext({ props, weights, whatIf: false, zoningRules: zoning, sources: null, summary }).templateInput),
    )
  }

  return (
    <article className="drop-card" style={{ borderColor: TYPE_COLORS[drop.typeId] }}>
      <header>
        <span>
          Building {drop.slot}. {spec.label}
        </span>
        <button type="button" className="text-button" onClick={onClear}>
          Remove
        </button>
      </header>
      <p>
        {props.address || props.pin}
        {" · "}
        {props.neighborhood}
      </p>
      <p>
        About <strong>{spec.units}</strong> {spec.units === 1 ? "home" : "homes"}, shown {spec.heightM} m tall ({spec.floors}{" "}
        floors). An illustration, not a permitted envelope, yield, or verified unit count.
      </p>
      {proxy ? <p className="hint">{proxy}</p> : null}
      <p>
        <span className={`badge ${permission.badgeId}`}>{permission.label}</span>
      </p>
      <p className="hint">{permission.detail}</p>
      <p className="hint">
        Zoning on the parcel: {props.zoning_code || "not matched"}
        {props.zoning_label ? ` (${props.zoning_label})` : ""}.
      </p>
      {transit ? (
        <p>
          Within {WALK_RADIUS_M} m in a straight line (not a walking route): {transit.count} stops and about{" "}
          {transit.trips.toLocaleString()} weekday scheduled trips
          {transit.routes.length ? ` (${transit.routes.join(", ")})` : ""}. Scheduled service is not reliability.
        </p>
      ) : (
        <p className="hint">Stop locations did not load, so the ring has no frequency summary.</p>
      )}
      <p>
        {(props.sfha_overlap || 0) > 0
          ? `Flood overlay: about ${Math.round(props.sfha_overlap * 100)}% of the parcel is in a FEMA Special Flood Hazard Area.`
          : (props.flood_02_overlap || 0) > 0
            ? "Flood overlay: the parcel touches the FEMA 0.2% zone."
            : props.sfha_overlap === null || props.sfha_overlap === undefined
              ? "Flood layer missing for this parcel."
              : "No overlap with the checked FEMA flood zones (a map screen, not a flood determination)."}{" "}
        {(props.steep_slope_overlap || 0) > 0
          ? `Slope overlay: about ${Math.round(props.steep_slope_overlap * 100)}% is on a 25%+ slope, a landslide-risk proxy, not a landslide inventory.`
          : props.steep_slope_overlap === null || props.steep_slope_overlap === undefined
            ? "Slope layer missing for this parcel."
            : "No overlap with the mapped 25%+ slope layer."}
      </p>
      <ScoreLine label={FACTOR_BY_ID.demand.label} value={row?.demand} {...SCORE_TAGS.demand} />
      <ScoreLine label={FACTOR_BY_ID.transit.label} value={row?.transit} {...SCORE_TAGS.transit} />
      <ScoreLine label={FACTOR_BY_ID.equity.label} value={row?.equity} {...SCORE_TAGS.equity} />
      <ScoreLine label={`${FACTOR_BY_ID.climate.label} (higher is worse)`} value={row?.climate_risk} {...SCORE_TAGS.climate_risk} />
      <ScoreLine label={`${FACTOR_BY_ID.displacement.label} (higher is worse)`} value={row?.displacement_risk} {...SCORE_TAGS.displacement_risk} />
      <ScoreLine label={`${FACTOR_BY_ID.carbon.label} (higher is worse)`} value={row?.carbon_index} {...SCORE_TAGS.carbon_index} />
      <ScoreLine label="Weighted total" value={row?.composite} {...SCORE_TAGS.composite} />
      <p className="hint">{coverage}</p>
      <button type="button" className="explain" onClick={onExplain} disabled={explaining}>
        {explaining ? "Writing explanation…" : "Explain this parcel"}
      </button>
      <Explanation explanation={explanation} />
      <FlagBox flagId={flagId} address={props.address} />
    </article>
  )
}

export default function DropPanel({
  summary,
  weights,
  onWeights,
  focus,
  onFocus,
  query,
  onQuery,
  matches,
  matchTotal = 0,
  onSelectPin,
  zoning,
  stops,
  drops,
  activeType,
  onType,
  activeSlot,
  onSlot,
  onClear,
  byPin,
  onCompareState,
  onPrintBrief,
  onGoBrief = null,
  onAntiDisplacement = null,
  share = null,
  sources = null,
  model = null,
  guide = null,
}) {
  const dropA = drops.find((item) => item.slot === "A")
  const dropB = drops.find((item) => item.slot === "B")
  const scenarios = useMemo(() => {
    return [dropA, dropB].map((drop) => {
      const feature = drop ? byPin.get(drop.pin) : null
      return drop && feature ? buildScenario(drop.slot, drop.typeId, feature.properties, zoning) : null
    })
  }, [byPin, dropA, dropB, zoning])
  const result = useMemo(
    () => (scenarios[0] && scenarios[1] ? compareScenarios(scenarios[0], scenarios[1], weights) : null),
    [scenarios, weights],
  )
  const comparison = Boolean(result)
  const compareKey = `${dropA?.pin}:${dropA?.typeId}|${dropB?.pin}:${dropB?.typeId}|${JSON.stringify(weights)}`
  const compareAi = useExplanation(compareKey)
  const compareRobustness = useMemo(
    () => (result ? analyzeRobustness(compareWinner(scenarios[0], scenarios[1]), weights) : null),
    [result, scenarios, weights],
  )

  const [cue, setCue] = useState(null)
  const lastWinner = useRef(null)
  useEffect(() => {
    const winner = result?.winner ?? null
    const label = winner === "A" ? result.a.label : winner === "B" ? result.b.label : null
    if (lastWinner.current && winner && lastWinner.current !== winner) {
      setCue(winner === "tie" ? "Ranking changed: the two options now score the same." : `Ranking changed: ${label} now scores higher.`)
      const timer = setTimeout(() => setCue(null), 6000)
      lastWinner.current = winner
      return () => clearTimeout(timer)
    }
    lastWinner.current = winner
  }, [result])

  const compareSweep = useMemo(() => (result ? sweepPair(scenarios[0], scenarios[1], weights) : null), [result, scenarios, weights])

  useEffect(() => {
    onCompareState?.(result ? { result, robustness: compareRobustness, sweep: compareSweep, explanation: compareAi.explanation } : null)
  }, [result, compareRobustness, compareSweep, compareAi.explanation, onCompareState])

  function onExplainCompare() {
    if (!comparison || !dropA || !dropB) return
    const a = { pin: dropA.pin, typeId: dropA.typeId }
    const b = { pin: dropB.pin, typeId: dropB.typeId }
    compareAi.run({ kind: "compare", weights, a, b }, () =>
      explainCompareTemplate(
        buildCompareContext({
          a,
          b,
          featureA: byPin.get(a.pin),
          featureB: byPin.get(b.pin),
          weights,
          zoningRules: zoning,
          stops,
          sources: null,
          summary,
        }),
      ),
    )
  }

  return (
    <aside className="panel" id="panel">
      {guide}
      {comparison ? (
        <section className="answer-section" id="comparison" tabIndex={-1}>
          <AnswerCard result={result} robustness={compareRobustness} onBrief={onGoBrief} />
          <WeightsPanel weights={weights} onWeights={onWeights} onAntiDisplacement={onAntiDisplacement} cue={cue} />
          <div className="action-row">
            <button type="button" className="secondary" onClick={onExplainCompare} disabled={compareAi.explaining}>
              {compareAi.explaining ? "Writing explanation…" : "Explain the difference in plain words"}
            </button>
          </div>
          <Explanation explanation={compareAi.explanation} />
          <details className="more">
            <summary>How was this scored?</summary>
            <ComparisonView result={result} onPrint={onPrintBrief} />
            <Robustness
              analysis={compareRobustness}
              title="Does the winner hold?"
              sweep={compareSweep}
              sweepNote={result?.sameParcel ? SHARED_FACTOR_NOTE : null}
            />
          </details>
          <details className="more">
            <summary>Where the numbers come from (sources and evidence)</summary>
            {[result.a, ...(result.sameParcel ? [] : [result.b])].map((side) => (
              <EvidenceDrawer
                key={side.slot}
                props={byPin.get(side.pin)?.properties}
                typeId={side.scoreType}
                typeLabel={`option ${side.slot} (${side.label})`}
                sources={sources}
                summary={summary}
                zoning={zoning}
                model={model}
              />
            ))}
          </details>
          <details className="more">
            <summary>Option details (every score, map layers, flag a problem)</summary>
            <div className="compare-grid">{cardsFor()}</div>
          </details>
          <details className="more">
            <summary>Save or share this comparison</summary>
            {share}
          </details>
        </section>
      ) : (
        <section className="empty-state">
          <h2>Compare two options</h2>
          <p>
            {drops.length
              ? "One option is placed. Pick a second building type and a lot to compare them."
              : "Pick a building type, then click a lot on the map or search an address. Do it twice to compare. Or start the guided example at the top."}
          </p>
          {drops.length ? <div className="compare-grid">{cardsFor()}</div> : null}
        </section>
      )}

      <details className="more" open={!comparison}>
        <summary>{comparison ? "Change the options" : "Choose options"}</summary>
        <p className="hint">Pick a building type, then click a lot. The first pick is option A, the next is option B.</p>
        <div className="palette">
          {Object.entries(BUILDINGS).map(([id, spec]) => (
            <button key={id} type="button" className={activeType === id ? "on" : ""} aria-pressed={activeType === id} onClick={() => onType(id)}>
              <i style={{ background: TYPE_COLORS[id] }} aria-hidden="true" />
              {spec.label}
              <span>
                {spec.units} {spec.units === 1 ? "home" : "homes"} · {spec.heightM} m (illustration)
              </span>
            </button>
          ))}
        </div>
        <div className="zoom-row" role="group" aria-label="Which option to place next">
          <button type="button" className={activeSlot === "A" ? "on" : ""} aria-pressed={activeSlot === "A"} onClick={() => onSlot("A")}>
            Option A
          </button>
          <button type="button" className={activeSlot === "B" ? "on" : ""} aria-pressed={activeSlot === "B"} onClick={() => onSlot("B")}>
            Option B
          </button>
        </div>
        <label>
          Search an address
          <input value={query} onChange={(event) => onQuery(event.target.value)} name="address-search" placeholder="Try a street name, for example 4200 butler" />
        </label>
        {query.trim() && matches.length === 0 ? <p className="hint">No address match in Hazelwood or Lawrenceville.</p> : null}
        {matchTotal > matches.length ? (
          <p className="hint">
            Showing {matches.length} of {matchTotal.toLocaleString()} matches. Add a house number to narrow it.
          </p>
        ) : null}
        {matches.length ? <p className="hint">Choosing an address places {BUILDINGS[activeType]?.label} as option {activeSlot}.</p> : null}
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
        <div className="zoom-row" role="group" aria-label="Zoom the map">
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
        <p className="hint">Right-drag the map to tilt the 3D blocks. The blocks are illustrations, not a permitted design.</p>
      </details>

      <details className="more">
        <summary>About this screen</summary>
        <p>
          Placing a building does not mean it may be built. A real decision should go to City Planning / the Zoning
          Administrator or a qualified professional.{" "}
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
      </details>
    </aside>
  )

  function cardsFor() {
    return ["A", "B"].map((slot) => {
      const drop = drops.find((item) => item.slot === slot)
      const feature = drop ? byPin.get(drop.pin) : null
      if (!drop || !feature) {
        return (
          <article key={slot} className="drop-card empty">
            <header>Option {slot}</header>
            <p className="hint">Empty. Choose this option and click a lot.</p>
          </article>
        )
      }
      return (
        <DropCard
          key={`${slot}:${drop.pin}:${drop.typeId}`}
          drop={drop}
          feature={feature}
          weights={weights}
          zoning={zoning}
          stops={stops}
          summary={summary}
          onClear={() => onClear(slot)}
        />
      )
    })
  }
}
