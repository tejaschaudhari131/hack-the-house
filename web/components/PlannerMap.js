"use client"

import { useEffect, useRef, useState } from 'react'
import { Map as GLMap, Marker, Popup, NavigationControl, ScaleControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { geometryCenter, rectangleAt } from '../lib/plannerGeometry.js'
import { configureMapWorkers } from '../lib/maplibreSetup.js'
import { haversineMeters } from '../lib/geo.js'

const empty = () => ({ type: 'FeatureCollection', features: [] })
const fc = features => ({ type: 'FeatureCollection', features })

export default function PlannerMap({ parcels, neighborhoods, stops, existingBuildings, showExisting, selected, option, slot, stop, proposed, additionalDepartures, view3d, onSelect, onStop, tool, placing, onPlace, network, networkResult, reservations, connections, drawing, draftNode, onDraw }) {
  const container = useRef(null), mapRef = useRef(null), callbacks = useRef({ onSelect, onStop, tool, placing, onPlace })
  const [ready, setReady] = useState(false), [error, setError] = useState(null)
  const lastPin = useRef(null)
  const marker = useRef(null)
  const popup = useRef(null)
  callbacks.current = { onSelect, onStop, tool, placing, onPlace, drawing, onDraw }

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
      map.addSource('existing-buildings', { type: 'geojson', data: empty(), promoteId: 'id', attribution: '<a href="https://mapservices.pasda.psu.edu/server/rest/services/pasda/AlleghenyCounty/MapServer/11">Allegheny County / PASDA buildings</a>' })
      for (const id of ['building', 'selected', 'service', 'network-nodes', 'parks', 'reservations', 'connections', 'draft-node']) map.addSource(id, { type: 'geojson', data: empty() })
      map.addSource('walking-network', { type: 'geojson', data: '/data/walking-network.geojson', attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors · ODbL</a>' })
      map.addLayer({ id: 'district-line', type: 'line', source: 'districts', paint: { 'line-color': '#78978c', 'line-width': 2, 'line-dasharray': [3, 3] } })
      map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcels', paint: { 'fill-color': ['case', ['get', 'vacant'], '#81b99c', '#e6e9e3'], 'fill-opacity': .28 } })
      map.addLayer({ id: 'parcel-line', type: 'line', source: 'parcels', minzoom: 14, paint: { 'line-color': '#788f84', 'line-width': .6, 'line-opacity': .55 } })
      map.addLayer({ id: 'selected-fill', type: 'fill', source: 'selected', paint: { 'fill-color': '#2b8061', 'fill-opacity': .12 } })
      map.addLayer({ id: 'selected-line', type: 'line', source: 'selected', paint: { 'line-color': '#23694f', 'line-width': 2.5 } })
      map.addLayer({ id: 'park-fill', type: 'fill', source: 'parks', paint: { 'fill-color': '#87af67', 'fill-opacity': .35 } })
      map.addLayer({ id: 'network-line', type: 'line', source: 'walking-network', minzoom: 14, layout: { visibility: 'none' }, paint: { 'line-color': '#598daf', 'line-width': 2, 'line-opacity': .7 } })
      map.addLayer({ id: 'network-nodes', type: 'circle', source: 'network-nodes', minzoom: 16, paint: { 'circle-color': '#fff', 'circle-radius': 3, 'circle-stroke-color': '#467a9c', 'circle-stroke-width': 1.5 } })
      map.addLayer({ id: 'reservation-fill', type: 'fill', source: 'reservations', paint: { 'fill-color': ['case', ['==', ['get', 'kind'], 'park'], '#70aa53', '#bd8d55'], 'fill-opacity': .6 } })
      map.addLayer({ id: 'connection-line', type: 'line', source: 'connections', paint: { 'line-color': '#a16736', 'line-width': 4 } })
      map.addLayer({ id: 'draft-point', type: 'circle', source: 'draft-node', paint: { 'circle-color': '#f3b45b', 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      map.addLayer({ id: 'existing-buildings-fill', type: 'fill-extrusion', source: 'existing-buildings', minzoom: 14, paint: { 'fill-extrusion-height': ['get', 'height_m'], 'fill-extrusion-color': ['case', ['==', ['get', 'height_method'], 'stories_estimate'], '#aab4af', '#c1c5bd'], 'fill-extrusion-opacity': .8 } })
      map.addLayer({ id: 'service-link', type: 'line', source: 'service', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#386da3', 'line-width': 3 } })
      map.addLayer({ id: 'stops-points', type: 'circle', source: 'stops', minzoom: 14, paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#587693', 'circle-stroke-width': 1.5 } })
      map.addLayer({ id: 'service-zone', type: 'fill-extrusion', source: 'service', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-extrusion-height': 1.5, 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-opacity': .95 } })
      map.addLayer({ id: 'building-fill', type: 'fill-extrusion', source: 'building', paint: { 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-opacity': .88 } })
      map.addLayer({ id: 'building-outline', type: 'line', source: 'building', paint: { 'line-color': '#243e33', 'line-width': 1.5 } })
      map.on('click', event => {
        if (callbacks.current.drawing) { callbacks.current.onDraw([event.lngLat.lng, event.lngLat.lat]); return }
        if (callbacks.current.placing) { callbacks.current.onPlace([event.lngLat.lng, event.lngLat.lat]); return }
        const stopHit = map.queryRenderedFeatures(event.point, { layers: ['stops-points'] })[0]
        if (stopHit && callbacks.current.tool === 'service') { callbacks.current.onStop(String(stopHit.properties.stop_id)); return }
        const buildingHit = map.queryRenderedFeatures(event.point, { layers: ['existing-buildings-fill'] })[0]
        if (buildingHit && !map.queryRenderedFeatures(event.point, { layers: ['building-fill'] }).length) {
          const p = buildingHit.properties
          const content = document.createElement('div')
          content.className = 'building-popup'
          const title = document.createElement('strong'); title.textContent = 'Recorded building footprint'
          const detail = document.createElement('p'); detail.textContent = p.height_method === 'stories_estimate' ? `${p.height_m} m estimated from ${p.stories} recorded stories (3 m/story + 1.5 m assumed roof).` : '9 m placeholder. No usable building-height evidence is available.'
          const note = document.createElement('small'); note.textContent = 'County footprint · height is not measured · occupancy unverified'
          content.append(title, detail, note)
          popup.current?.remove()
          popup.current = new Popup({ maxWidth: '260px' }).setLngLat(event.lngLat).setDOMContent(content).addTo(map)
          if (p.pin) callbacks.current.onSelect(p.pin)
          return
        }
        const hit = map.queryRenderedFeatures(event.point, { layers: ['parcel-fill'] })[0]
        if (hit) callbacks.current.onSelect(hit.properties.pin)
      })
      map.on('mouseenter', 'parcel-fill', () => { map.getCanvas().style.cursor = callbacks.current.placing ? 'crosshair' : 'pointer' })
      map.on('mouseleave', 'parcel-fill', () => { map.getCanvas().style.cursor = callbacks.current.placing ? 'crosshair' : '' })
      setReady(true)
    })
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container.current)
    return () => { observer.disconnect(); marker.current?.remove(); marker.current = null; popup.current?.remove(); map.remove(); mapRef.current = null }
  }, [parcels, neighborhoods, stops])

  useEffect(() => { if (ready) mapRef.current.getSource('existing-buildings').setData(existingBuildings || empty()) }, [ready, existingBuildings])
  useEffect(() => {
    if (!ready) return
    mapRef.current.setLayoutProperty('existing-buildings-fill', 'visibility', showExisting ? 'visible' : 'none')
    if (!showExisting) popup.current?.remove()
  }, [ready, showExisting])
  useEffect(() => { if (ready) mapRef.current.getCanvas().style.cursor = placing || drawing ? 'crosshair' : '' }, [ready, placing, drawing])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current, visible = tool === 'network', point = selected && geometryCenter(selected.geometry)
    map.setLayoutProperty('network-line', 'visibility', visible ? 'visible' : 'none')
    map.getSource('network-nodes').setData(visible && network && point ? fc(network.nodes.flatMap((coordinates, id) => network.ground[id] && haversineMeters(...point, ...coordinates) < 600 ? [{ type: 'Feature', properties: { node: id }, geometry: { type: 'Point', coordinates } }] : [])) : empty())
    map.getSource('parks').setData(visible && network ? fc(network.parks.map(p => ({ type: 'Feature', properties: { name: p.name }, geometry: p.geometry }))) : empty())
  }, [ready, tool, network, selected])

  useEffect(() => {
    if (!ready) return
    mapRef.current.getSource('reservations').setData(proposed ? fc(reservations || []) : empty())
    mapRef.current.getSource('connections').setData(proposed && network ? fc((connections || []).filter(c => network.nodes[c.from] && network.nodes[c.to]).map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [network.nodes[c.from], network.nodes[c.to]] } }))) : empty())
  }, [ready, proposed, reservations, connections, network])
  useEffect(() => {
    if (ready) mapRef.current.getSource('draft-node').setData(drawing && network && draftNode !== null ? fc([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: network.nodes[draftNode] } }]) : empty())
  }, [ready, drawing, network, draftNode])

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
    const building = option?.massing.geometry ? [{ type: 'Feature', geometry: option.massing.geometry, properties: { height: option.height, color: !option.massing.fits || option.massing.collisions > 0 ? '#c96961' : slot === 'A' ? '#50856e' : '#cc9948' } }] : []
    mapRef.current.getSource('building').setData(fc(building))
  }, [ready, option, slot])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    const point = selected ? geometryCenter(selected.geometry) : null
    mapRef.current.getSource('service').setData(stop && point ? fc([
      { type: 'Feature', properties: { color: proposed && additionalDepartures > 0 ? '#2d86c2' : '#587693' }, geometry: rectangleAt(stop.coordinates, 12, 4) },
      ...(networkResult?.route ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: networkResult.route } }] : []),
    ]) : empty())
  }, [ready, stop, selected, proposed, additionalDepartures, networkResult])

  useEffect(() => { if (ready) mapRef.current?.easeTo({ pitch: view3d ? 55 : 0, bearing: view3d ? -25 : 0, duration: 350 }) }, [ready, view3d])

  return <><div ref={container} className="planner-map" aria-label="3D parcel planning map. Select a parcel on the map or use the address search." />{error && <div className="planner-map-error" role="alert">{error}</div>}</>
}
