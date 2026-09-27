"use client"

import dynamic from "next/dynamic"
import { useDeferredValue, useEffect, useMemo, useState } from "react"

import DropPanel from "./DropPanel.js"
import Onboarding, { hasOnboarded } from "./Onboarding.js"
import FindSitesPanel from "./FindSitesPanel.js"
import ParcelPanel from "./ParcelPanel.js"
import ParcelReport from "./ParcelReport.js"
import DecisionBrief from "./DecisionBrief.js"
import GuideBanner from "./GuideBanner.js"
import { GUIDE_QUERY_ID, alternativeBuilding, buildingForSiteType, resolveGuide } from "../lib/guide.js"
import { useExplanation } from "../lib/explainClient.js"
import { buildParcelContext } from "../lib/explainFacts.js"
import { explainTemplate } from "../lib/explainTemplate.js"
import { DEFAULT_WEIGHTS, rankTypes } from "../lib/rank.js"
import { DEFAULT_SITE_FILTERS, EXAMPLE_QUERIES, filtersFor, findSites } from "../lib/sites.js"
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
  const [guide, setGuide] = useState(null)
  const [compareState, setCompareState] = useState(null)
  const [shortlist, setShortlist] = useState(null)
  const mapWeights = useDeferredValue(weights)

  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).has("pin")
    if (!linked && !hasOnboarded()) setOnboardingOpen(true)
  }, [])
  const [siteFilters, setSiteFilters] = useState(DEFAULT_SITE_FILTERS)
  const [siteSort, setSiteSort] = useState("score")
  const [siteExample, setSiteExample] = useState(null)
  const [sources, setSources] = useState(null)
  const [lihtc, setLihtc] = useState(null)
  const [openedFromSites, setOpenedFromSites] = useState(false)

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
          performance.mark("htm:parcels-parsed")
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
    for (const [path, setter] of [
      ["/data/sources.json", setSources],
      ["/data/lihtc.geojson", setLihtc],
    ]) {
      fetch(path)
        .then((response) => (response.ok ? response.json() : null))
        .then((json) => {
          if (!cancelled && json) setter(json)
        })
        .catch(() => {})
    }
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

  const siteRows = useMemo(() => {
    if (mode !== "sites" || !parcels) return []
    return findSites(parcels.features, siteFilters, weights, zoning, siteSort)
  }, [mode, parcels, siteFilters, weights, zoning, siteSort])
  const siteHighlight = useMemo(
    () => (mode === "sites" ? new Map(siteRows.map((row) => [row.pin, row.scoreType])) : null),
    [mode, siteRows],
  )

  const allMatches = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, " ")
    if (!needle || !parcels) return []
    const hits = []
    for (const feature of parcels.features) {
      const address = (feature.properties.address || "").toLowerCase()
      const at = address.indexOf(needle)
      if (at === -1) continue
      hits.push({ feature, address, rank: at === 0 ? 0 : address[at - 1] === " " ? 1 : 2 })
    }
    hits.sort((a, b) => a.rank - b.rank || a.address.localeCompare(b.address, "en", { numeric: true }))
    return hits.map((hit) => hit.feature)
  }, [parcels, query])
  const matches = allMatches.slice(0, 8)
  const matchTotal = allMatches.length

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

  function startGuide() {
    if (!parcels || !zoning) return
    const resolved = resolveGuide(parcels.features, zoning, DEFAULT_WEIGHTS)
    setOnboardingOpen(false)
    setWeights(DEFAULT_WEIGHTS)
    setFocus(null)
    setQuery("")
    setSiteFilters(resolved.filters)
    setSiteSort("score")
    setSiteExample(GUIDE_QUERY_ID)
    setSelectedPin(resolved.pin)
    setMode("sites")
    setGuide({ ...resolved, step: 1 })
  }

  /** Drop two options on one parcel: the searched building type (a triplex stays a triplex) and the best permitted alternative. */
  function compareOnParcel(pin, siteType, fromSites) {
    const feature = byPin.get(pin)
    if (!feature) return
    const primary = buildingForSiteType(siteType)
    const alternative = alternativeBuilding(feature.properties, primary, zoning, weights)
    setDrops([
      { slot: "A", pin, typeId: primary },
      { slot: "B", pin, typeId: alternative },
    ])
    setActiveSlot("A")
    setShortlist(fromSites ? { filters: siteFilters, count: siteRows.length } : null)
    setMode("drop")
  }

  function guideNext() {
    if (!guide) return
    if (guide.step === 1) {
      setDrops([guide.a, guide.b])
      setActiveSlot("A")
      setShortlist({ filters: guide.filters, count: guide.count })
      setMode("drop")
      setGuide({ ...guide, step: 2 })
    } else if (guide.step === 2) {
      setGuide({ ...guide, step: 3 })
    }
  }

  function openAntiDisplacement() {
    const example = EXAMPLE_QUERIES.find((item) => item.id === "anti-displacement")
    if (!example) return
    setSiteFilters(filtersFor(example))
    setSiteExample(example.id)
    setWeights((current) => ({ ...current, ...(example.weights || {}) }))
    setGuide(null)
    setMode("sites")
  }

  function printBrief() {
    window.print()
  }

  const guideBanner = guide ? (
    <GuideBanner guide={guide} onNext={guideNext} onExit={() => setGuide(null)} onPrint={printBrief} />
  ) : null

  return (
    <div className="page">
      <a className="skip-link" href="#panel">
        Skip to the results panel
      </a>
      <header className="banner">
        <div className="banner-main">
          <h1 className="banner-title">Hack the House</h1>
          <p className="banner-sub">
            Compare housing options for real Pittsburgh sites: {summary?.parcel_count ? summary.parcel_count.toLocaleString() : "…"}{" "}
            parcels in Hazelwood and Lawrenceville, scored on six factors with the zoning use table shown separately. For
            CDC staff and planners building a shortlist.
          </p>
        </div>
        <span className="mode-switch" role="group" aria-label="Mode">
          <button type="button" className={mode === "inspect" ? "on" : ""} aria-pressed={mode === "inspect"} onClick={() => setMode("inspect")}>
            Click a parcel
          </button>
          <button type="button" className={mode === "drop" ? "on" : ""} aria-pressed={mode === "drop"} onClick={() => setMode("drop")}>
            Drop a building
          </button>
          <button type="button" className={mode === "sites" ? "on" : ""} aria-pressed={mode === "sites"} onClick={() => setMode("sites")}>
            Find sites
          </button>
        </span>
        <span className="banner-help">
          <button type="button" className="primary" onClick={startGuide} disabled={!parcels}>
            Try a real example
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
      <Onboarding open={onboardingOpen} onClose={() => setOnboardingOpen(false)} onExample={startGuide} />
      <div className={mode === "drop" ? "app drop-mode" : mode === "sites" ? "app sites-mode" : "app"}>
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
          {parcels && neighborhoods && (mode === "inspect" || mode === "sites") ? (
            <MapView
              key={mode}
              parcels={parcels}
              neighborhoods={neighborhoods}
              zoning={zoning}
              weights={mapWeights}
              whatIf={mode === "sites" ? false : whatIf}
              selectedPin={selectedPin}
              focus={mode === "sites" ? siteFilters.area || null : focus}
              onSelect={setSelectedPin}
              highlight={siteHighlight}
              lihtc={mode === "sites" ? lihtc : null}
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
                <li><i style={{ background: "#1d4ed8" }} /> 800 m straight-line ring</li>
                <li><i style={{ background: "#111827" }} /> Stop inside the ring</li>
              </>
            ) : null}
            {mode === "sites" ? (
              <>
                <li><i style={{ background: "#cbd2d9" }} /> Does not match the filters</li>
                <li><i className="dot" style={{ background: "#ede9fe", borderColor: "#4c1d95" }} /> HUD LIHTC project (context)</li>
                <li className="legend-note">Matches are colored by the type they are ranked as.</li>
              </>
            ) : null}
          </ul>
        </div>
        {mode === "sites" ? (
          <FindSitesPanel
            filters={siteFilters}
            onFilters={setSiteFilters}
            sort={siteSort}
            onSort={setSiteSort}
            rows={siteRows}
            weights={weights}
            onWeights={setWeights}
            selectedPin={selectedPin}
            onSelectPin={setSelectedPin}
            onOpenParcel={(pin) => {
              setSelectedPin(pin)
              setOpenedFromSites(true)
              setMode("inspect")
            }}
            sources={sources}
            activeExample={siteExample}
            onExample={setSiteExample}
            onCompareSite={(pin, siteType) => compareOnParcel(pin, siteType, true)}
            onAntiDisplacement={openAntiDisplacement}
            guide={guideBanner}
          />
        ) : mode === "drop" ? (
          <DropPanel
            summary={summary}
            weights={weights}
            onWeights={setWeights}
            focus={focus}
            onFocus={setFocus}
            query={query}
            onQuery={setQuery}
            matches={matches}
            matchTotal={matchTotal}
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
            onCompareState={setCompareState}
            onAntiDisplacement={openAntiDisplacement}
            sources={sources}
            model={model}
            onPrintBrief={printBrief}
            guide={guideBanner}
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
          matchTotal={matchTotal}
          onSelectPin={setSelectedPin}
          selected={selected}
          ranked={ranked}
          zoningInfo={zoningInfo}
          explanation={explanation}
          explaining={explaining}
          onExplain={onExplain}
          onPrint={() => window.print()}
          sources={sources}
          onBackToSites={openedFromSites ? () => setMode("sites") : null}
          siteType={openedFromSites ? siteFilters.typeId : null}
          onCompareSite={(pin, siteType) => compareOnParcel(pin, siteType, openedFromSites)}
          onAntiDisplacement={openAntiDisplacement}
          zoning={zoning}
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
      {mode === "drop" && compareState ? (
        <DecisionBrief
          compare={compareState}
          weights={weights}
          featureA={byPin.get(compareState.result.a.pin)}
          featureB={byPin.get(compareState.result.b.pin)}
          zoning={zoning}
          summary={summary}
          model={model}
          shortlist={shortlist}
        />
      ) : null}
    </div>
  )
}
