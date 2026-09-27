"use client"

import { useEffect, useRef, useState } from 'react'
import { Map as GLMap, Marker, NavigationControl, ScaleControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { geometryCenter, rectangleAt } from '../lib/plannerGeometry.js'
import { configureMapWorkers } from '../lib/maplibreSetup.js'

const empty = () => ({ type: 'FeatureCollection', features: [] })
const fc = features => ({ type: 'FeatureCollection', features })

export default function PlannerMap({ parcels, neighborhoods, stops, selected, option, slot, stop, proposed, additionalDepartures, view3d, onSelect, onStop, tool }) {
  const container = useRef(null), mapRef = useRef(null), callbacks = useRef({ onSelect, onStop, tool })
  const [ready, setReady] = useState(false), [error, setError] = useState(null)
  const lastPin = useRef(null)
  const marker = useRef(null)
  callbacks.current = { onSelect, onStop, tool }

  useEffect(() => {
    let map
    try {
      configureMapWorkers()
      map = new GLMap({ container: container.current, center: [-79.9437, 40.4113], zoom: 17.5, pitch: 55, bearing: -25, attributionControl: true,
        style: { version: 8, sources: { basemap: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } }, layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#dde5df' } },
          { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-saturation': -.7, 'raster-opacity': .75 } },
        ] },
      })
    } catch { setError('3D rendering is unavailable on this device. The scenario controls and comparison still work.'); return }
    mapRef.current = map
    map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.on('error', event => {
      if (/WebGL|Worker failed/.test(event.error?.message || '')) setError('Map rendering is unavailable. Reload to restore the map; the scenario controls and comparison remain available.')
    })
    map.on('load', () => {
      map.addSource('parcels', { type: 'geojson', data: parcels, promoteId: 'pin' })
      map.addSource('districts', { type: 'geojson', data: neighborhoods })
      map.addSource('stops', { type: 'geojson', data: stops || empty() })
      for (const id of ['building', 'selected', 'service']) map.addSource(id, { type: 'geojson', data: empty() })
      map.addLayer({ id: 'district-line', type: 'line', source: 'districts', paint: { 'line-color': '#78978c', 'line-width': 2, 'line-dasharray': [3, 3] } })
      map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcels', paint: { 'fill-color': ['case', ['get', 'vacant'], '#81b99c', '#e6e9e3'], 'fill-opacity': .28 } })
      map.addLayer({ id: 'parcel-line', type: 'line', source: 'parcels', minzoom: 14, paint: { 'line-color': '#788f84', 'line-width': .6, 'line-opacity': .55 } })
      map.addLayer({ id: 'selected-fill', type: 'fill', source: 'selected', paint: { 'fill-color': '#2b8061', 'fill-opacity': .12 } })
      map.addLayer({ id: 'selected-line', type: 'line', source: 'selected', paint: { 'line-color': '#23694f', 'line-width': 2.5 } })
      map.addLayer({ id: 'service-link', type: 'line', source: 'service', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#386da3', 'line-width': 2.5, 'line-dasharray': [2, 2] } })
      map.addLayer({ id: 'stops-points', type: 'circle', source: 'stops', minzoom: 14, paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#587693', 'circle-stroke-width': 1.5 } })
      map.addLayer({ id: 'service-zone', type: 'fill-extrusion', source: 'service', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-extrusion-height': 1.5, 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-opacity': .95 } })
      map.addLayer({ id: 'building-fill', type: 'fill-extrusion', source: 'building', paint: { 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-opacity': .88 } })
      map.addLayer({ id: 'building-outline', type: 'line', source: 'building', paint: { 'line-color': '#243e33', 'line-width': 1.5 } })
      map.on('click', event => {
        const stopHit = map.queryRenderedFeatures(event.point, { layers: ['stops-points'] })[0]
        if (stopHit && callbacks.current.tool === 'service') { callbacks.current.onStop(String(stopHit.properties.stop_id)); return }
        const hit = map.queryRenderedFeatures(event.point, { layers: ['parcel-fill'] })[0]
        if (hit) callbacks.current.onSelect(hit.properties.pin)
      })
      map.on('mouseenter', 'parcel-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'parcel-fill', () => { map.getCanvas().style.cursor = '' })
      setReady(true)
    })
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container.current)
    return () => { observer.disconnect(); marker.current?.remove(); marker.current = null; map.remove(); mapRef.current = null }
  }, [parcels, neighborhoods, stops])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !selected) return
    map.getSource('selected').setData(fc([{ ...selected, properties: { pin: selected.properties.pin } }]))
    const point = geometryCenter(selected.geometry)
    if (point) {
      marker.current?.remove()
      const element = document.createElement('div')
      element.className = 'planner-site-marker'
      element.textContent = `${selected.properties.address || selected.properties.pin} · ${selected.properties.zoning_code || '?'}`
      marker.current = new Marker({ element, anchor: 'bottom', offset: [0, -35] }).setLngLat(point).addTo(map)
    }
    if (lastPin.current !== selected.properties.pin && point) {
      lastPin.current = selected.properties.pin
      map.easeTo({ center: point, zoom: 17.6, duration: 650 })
    }
  }, [ready, selected])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    const building = option?.massing.geometry ? [{ type: 'Feature', geometry: option.massing.geometry, properties: { height: option.height, color: !option.massing.fits ? '#c96961' : slot === 'A' ? '#50856e' : '#cc9948' } }] : []
    mapRef.current.getSource('building').setData(fc(building))
  }, [ready, option, slot])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    const point = selected ? geometryCenter(selected.geometry) : null
    mapRef.current.getSource('service').setData(stop && point ? fc([
      { type: 'Feature', properties: { color: proposed && additionalDepartures > 0 ? '#2d86c2' : '#587693' }, geometry: rectangleAt(stop.coordinates, 12, 4) },
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [point, stop.coordinates] } },
    ]) : empty())
  }, [ready, stop, selected, proposed, additionalDepartures])

  useEffect(() => { if (ready) mapRef.current?.easeTo({ pitch: view3d ? 55 : 0, bearing: view3d ? -25 : 0, duration: 350 }) }, [ready, view3d])

  return <><div ref={container} className="planner-map" aria-label="3D parcel planning map. Select a parcel on the map or use the address search." />{error && <div className="planner-map-error" role="alert">{error}</div>}</>
}
