"use client"

import dynamic from "next/dynamic"
import { useEffect, useMemo, useState } from "react"

import DropPanel from "./DropPanel.js"
import ParcelPanel from "./ParcelPanel.js"
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
  const [explanation, setExplanation] = useState(null)
  const [explaining, setExplaining] = useState(false)
  const [mode, setMode] = useState("inspect")
  const [stops, setStops] = useState(null)
  const [activeType, setActiveType] = useState("townhouse_duplex")
  const [activeSlot, setActiveSlot] = useState("A")
  const [drops, setDrops] = useState([])

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

  useEffect(() => {
    setExplanation(null)
  }, [selectedPin, whatIf, weights])

  async function onExplain() {
    if (!selected || !ranked) return
    setExplaining(true)
    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parcel: {
            pin: selected.pin,
            address: selected.address,
            neighborhood: selected.neighborhood,
            land_use: selected.land_use,
            lot_sqft: selected.lot_sqft,
            zoning_code: selected.zoning_code,
            zoning_label: selected.zoning_label,
            census_geography: selected.census_geography,
            median_income: selected.median_income,
            rent_burden_share: selected.rent_burden_share,
            chas_rent_burden_share: selected.chas_rent_burden_share,
            chas_tract_geoid: selected.chas_tract_geoid,
            chas_vintage: selected.chas_vintage,
            sfha_overlap: selected.sfha_overlap,
            steep_slope_overlap: selected.steep_slope_overlap,
            undermined_overlap: selected.undermined_overlap,
            flood_zones: selected.flood_zones,
            trips_within_400m: selected.trips_within_400m,
            nearest_stop_m: selected.nearest_stop_m,
            nearest_stop_name: selected.nearest_stop_name,
            routes_within_400m: selected.routes_within_400m,
            confidence: selected.confidence,
            confidence_label: selected.confidence_label,
            confidence_notes: selected.confidence_notes,
            factors: selected.factors,
          },
          ranked: ranked.map((row) => ({
            id: row.id,
            label: row.label,
            composite: row.composite,
            demand: row.demand,
            transit: row.transit,
            equity: row.equity,
            climate_risk: row.climate_risk,
            climate_suitability: row.climate_suitability,
            allowed: row.allowed,
          })),
          weights,
          whatIf,
          zoning: zoningInfo
            ? {
                status: zoningInfo.status,
                code: zoningInfo.code,
                allowed: zoningInfo.allowed ? [...zoningInfo.allowed] : null,
                note: zoningInfo.note,
              }
            : null,
          countyMedianIncome: summary?.county_median_income ?? null,
        }),
      })
      const payload = await response.json()
      setExplanation(payload)
    } catch (explainError) {
      setExplanation({ text: explainError.message, source: "template", notice: "The explanation request failed." })
    } finally {
      setExplaining(false)
    }
  }

  function dropOn(pin) {
    setDrops((current) => {
      const next = current.filter((item) => item.slot !== activeSlot)
      next.push({ slot: activeSlot, pin, typeId: activeType })
      return next
    })
    setActiveSlot((current) => (current === "A" ? "B" : current))
  }

  return (
    <>
      <header className="banner">
        <strong>Screening aid only.</strong> This is not legal, zoning, financial, or permitting advice. A
        consequential decision should go to City Planning / the Zoning Administrator or a qualified professional.
        <span className="mode-switch">
          <button type="button" className={mode === "inspect" ? "on" : ""} onClick={() => setMode("inspect")}>
            Click a parcel
          </button>
          <button type="button" className={mode === "drop" ? "on" : ""} onClick={() => setMode("drop")}>
            Drop a building
          </button>
        </span>
        <span className="banner-title">Housing typology, equity, and climate matchmaker</span>
      </header>
      <div className={mode === "drop" ? "app drop-mode" : "app"}>
        <div className="map-wrap">
          {error ? <p className="map-loading">{error}. Run the pipeline, then reload.</p> : null}
          {!error && !parcels ? <p className="map-loading">Loading parcels…</p> : null}
          {parcels && neighborhoods && mode === "inspect" ? (
            <MapView
              parcels={parcels}
              neighborhoods={neighborhoods}
              zoning={zoning}
              weights={weights}
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
          <ul className="legend">
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
        />
        )}
      </div>
    </>
  )
}
