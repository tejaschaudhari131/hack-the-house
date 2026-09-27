"use client"

import { useEffect, useRef, useState } from "react"
import { Map as MapLibreMap, Marker, NavigationControl } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { BUILDINGS } from "../lib/buildings.js"
import { TYPE_COLORS } from "../lib/colors.js"
import { circlePolygon, featurePoint } from "../lib/geo.js"

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
}

const SLOT_COLORS = { A: "#1d4ed8", B: "#b45309" }

function walkBounds(geometry, bounds) {
  if (!geometry) return
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries || []) walkBounds(child, bounds)
    return
  }
  const coords = geometry.coordinates
  const visit = (value) => {
    if (!Array.isArray(value)) return
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      bounds.minLon = Math.min(bounds.minLon, value[0])
      bounds.minLat = Math.min(bounds.minLat, value[1])
      bounds.maxLon = Math.max(bounds.maxLon, value[0])
      bounds.maxLat = Math.max(bounds.maxLat, value[1])
      return
    }
    for (const child of value) visit(child)
  }
  visit(coords)
}

function collectionBounds(collection, group) {
  const bounds = { minLon: 180, minLat: 90, maxLon: -180, maxLat: -90 }
  for (const feature of collection?.features || []) {
    if (group && feature.properties?.group !== group && feature.properties?.area !== group) continue
    walkBounds(feature.geometry, bounds)
  }
  if (bounds.minLon > bounds.maxLon) return null
  return bounds
}

function emptyCollection() {
  return { type: "FeatureCollection", features: [] }
}

