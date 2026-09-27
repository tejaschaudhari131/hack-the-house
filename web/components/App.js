"use client"

import dynamic from "next/dynamic"
import { useDeferredValue, useEffect, useMemo, useState } from "react"

import DropPanel from "./DropPanel.js"
import Onboarding, { hasOnboarded } from "./Onboarding.js"
import ParcelPanel from "./ParcelPanel.js"
import ParcelReport from "./ParcelReport.js"
import { DEMO_EXAMPLE } from "../lib/example.js"
import { useExplanation } from "../lib/explainClient.js"
import { buildParcelContext } from "../lib/explainFacts.js"
import { explainTemplate } from "../lib/explainTemplate.js"
import { DEFAULT_WEIGHTS, rankTypes } from "../lib/rank.js"
import { resolveZoning } from "../lib/zoning.js"

const MapView = dynamic(() => import("./MapView.js"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading map…</div>,
})

const DropMap = dynamic(() => import("./DropMap.js"), {
  ssr: false,
  loading: () => <div className="map-loading">Loading 3D map…</div>,
})

export default function App() {
  const [parcels, setParcels] = useState(null)
  const [neighborhoods, setNeighborhoods] = useState(null)
  const [zoning, setZoning] = useState(null)
  const [summary, setSummary] = useState(null)
  const [model, setModel] = useState(null)
  const [error, setError] = useState(null)
  const [selectedPin, setSelectedPin] = useState(null)
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS)
  const [whatIf, setWhatIf] = useState(false)
  const [focus, setFocus] = useState(null)
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState("inspect")
  const [stops, setStops] = useState(null)
  const [activeType, setActiveType] = useState("townhouse_duplex")
  const [activeSlot, setActiveSlot] = useState("A")
  const [drops, setDrops] = useState([])
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [exampleNote, setExampleNote] = useState(null)
  const mapWeights = useDeferredValue(weights)

  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).has("pin")
    if (!linked && !hasOnboarded()) setOnboardingOpen(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const paths = [
          "/data/parcels.geojson",
          "/data/neighborhoods.geojson",
          "/data/zoning.json",
          "/data/summary.json",
          "/data/score_model.json",
        ]
        const responses = await Promise.all(paths.map((path) => fetch(path)))
        const failed = responses.find((response) => !response.ok)
        if (failed) throw new Error(`${failed.url} returned ${failed.status}`)
        const [parcelJson, neighborhoodJson, zoningJson, summaryJson, modelJson] = await Promise.all(
          responses.map((response) => response.json()),
        )
        if (!cancelled) {
          setParcels(parcelJson)
          setNeighborhoods(neighborhoodJson)
          setZoning(zoningJson)
          setSummary(summaryJson)
          setModel(modelJson)
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError.message)
      }
    }
    load()
    fetch("/data/stops.geojson")
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!cancelled && json) setStops(json)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const byPin = useMemo(() => {
    const index = new Map()
    for (const feature of parcels?.features || []) index.set(feature.properties.pin, feature)
    return index
  }, [parcels])

  useEffect(() => {
    if (!parcels) return
    const pin = new URLSearchParams(window.location.search).get("pin")
    if (pin && byPin.has(pin)) setSelectedPin(pin)
  }, [parcels, byPin])

  useEffect(() => {
    if (!parcels) return
    const url = new URL(window.location.href)
    if (selectedPin && mode === "inspect") url.searchParams.set("pin", selectedPin)
    else url.searchParams.delete("pin")
    window.history.replaceState(null, "", url)
  }, [parcels, selectedPin, mode])

  const selectedFeature = selectedPin ? byPin.get(selectedPin) : null
  const selected = selectedFeature?.properties || null
  const zoningInfo = selected ? resolveZoning(selected.zoning_code, zoning) : null
  const ranked = selected
    ? rankTypes(selected.scores, weights, { allowed: zoningInfo?.allowed || null, whatIf })
    : null

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle || !parcels) return []
    return parcels.features
      .filter((feature) => (feature.properties.address || "").toLowerCase().includes(needle))
      .slice(0, 8)
  }, [parcels, query])

  const { explanation, explaining, run: runExplanation } = useExplanation(
    `${selectedPin}|${whatIf}|${JSON.stringify(weights)}`,
  )

  function onExplain() {
    if (!selected) return
    runExplanation({ kind: "parcel", pin: selected.pin, weights, whatIf }, () =>
      explainTemplate(buildParcelContext({ props: selected, weights, whatIf, zoningRules: zoning, sources: null, summary }).templateInput),
    )
  }

  function dropOn(pin) {
    setDrops((current) => {
      const next = current.filter((item) => item.slot !== activeSlot)
      next.push({ slot: activeSlot, pin, typeId: activeType })
      return next
    })
    setActiveSlot((current) => (current === "A" ? "B" : current))
  }

  function loadExample() {
    setMode("drop")
    setWeights(DEFAULT_WEIGHTS)
    setFocus(null)
    setQuery("")
    setDrops([DEMO_EXAMPLE.a, DEMO_EXAMPLE.b])
    setActiveSlot("A")
    setExampleNote(DEMO_EXAMPLE.story)
  }

  return (
    <div className="page">
      <a className="skip-link" href="#panel">
        Skip to the results panel
      </a>
      <header className="banner">
        <div className="banner-main">
          <h1 className="banner-title">Housing Typology, Equity &amp; Climate Matchmaker</h1>
          <p className="banner-sub">
            Compare four housing types on real Hazelwood and Lawrenceville parcels by demand, transit, equity, and
            climate risk. For planners, CDCs, developers, and residents.
          </p>
        </div>
        <span className="mode-switch" role="group" aria-label="Mode">
          <button type="button" className={mode === "inspect" ? "on" : ""} aria-pressed={mode === "inspect"} onClick={() => setMode("inspect")}>
            Click a parcel
          </button>
          <button type="button" className={mode === "drop" ? "on" : ""} aria-pressed={mode === "drop"} onClick={() => setMode("drop")}>
            Drop a building
          </button>
        </span>
        <span className="banner-help">
          <button type="button" onClick={loadExample}>
            Try an example
          </button>
          <button type="button" onClick={() => setOnboardingOpen(true)}>
            How it works
          </button>
        </span>
        <p className="banner-note">
          <strong>Screening aid only.</strong> Not legal, zoning, financial, or permitting advice. Confirm real decisions
          with City Planning / the Zoning Administrator or a qualified professional.
        </p>
      </header>
      <Onboarding open={onboardingOpen} onClose={() => setOnboardingOpen(false)} onExample={loadExample} />
      <div className={mode === "drop" ? "app drop-mode" : "app"}>
        <div className="map-wrap" role="region" aria-label="Parcel map. Keyboard users can pick a parcel with Address search in the panel.">
          {error ? (
            <p className="map-loading" role="alert">
              Parcel data did not load ({error}). Reload the page. If this keeps happening, the files in
              web/public/data are missing from the deployment.
            </p>
          ) : null}
          {!error && !parcels ? (
            <div className="map-loading" role="status">
              <span className="spinner" aria-hidden="true" /> Loading about 8,600 parcels with their scores. This can
              take a few seconds on a slow connection.
            </div>
          ) : null}
          {parcels && neighborhoods && mode === "inspect" ? (
            <MapView
              parcels={parcels}
              neighborhoods={neighborhoods}
              zoning={zoning}
              weights={mapWeights}
              whatIf={whatIf}
              selectedPin={selectedPin}
              focus={focus}
              onSelect={setSelectedPin}
            />
          ) : null}
          {parcels && neighborhoods && mode === "drop" ? (
            <DropMap
              parcels={parcels}
              neighborhoods={neighborhoods}
              stops={stops}
              drops={drops}
              focus={focus}
              onDrop={dropOn}
            />
          ) : null}
          <ul className="legend" aria-label="Map legend">
            {mode === "inspect" ? <li className="legend-note">Color: #1 type under your weights</li> : null}
            <li><i style={{ background: "#1d4e89" }} /> Single-family</li>
            <li><i style={{ background: "#0f766e" }} /> Townhouse / duplex</li>
            <li><i style={{ background: "#c2410c" }} /> Small apartment</li>
            <li><i style={{ background: "#9f1239" }} /> Large apartment</li>
            {mode === "drop" ? (
              <>
                <li><i style={{ background: "#1d4ed8" }} /> 800 m walk ring</li>
                <li><i style={{ background: "#111827" }} /> Stop inside the ring</li>
              </>
            ) : null}
          </ul>
        </div>
        {mode === "drop" ? (
          <DropPanel
            summary={summary}
            weights={weights}
            onWeights={setWeights}
            focus={focus}
            onFocus={setFocus}
            query={query}
            onQuery={setQuery}
            matches={matches}
            onSelectPin={dropOn}
            zoning={zoning}
            stops={stops}
            drops={drops}
            activeType={activeType}
            onType={setActiveType}
            activeSlot={activeSlot}
            onSlot={setActiveSlot}
            onClear={(slot) => setDrops((current) => current.filter((item) => item.slot !== slot))}
            byPin={byPin}
            exampleNote={exampleNote}
            onDismissExample={() => setExampleNote(null)}
          />
        ) : (
        <ParcelPanel
          summary={summary}
          model={model}
          weights={weights}
          onWeights={setWeights}
          whatIf={whatIf}
          onWhatIf={setWhatIf}
          focus={focus}
          onFocus={setFocus}
          query={query}
          onQuery={setQuery}
          matches={matches}
          onSelectPin={setSelectedPin}
          selected={selected}
          ranked={ranked}
          zoningInfo={zoningInfo}
          explanation={explanation}
          explaining={explaining}
          onExplain={onExplain}
          onPrint={() => window.print()}
        />
        )}
      </div>
      {mode === "inspect" && selectedFeature ? (
        <ParcelReport
          feature={selectedFeature}
          weights={weights}
          whatIf={whatIf}
          zoning={zoning}
          summary={summary}
          explanation={explanation}
        />
      ) : null}
    </div>
  )
}
