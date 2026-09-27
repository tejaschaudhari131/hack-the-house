"use client"

import { endpointCoordinates } from '../lib/networkRouting.js'
import { PITTSBURGH_BOUNDS } from '../lib/pittsburgh.js'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Map as GLMap, Marker, Popup, NavigationControl, ScaleControl } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { geometryCenter, rectangleAt } from '../lib/plannerGeometry.js'
import { configureMapWorkers } from '../lib/maplibreSetup.js'
import { haversineMeters } from '../lib/geo.js'
import { simulatedColor } from '../lib/buildingUses.js'
import { buildingHeightDescription, buildingHeightSource } from '../lib/buildingHeights.js'
import { DETAIL_ZOOM, spatialIndex } from '../lib/studioData.js'

const empty = () => ({ type: 'FeatureCollection', features: [] })
const fc = features => ({ type: 'FeatureCollection', features })
// Official neighborhood union extent: navigation bounds, not a polygon mask.


export default function PlannerMap({ parcels, neighborhoods, stops, existingBuildings, showExisting, selected, buildingPreview, stop, proposed, additionalDepartures, view3d, onSelect, onStop, tool, placing, onPlace, onHover, placedBuildings = [], network, roadsFile, networkResult, reservations, connections, routes = [], drawing, draftNode, onDraw, discoveryPins = [], onViewport }) {
  const container = useRef(null), mapRef = useRef(null), callbacks = useRef({ onSelect, onStop, tool, placing, onPlace })
  const [ready, setReady] = useState(false), [error, setError] = useState(null)
  const [viewport, setViewport] = useState(null)
  const parcelIndex = useMemo(() => spatialIndex(parcels.features), [parcels])
  const buildingIndex = useMemo(() => spatialIndex(existingBuildings?.features || []), [existingBuildings])
  const visibleParcels = useMemo(() => viewport?.zoom >= DETAIL_ZOOM ? parcelIndex.query(viewport.bounds) : [], [viewport, parcelIndex])
  const visibleBuildings = useMemo(() => viewport?.zoom >= DETAIL_ZOOM && showExisting ? buildingIndex.query(viewport.bounds) : [], [viewport, buildingIndex, showExisting])
  const lastPin = useRef(null)
  const marker = useRef(null)
  const popup = useRef(null)
  const networkDisplayed = useRef(false)
  callbacks.current = { onSelect, onStop, tool, placing, onPlace, onHover, drawing, onDraw, onViewport }

  useEffect(() => {
    let map
    try {
      configureMapWorkers()
      map = new GLMap({ container: container.current, center: geometryCenter(selected.geometry), zoom: 17.6, pitch: 55, bearing: -25, attributionControl: true,
        maxBounds: PITTSBURGH_BOUNDS, renderWorldCopies: false,
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
      map.addSource('parcels', { type: 'geojson', data: empty(), promoteId: 'pin' })
      map.addSource('districts', { type: 'geojson', data: neighborhoods })
      map.addSource('stops', { type: 'geojson', data: stops || empty() })
      map.addSource('existing-buildings', { type: 'geojson', data: empty(), promoteId: 'id', attribution: '<a href="https://mapservices.pasda.psu.edu/server/rest/services/pasda/AlleghenyCounty/MapServer/11">Allegheny County / PASDA buildings</a> · Heights: County / <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors, ODbL</a>' })
      for (const id of ['discovery', 'placed-buildings', 'building', 'selected', 'service', 'network-nodes', 'parks', 'reservations', 'connections', 'saved-routes', 'draft-node']) map.addSource(id, { type: 'geojson', data: empty() })
      map.addSource('walking-network', { type: 'geojson', data: empty(), attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors · ODbL</a>' })
      map.addLayer({ id: 'district-line', type: 'line', source: 'districts', paint: { 'line-color': '#78978c', 'line-width': 2, 'line-dasharray': [3, 3] } })
      map.addLayer({ id: 'district-fill', type: 'fill', source: 'districts', maxzoom: DETAIL_ZOOM, paint: { 'fill-color': '#78978c', 'fill-opacity': .12 } }, 'district-line')
      map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcels', minzoom: DETAIL_ZOOM, paint: { 'fill-color': ['case', ['get', 'vacant'], '#81b99c', '#e6e9e3'], 'fill-opacity': .28 } })
      map.addLayer({ id: 'parcel-line', type: 'line', source: 'parcels', minzoom: 14, paint: { 'line-color': '#788f84', 'line-width': .6, 'line-opacity': .55 } })
      map.addLayer({ id: 'discovery-outline', type: 'line', source: 'discovery', paint: { 'line-color': '#0891b2', 'line-width': 2 } })
      map.addLayer({ id: 'selected-fill', type: 'fill', source: 'selected', paint: { 'fill-color': '#2b8061', 'fill-opacity': .12 } })
      map.addLayer({ id: 'selected-line', type: 'line', source: 'selected', paint: { 'line-color': '#23694f', 'line-width': 2.5 } })
      map.addLayer({ id: 'park-fill', type: 'fill', source: 'parks', paint: { 'fill-color': '#87af67', 'fill-opacity': .35 } })
      map.addLayer({ id: 'network-line', type: 'line', source: 'walking-network', minzoom: 14, layout: { visibility: 'none' }, paint: { 'line-color': '#598daf', 'line-width': 2, 'line-opacity': .7 } })
      map.addLayer({ id: 'network-nodes', type: 'circle', source: 'network-nodes', minzoom: 16, paint: { 'circle-color': '#fff', 'circle-radius': 3, 'circle-stroke-color': '#467a9c', 'circle-stroke-width': 1.5 } })
      map.addLayer({ id: 'reservation-fill', type: 'fill', source: 'reservations', paint: { 'fill-color': ['case', ['==', ['get', 'kind'], 'park'], '#70aa53', '#bd8d55'], 'fill-opacity': .6 } })
      map.addLayer({ id: 'connection-line', type: 'line', source: 'connections', paint: { 'line-color': '#a16736', 'line-width': 4 } })
      map.addLayer({ id: 'saved-route-line', type: 'line', source: 'saved-routes', paint: { 'line-color': '#137bd1', 'line-width': 5 } })
      map.addLayer({ id: 'draft-point', type: 'circle', source: 'draft-node', paint: { 'circle-color': '#f3b45b', 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
      map.addLayer({ id: 'existing-buildings-overview', type: 'fill', source: 'existing-buildings', minzoom: DETAIL_ZOOM, maxzoom: 16, paint: { 'fill-color': ['coalesce', ['get', 'use_color'], '#cbd5e1'], 'fill-opacity': .8 } })
      map.addLayer({ id: 'existing-buildings-fill', type: 'fill-extrusion', source: 'existing-buildings', minzoom: 16, paint: { 'fill-extrusion-height': ['get', 'height_m'], 'fill-extrusion-color': ['coalesce', ['get', 'use_color'], '#cbd5e1'], 'fill-extrusion-opacity': .8 } })
      map.addLayer({ id: 'service-link', type: 'line', source: 'service', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#386da3', 'line-width': 3 } })
      map.addLayer({ id: 'stops-points', type: 'circle', source: 'stops', minzoom: 14, paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#587693', 'circle-stroke-width': 1.5 } })
      map.addLayer({ id: 'service-zone', type: 'fill-extrusion', source: 'service', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-extrusion-height': 1.5, 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-opacity': .95 } })
      map.addLayer({ id: 'placed-buildings-fill', type: 'fill-extrusion', source: 'placed-buildings', paint: { 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-opacity': .96 } })
      map.addLayer({ id: 'placed-buildings-outline', type: 'line', source: 'placed-buildings', paint: { 'line-color': ['case', ['get', 'valid'], '#fff', '#dc2626'], 'line-width': 2, 'line-dasharray': [2, 1] } })
      map.addLayer({ id: 'building-fill', type: 'fill-extrusion', source: 'building', paint: { 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-opacity': .6 } })
      map.addLayer({ id: 'building-outline', type: 'line', source: 'building', paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 1] } })
      for (const id of ['discovery-outline', 'selected-fill', 'selected-line', 'park-fill', 'reservation-fill', 'connection-line', 'saved-route-line', 'draft-point', 'service-link', 'service-zone', 'placed-buildings-fill', 'placed-buildings-outline', 'building-fill', 'building-outline']) map.setLayerZoomRange(id, DETAIL_ZOOM, 24)
      let hoverFrame = null
      map.on('mousemove', event => {
        if (!callbacks.current.placing || hoverFrame) return
        hoverFrame = requestAnimationFrame(() => { hoverFrame = null; callbacks.current.onHover?.([event.lngLat.lng, event.lngLat.lat]) })
      })
      map.on('click', event => {
        if (map.getZoom() < DETAIL_ZOOM) return
        if (callbacks.current.drawing) { callbacks.current.onDraw([event.lngLat.lng, event.lngLat.lat]); return }
        if (callbacks.current.placing) { callbacks.current.onPlace([event.lngLat.lng, event.lngLat.lat]); return }
        const stopHit = map.queryRenderedFeatures(event.point, { layers: ['stops-points'] })[0]
        if (stopHit && callbacks.current.tool === 'service') { callbacks.current.onStop(String(stopHit.properties.stop_id)); return }
        const buildingHit = map.queryRenderedFeatures(event.point, { layers: ['existing-buildings-fill', 'existing-buildings-overview'] })[0]
        if (buildingHit && !map.queryRenderedFeatures(event.point, { layers: ['building-fill'] }).length) {
          const p = buildingHit.properties
          const content = document.createElement('div')
          content.className = 'building-popup'
          const title = document.createElement('strong'); title.textContent = p.use_label || 'Use unknown'
          const detail = document.createElement('p'); detail.textContent = buildingHeightDescription(p)
          const note = document.createElement('small'); note.textContent = `${p.recorded_land_use || 'Unknown use'} · ${p.use_evidence || 'Occupancy unverified.'}`
          content.append(title, detail, note)
          const source = buildingHeightSource(p)
          if (source) {
            const link = document.createElement('a'); link.href = source; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'View mapped height source ↗'
            content.append(document.createElement('br'), link)
          }
          popup.current?.remove()
          popup.current = new Popup({ maxWidth: '260px' }).setLngLat(event.lngLat).setDOMContent(content).addTo(map)
          if (p.pin) callbacks.current.onSelect(p.pin)
          return
        }
        const hit = map.queryRenderedFeatures(event.point, { layers: ['parcel-fill'] })[0]
        if (hit) callbacks.current.onSelect(hit.properties.pin)
      })
      map.on('mouseenter', 'parcel-fill', () => { map.getCanvas().style.cursor = callbacks.current.placing || callbacks.current.drawing ? 'crosshair' : 'pointer' })
      map.on('mouseleave', 'parcel-fill', () => { map.getCanvas().style.cursor = callbacks.current.placing || callbacks.current.drawing ? 'crosshair' : '' })
      publishViewport()
      setReady(true)
    })
    let viewportTimer = null
    const publishViewport = () => {
      clearTimeout(viewportTimer); viewportTimer = null
      const bounds = map.getBounds(), dx = (bounds.getEast() - bounds.getWest()) * .35, dy = (bounds.getNorth() - bounds.getSouth()) * .35
      const next = { zoom: map.getZoom(), bounds: [bounds.getWest() - dx, bounds.getSouth() - dy, bounds.getEast() + dx, bounds.getNorth() + dy] }
      setViewport(next); callbacks.current.onViewport?.(next)
      if (marker.current) marker.current.getElement().hidden = next.zoom < DETAIL_ZOOM
      if (next.zoom < DETAIL_ZOOM) popup.current?.remove()
    }
    // A buffered view and throttled updates keep panning responsive without
    // rebuilding GeoJSON or requesting neighborhoods on every animation frame.
    map.on('move', () => { viewportTimer ??= setTimeout(publishViewport, 150) })
    map.on('moveend', publishViewport)
    map.on('resize', publishViewport)
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container.current)
    return () => { clearTimeout(viewportTimer); observer.disconnect(); marker.current?.remove(); marker.current = null; popup.current?.remove(); map.remove(); mapRef.current = null; networkDisplayed.current = false }
  }, [neighborhoods, stops])

  useEffect(() => {
    if (!ready || !viewport) return
    const pins = new Set(discoveryPins)
    const map = mapRef.current
    map.getSource('parcels').setData(fc(visibleParcels))
    map.getSource('discovery').setData(fc(visibleParcels.filter(f => pins.has(f.properties.pin))))
    map.getSource('existing-buildings').setData(fc(visibleBuildings))
  }, [ready, visibleParcels, visibleBuildings, discoveryPins])
  useEffect(() => {
    if (!ready) return
    mapRef.current.setLayoutProperty('existing-buildings-fill', 'visibility', showExisting ? 'visible' : 'none')
    mapRef.current.setLayoutProperty('existing-buildings-overview', 'visibility', showExisting ? 'visible' : 'none')
    if (!showExisting) popup.current?.remove()
  }, [ready, showExisting])
  useEffect(() => { if (ready) mapRef.current.getCanvas().style.cursor = placing || drawing ? 'crosshair' : '' }, [ready, placing, drawing])

  useEffect(() => {
    if (!ready) return
    const map = mapRef.current, visible = tool === 'network', point = selected && geometryCenter(selected.geometry)
    if (visible && roadsFile && networkDisplayed.current !== roadsFile) { map.getSource('walking-network').setData(`/data/studio/${roadsFile}`); networkDisplayed.current = roadsFile }
    map.setLayoutProperty('network-line', 'visibility', visible ? 'visible' : 'none')
    map.getSource('network-nodes').setData(visible && network && point ? fc(network.nodes.flatMap((coordinates, id) => network.ground[id] && haversineMeters(...point, ...coordinates) < 600 ? [{ type: 'Feature', properties: { node: id }, geometry: { type: 'Point', coordinates } }] : [])) : empty())
    map.getSource('parks').setData(visible && network ? fc(network.parks.map(p => ({ type: 'Feature', properties: { name: p.name }, geometry: p.geometry }))) : empty())
  }, [ready, tool, network, roadsFile, selected])

  useEffect(() => {
    if (!ready) return
    mapRef.current.getSource('reservations').setData(proposed ? fc(reservations || []) : empty())
    mapRef.current.getSource('connections').setData(proposed && network ? fc((connections || []).filter(c => endpointCoordinates(network,c.from) && endpointCoordinates(network,c.to)).map(c => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [endpointCoordinates(network,c.from), endpointCoordinates(network,c.to)] } }))) : empty())
    mapRef.current.getSource('saved-routes').setData(fc(routes.map(r => ({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:r.coordinates}}))))
  }, [ready, proposed, reservations, connections, routes, network])
  useEffect(() => {
    if (ready) mapRef.current.getSource('draft-node').setData(drawing && network && draftNode !== null ? fc([{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: draftNode.coordinates } }]) : empty())
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
  }, [ready, selected])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    const building = tool !== 'sites' && buildingPreview ? [buildingPreview] : []
    mapRef.current.getSource('building').setData(fc(building))
  }, [ready, buildingPreview, tool])

  useEffect(() => {
    if (!ready) return
    mapRef.current.getSource('placed-buildings').setData(fc(placedBuildings.filter(b => b.massing.geometry).map(b => ({ type: 'Feature', geometry: b.massing.geometry, properties: { id: b.id, pin: b.pin, height: b.height, color: simulatedColor(b.typeId), valid: b.eligible } }))))
  }, [ready, placedBuildings])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    const point = selected ? geometryCenter(selected.geometry) : null
    mapRef.current.getSource('service').setData(stop && point ? fc([
      { type: 'Feature', properties: { color: proposed && additionalDepartures > 0 ? '#2d86c2' : '#587693' }, geometry: rectangleAt(stop.coordinates, 12, 4) },
      ...(networkResult?.route ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: networkResult.route } }] : []),
    ]) : empty())
  }, [ready, stop, selected, proposed, additionalDepartures, networkResult])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    const point = selected && geometryCenter(selected.geometry)
    const newSite = point && lastPin.current !== selected.properties.pin
    // A second easeTo cancels the first: apply the complete camera destination
    // together, including on direct parcel links and rapid tool/site switches.
    mapRef.current.easeTo({
      ...(point ? { center: point } : {}),
      ...(newSite ? { zoom: 17.6 } : {}),
      pitch: view3d ? 55 : 0, bearing: view3d ? -25 : 0,
      duration: newSite ? 650 : 350,
    })
    if (point) lastPin.current = selected.properties.pin
  }, [ready, selected, view3d])

  return <><div ref={container} className="planner-map" data-detail-level={!viewport || viewport.zoom < DETAIL_ZOOM ? 'overview' : viewport.zoom < 16 ? 'footprints' : '3d'} data-visible-parcels={visibleParcels.length} data-visible-buildings={visibleBuildings.length} aria-label="3D parcel planning map. Select a parcel on the map or use the address search." />{error && <div className="planner-map-error" role="alert">{error}</div>}</>
}
