"use client"

import { useEffect, useMemo, useState } from "react"

import Explanation from "./Explanation.js"
import Robustness from "./Robustness.js"
import WeightPresets from "./WeightPresets.js"
import { analyzeRobustness, compareWinner } from "../lib/robustness.js"
import { BUILDINGS, SCORE_TAGS, WALK_RADIUS_M } from "../lib/buildings.js"
import { TYPE_COLORS } from "../lib/colors.js"
import { compareDrops } from "../lib/compare.js"
import { useExplanation } from "../lib/explainClient.js"
import { buildCompareContext, buildParcelContext, explainCompareTemplate } from "../lib/explainFacts.js"
import { explainTemplate } from "../lib/explainTemplate.js"
import { clearFlag, loadFlags, saveFlag } from "../lib/flags.js"
import { featurePoint, stopsWithin } from "../lib/geo.js"
import { TYPE_LABELS, rankTypes } from "../lib/rank.js"
import { dropZoningBadge, resolveZoning } from "../lib/zoning.js"

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
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What looks wrong? Optional." />
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
  const row = ranked.find((item) => item.id === drop.typeId)
  const badge = dropZoningBadge(drop.typeId, zoningInfo)
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
          Building {drop.slot}. {TYPE_LABELS[drop.typeId]}
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
        About <strong>{spec.units}</strong> homes added, shown {spec.heightM} m tall ({spec.floors} floors). Those
        figures are defaults for the type, not a permit or a measured unit count, and they do not change the scores.
      </p>
      <p>
        <span className={`badge ${badge.id}`}>{badge.label}</span>
      </p>
      <p className="hint">{badge.detail}</p>
      <p className="hint">
        Zoning on the parcel: {props.zoning_code || "not matched"}
        {props.zoning_label ? ` (${props.zoning_label})` : ""}.
      </p>
      {transit ? (
        <p>
          Inside the {WALK_RADIUS_M} m ring: {transit.count} stops and about {transit.trips.toLocaleString()} weekday
          scheduled trips
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
            : "No mapped FEMA Special Flood Hazard Area on this parcel."}{" "}
        {(props.steep_slope_overlap || 0) > 0
          ? `Slope overlay: about ${Math.round(props.steep_slope_overlap * 100)}% is on a 25%+ slope, a landslide-risk proxy, not a landslide inventory.`
          : "No mapped 25%+ slope on this parcel."}
      </p>
      <ScoreLine label="Demand" value={row?.demand} {...SCORE_TAGS.demand} />
      <ScoreLine label="Transit" value={row?.transit} {...SCORE_TAGS.transit} />
      <ScoreLine label="Equity" value={row?.equity} {...SCORE_TAGS.equity} />
      <ScoreLine label="Climate risk" value={row?.climate_risk} {...SCORE_TAGS.climate_risk} />
      <ScoreLine label="Weighted total" value={row?.composite} {...SCORE_TAGS.composite} />
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
  exampleNote,
  onDismissExample,
}) {
  const cards = useMemo(() => {
    return ["A", "B"].map((slot) => {
      const drop = drops.find((item) => item.slot === slot)
      const feature = drop ? byPin.get(drop.pin) : null
      if (!drop || !feature) return null
      const props = feature.properties
      const ranked = rankTypes(props.scores, weights, {
        allowed: resolveZoning(props.zoning_code, zoning).allowed,
        whatIf: false,
      })
      const row = ranked.find((item) => item.id === drop.typeId)
      return {
        pin: drop.pin,
        address: props.address,
        neighborhood: props.neighborhood,
        typeLabel: TYPE_LABELS[drop.typeId],
        composite: row?.composite ?? null,
        demand: row?.demand ?? null,
        transit: row?.transit ?? null,
        equity: row?.equity ?? null,
        climate_suitability: row?.climate_suitability ?? null,
      }
    })
  }, [byPin, drops, weights, zoning])
  const comparison = cards[0] && cards[1] ? compareDrops(cards[0], cards[1]) : ""
  const dropA = drops.find((item) => item.slot === "A")
  const dropB = drops.find((item) => item.slot === "B")
  const compareKey = `${dropA?.pin}:${dropA?.typeId}|${dropB?.pin}:${dropB?.typeId}|${JSON.stringify(weights)}`
  const compareAi = useExplanation(compareKey)
  const compareRobustness = useMemo(() => {
    if (!comparison || !dropA || !dropB) return null
    const featureA = byPin.get(dropA.pin)
    const featureB = byPin.get(dropB.pin)
    if (!featureA || !featureB) return null
    return analyzeRobustness(
      compareWinner(
        { scores: featureA.properties.scores, typeId: dropA.typeId },
        { scores: featureB.properties.scores, typeId: dropB.typeId },
      ),
      weights,
    )
  }, [comparison, dropA, dropB, byPin, weights])

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
      {exampleNote ? (
        <section className="example-note" role="status">
          <h2>Example loaded</h2>
          <p>{exampleNote}</p>
          <p>
            <a href="#comparison">Jump to the comparison</a>
            {" · "}
            <button type="button" className="text-button" onClick={onDismissExample}>
              Dismiss
            </button>
          </p>
        </section>
      ) : null}
      <section className="limitations">
        <h2>Screening aid only</h2>
        <p>
          Dropping a building does not mean it may be built. A consequential decision should go to City Planning /
          the Zoning Administrator or a qualified professional.
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
      </section>

      <section>
        <h2>Palette</h2>
        <p className="hint">Pick a type, then click a parcel. Building A is the first drop. The next click fills Building B.</p>
        <div className="palette">
          {Object.entries(BUILDINGS).map(([id, spec]) => (
            <button key={id} type="button" className={activeType === id ? "on" : ""} onClick={() => onType(id)}>
              <i style={{ background: TYPE_COLORS[id] }} />
              {TYPE_LABELS[id]}
              <span>
                {spec.units} homes · {spec.heightM} m
              </span>
            </button>
          ))}
        </div>
        <div className="zoom-row">
          <button type="button" className={activeSlot === "A" ? "on" : ""} onClick={() => onSlot("A")}>
            Building A
          </button>
          <button type="button" className={activeSlot === "B" ? "on" : ""} onClick={() => onSlot("B")}>
            Building B
          </button>
        </div>
        <p className="hint">
          Next click drops {TYPE_LABELS[activeType]} as Building {activeSlot}. Right-drag the map to tilt the blocks.
        </p>
      </section>

      <section>
        <h2>Weights</h2>
        <p className="hint">These weights are choices. They change the total for both buildings.</p>
        <WeightPresets weights={weights} onWeights={onWeights} />
        {Object.entries(weights).map(([key, value]) => (
          <label key={key} className="slider">
            <span>
              {key === "climate" ? "Climate (prefer lower hazard)" : key[0].toUpperCase() + key.slice(1)}{" "}
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
          <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Try a street name" />
        </label>
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

      {comparison ? (
        <section className="review-box" id="comparison" tabIndex={-1}>
          <h2>Why they rank differently</h2>
          <p>{comparison}</p>
          <Robustness analysis={compareRobustness} title="Does the winner hold?" />
          <button type="button" className="explain" onClick={onExplainCompare} disabled={compareAi.explaining}>
            {compareAi.explaining ? "Writing explanation…" : "Explain A vs B"}
          </button>
          <Explanation explanation={compareAi.explanation} />
        </section>
      ) : (
        <p className="hint">Drop a second building to compare them side by side.</p>
      )}

      <div className="compare-grid">
        {["A", "B"].map((slot) => {
          const drop = drops.find((item) => item.slot === slot)
          const feature = drop ? byPin.get(drop.pin) : null
          if (!drop || !feature) {
            return (
              <article key={slot} className="drop-card empty">
                <header>Building {slot}</header>
                <p className="hint">Empty. Choose this slot and click a parcel.</p>
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
        })}
      </div>
    </aside>
  )
}
