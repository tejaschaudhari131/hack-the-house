"use client"

import { useEffect, useMemo, useRef } from "react"
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import { TYPE_COLORS } from "../lib/colors.js"
import { rankTypes } from "../lib/rank.js"
import { resolveZoning } from "../lib/zoning.js"

function boundsFor(collection, group) {
  const features = group
    ? collection.features.filter((feature) => feature.properties.group === group || feature.properties.area === group)
    : collection.features
  if (!features.length) return null
  const bounds = L.geoJSON({ type: "FeatureCollection", features }).getBounds()
  return bounds.isValid() ? bounds : null
}

function FitTo({ collection, focus }) {
  const map = useMap()
  useEffect(() => {
    const bounds = boundsFor(collection, focus)
    if (bounds) map.fitBounds(bounds, { padding: [18, 18] })
  }, [collection, focus, map])
  return null
}

function styleFor(feature, { zoning, weights, whatIf, selectedPin }) {
  const props = feature.properties
  const zoningInfo = resolveZoning(props.zoning_code, zoning)
  const ranked = rankTypes(props.scores, weights, {
    allowed: zoningInfo.allowed,
    whatIf,
  })
  const top = ranked.find((row) => row.composite !== null) || ranked[0]
  const selected = props.pin === selectedPin
  return {
    color: selected ? "#111111" : TYPE_COLORS[top?.id] || "#667085",
    weight: selected ? 3 : 1,
    fillColor: TYPE_COLORS[top?.id] || "#98a2b3",
    fillOpacity: selected ? 0.85 : 0.62,
  }
}

export default function MapView({ parcels, neighborhoods, zoning, weights, whatIf, selectedPin, focus, onSelect }) {
  const geoRef = useRef(null)
  const styleDeps = useMemo(
    () => ({ zoning, weights, whatIf, selectedPin }),
    [zoning, weights, whatIf, selectedPin],
  )

  useEffect(() => {
    const layer = geoRef.current
    if (!layer) return
    layer.eachLayer((child) => {
      if (child.feature) child.setStyle(styleFor(child.feature, styleDeps))
    })
  }, [styleDeps])

  return (
    <MapContainer
      center={[40.45, -79.95]}
      zoom={13}
      preferCanvas
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url="https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <FitTo collection={neighborhoods} focus={focus} />
      <GeoJSON
        data={neighborhoods}
        style={{ color: "#1f2933", weight: 2, fillOpacity: 0, dashArray: "5 4" }}
        interactive={false}
      />
      <GeoJSON
        ref={geoRef}
        data={parcels}
        style={(feature) => styleFor(feature, styleDeps)}
        onEachFeature={(feature, layer) => {
          const label = feature.properties.address || feature.properties.pin
          layer.bindTooltip(label)
          layer.on("click", () => onSelect(feature.properties.pin))
        }}
      />
    </MapContainer>
  )
}