export default function DropMap({ parcels, neighborhoods, stops, drops, focus, onDrop }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const onDropRef = useRef(onDrop)
  const focusRef = useRef(focus)
  onDropRef.current = onDrop
  focusRef.current = focus
  const [ready, setReady] = useState(false)
  const flewKey = useRef("")
  const markersRef = useRef([])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined
    const map = new MapLibreMap({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [-79.96, 40.45],
      zoom: 13,
      pitch: 50,
      bearing: -18,
    })
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right")
    map.on("load", () => {
      map.addSource("parcels", { type: "geojson", data: parcels })
      map.addSource("neighborhoods", { type: "geojson", data: neighborhoods })
      map.addSource("rings", { type: "geojson", data: emptyCollection() })
      map.addSource("buildings", { type: "geojson", data: emptyCollection() })
      map.addSource("hazards", { type: "geojson", data: emptyCollection() })
      map.addSource("stops", { type: "geojson", data: stops || emptyCollection() })
      map.addLayer({
        id: "neighborhoods-line",
        type: "line",
        source: "neighborhoods",
        paint: { "line-color": "#1f2933", "line-width": 1.5, "line-dasharray": [2, 1.5] },
      })
      map.addLayer({
        id: "parcels-fill",
        type: "fill",
        source: "parcels",
        paint: { "fill-color": "#d6d3d1", "fill-opacity": 0.45 },
      })
      map.addLayer({
        id: "parcels-line",
        type: "line",
        source: "parcels",
        paint: { "line-color": "#78716c", "line-width": 0.4 },
      })
      map.addLayer({
        id: "rings-fill",
        type: "fill",
        source: "rings",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.08 },
      })
      map.addLayer({
        id: "rings-line",
        type: "line",
        source: "rings",
        paint: { "line-color": ["get", "color"], "line-width": 2, "line-dasharray": [1.5, 1] },
      })
      map.addLayer({
        id: "hazards-fill",
        type: "fill",
        source: "hazards",
        paint: {
          "fill-color": [
            "match",
            ["get", "kind"],
            "flood",
            "#1d4ed8",
            "slope",
            "#ca8a04",
            "both",
            "#7c3aed",
            "#78716c",
          ],
          "fill-opacity": 0.35,
        },
      })
      map.addLayer({
        id: "buildings-extrusion",
        type: "fill-extrusion",
        source: "buildings",
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.92,
        },
      })
      map.addLayer({
        id: "stops-circle",
        type: "circle",
        source: "stops",
        filter: ["==", ["get", "inside"], 1],
        paint: {
          "circle-radius": 5,
          "circle-color": "#111827",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#f8fafc",
        },
      })
      map.on("click", "parcels-fill", (event) => {
        const pin = event.features?.[0]?.properties?.pin
        if (pin) onDropRef.current(pin)
      })
      map.on("mouseenter", "parcels-fill", () => {
        map.getCanvas().style.cursor = "crosshair"
      })
      map.on("mouseleave", "parcels-fill", () => {
        map.getCanvas().style.cursor = ""
      })
      const bounds = collectionBounds(neighborhoods, focusRef.current)
      if (bounds) {
        map.fitBounds(
          [
            [bounds.minLon, bounds.minLat],
            [bounds.maxLon, bounds.maxLat],
          ],
          { padding: 28, duration: 0 },
        )
      }
      map.setPitch(55)
      map.setBearing(-20)
      setReady(true)
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [neighborhoods, parcels])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const byPin = new Map((parcels?.features || []).map((feature) => [feature.properties.pin, feature]))
    const inside = new Set()
    const rings = []
    const buildings = []
    const hazards = []
    for (const drop of drops) {
      const feature = byPin.get(drop.pin)
      if (!feature) continue
      const point = featurePoint(feature.geometry)
      if (!point) continue
      const [lon, lat] = point
      const spec = BUILDINGS[drop.typeId]
      rings.push({
        type: "Feature",
        properties: { color: SLOT_COLORS[drop.slot] || "#1d4ed8", slot: drop.slot },
        geometry: circlePolygon(lon, lat),
      })
      buildings.push({
        type: "Feature",
        properties: {
          height: spec?.heightM || 8,
          color: TYPE_COLORS[drop.typeId] || "#1d4e89",
          typeId: drop.typeId,
          pin: drop.pin,
        },
        geometry: feature.geometry,
      })
      const flood = (feature.properties.sfha_overlap || 0) > 0 || (feature.properties.flood_02_overlap || 0) > 0
      const slope = (feature.properties.steep_slope_overlap || 0) > 0
      if (flood || slope) {
        hazards.push({
          type: "Feature",
          properties: { kind: flood && slope ? "both" : flood ? "flood" : "slope" },
          geometry: feature.geometry,
        })
      }
      for (const stop of stops?.features || []) {
        const coords = stop.geometry?.coordinates
        if (!coords) continue
        const dLat = (lat - coords[1]) * 111_320
        const dLon = (lon - coords[0]) * 111_320 * Math.cos((lat * Math.PI) / 180)
        if (Math.hypot(dLat, dLon) <= 800) inside.add(stop.properties.stop_id)
      }
    }
    const stopFeatures = (stops?.features || []).map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        inside: inside.has(feature.properties.stop_id) ? 1 : 0,
      },
    }))
    map.getSource("rings")?.setData({ type: "FeatureCollection", features: rings })
    map.getSource("buildings")?.setData({ type: "FeatureCollection", features: buildings })
    map.getSource("hazards")?.setData({ type: "FeatureCollection", features: hazards })
    map.getSource("stops")?.setData({ type: "FeatureCollection", features: stopFeatures })
    const latest = drops[drops.length - 1]
    const latestFeature = latest ? byPin.get(latest.pin) : null
    const latestPoint = latestFeature ? featurePoint(latestFeature.geometry) : null
    const key = drops.map((drop) => `${drop.slot}:${drop.pin}:${drop.typeId}`).join("|")
    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []
    for (const drop of drops) {
      const feature = byPin.get(drop.pin)
      const point = feature ? featurePoint(feature.geometry) : null
      if (!point) continue
      const spec = BUILDINGS[drop.typeId]
      const element = document.createElement("div")
      element.className = "building-pin"
      element.style.background = TYPE_COLORS[drop.typeId] || "#1d4e89"
      element.style.height = `${Math.round(18 + (spec?.heightM || 8))}px`
      element.title = `${drop.slot}: ${spec?.heightM || 8} m`
      markersRef.current.push(new Marker({ element, anchor: "bottom" }).setLngLat(point).addTo(map))
    }
    if (latestPoint && key !== flewKey.current) {
      flewKey.current = key
      map.easeTo({
        center: latestPoint,
        zoom: 17.6,
        pitch: 60,
        bearing: -28,
        duration: 700,
      })
    }
  }, [drops, parcels, ready, stops])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !focus) return
    const bounds = collectionBounds(neighborhoods, focus)
    if (!bounds) return
    map.fitBounds(
      [
        [bounds.minLon, bounds.minLat],
        [bounds.maxLon, bounds.maxLat],
      ],
      { padding: 28, pitch: 50 },
    )
  }, [focus, neighborhoods])

  return <div ref={containerRef} className="drop-map" />
}
