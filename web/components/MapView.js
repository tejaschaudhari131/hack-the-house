"use client"

import { useEffect, useMemo, useRef } from "react"
import { CircleMarker, GeoJSON, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import { TYPE_COLORS } from "../lib/colors.js"
import { featurePoint } from "../lib/geo.js"
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

function FlyToSelected({ layerRef, selectedPin }) {
  const map = useMap()
  useEffect(() => {
    const layer = layerRef.current
    if (!layer || !selectedPin) return
    let target = null
    layer.eachLayer((child) => {
      if (child.feature?.properties.pin === selectedPin) target = child
    })
    if (!target) return
    const bounds = target.getBounds()
    if (map.getZoom() >= 16 && map.getBounds().contains(bounds)) return
    map.flyToBounds(bounds, { maxZoom: 17, duration: 0.6 })
  }, [layerRef, selectedPin, map])
  return null
}

/** Zoom to the Find Sites matches when there are few enough to see. */
function FitToMatches({ parcels, highlight }) {
  const map = useMap()
  useEffect(() => {
    if (!highlight || highlight.size === 0 || highlight.size > 400) return
    const features = parcels.features.filter((feature) => highlight.has(feature.properties.pin))
    const bounds = L.geoJSON({ type: "FeatureCollection", features }).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 })
  }, [parcels, highlight, map])
  return null
}

function styleFor(feature, { zoning, weights, whatIf, selectedPin, highlight }) {
  const props = feature.properties
  const selected = props.pin === selectedPin
  if (highlight) {
    const matchType = highlight.get(props.pin)
    if (!matchType) {
      return { color: "#7b8794", weight: 0.5, fillColor: "#9aa5b1", fillOpacity: 0.3 }
    }
    return {
      color: selected ? "#111111" : "#1f2933",
      weight: selected ? 3 : 1.2,
      fillColor: TYPE_COLORS[matchType] || "#98a2b3",
      fillOpacity: 0.9,
    }
  }
  const zoningInfo = resolveZoning(props.zoning_code, zoning)
  const ranked = rankTypes(props.scores, weights, {
    allowed: zoningInfo.allowed,
    whatIf,
  })
  const top = ranked.find((row) => row.composite !== null) || ranked[0]
  return {
    color: selected ? "#111111" : TYPE_COLORS[top?.id] || "#667085",
    weight: selected ? 3 : 1,
    fillColor: TYPE_COLORS[top?.id] || "#98a2b3",
    fillOpacity: selected ? 0.85 : 0.62,
  }
}

export default function MapView({
  parcels,
  neighborhoods,
  zoning,
  weights,
  whatIf,
  selectedPin,
  focus,
  onSelect,
  highlight = null,
  lihtc = null,
}) {
  const geoRef = useRef(null)

  useEffect(() => {
    requestAnimationFrame(() => performance.mark("htm:map-drawn"))
  }, [])
  const matchPoints = useMemo(() => {
    if (!highlight || highlight.size === 0 || highlight.size > 1500) return []
    const points = []
    for (const feature of parcels.features) {
      const typeId = highlight.get(feature.properties.pin)
      if (!typeId) continue
      const point = featurePoint(feature.geometry)
      if (point) points.push({ pin: feature.properties.pin, label: feature.properties.address || feature.properties.pin, typeId, point })
    }
    return points
  }, [parcels, highlight])
  const styleDeps = useMemo(
    () => ({ zoning, weights, whatIf, selectedPin, highlight }),
    [zoning, weights, whatIf, selectedPin, highlight],
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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitTo collection={neighborhoods} focus={focus} />
      <FitToMatches parcels={parcels} highlight={highlight} />
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
      <FlyToSelected layerRef={geoRef} selectedPin={selectedPin} />
      {matchPoints.map((item) => (
        <CircleMarker
          key={`match-${item.pin}`}
          center={[item.point[1], item.point[0]]}
          radius={item.pin === selectedPin ? 8 : 5}
          pathOptions={{
            color: item.pin === selectedPin ? "#111111" : "#ffffff",
            weight: 1.5,
            fillColor: TYPE_COLORS[item.typeId] || "#667085",
            fillOpacity: 1,
          }}
          eventHandlers={{ click: () => onSelect(item.pin) }}
        >
          <Tooltip>{item.label}</Tooltip>
        </CircleMarker>
      ))}
      {(lihtc?.features || []).map((feature) => {
        const [lon, lat] = feature.geometry.coordinates
        const props = feature.properties
        return (
          <CircleMarker
            key={props.hud_id || `${lon},${lat}`}
            center={[lat, lon]}
            radius={5}
            pathOptions={{ color: "#4c1d95", weight: 2, fillColor: "#ede9fe", fillOpacity: 0.95 }}
            interactive
          >
            <Tooltip>
              LIHTC: {props.project || "unnamed project"}
              {props.li_units ? ` · ${props.li_units} low-income units` : ""}
              {props.year_placed_in_service ? ` · placed in service ${props.year_placed_in_service}` : ""}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
