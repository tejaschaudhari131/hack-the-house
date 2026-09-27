"use client"

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { BUILDINGS, BUILDING_IDS } from '../lib/buildings.js'
import { buildingHeightCoverage } from '../lib/buildingHeights.js'
import { slimParcels, geometryBounds, placementAt, geometriesOverlap, rectangleAt, fitMassing } from '../lib/plannerGeometry.js'
import { DETAIL_ZOOM, mergeNeighborhoods, spatialIndex, containsBounds } from '../lib/studioData.js'
import useNeighborhoodData, { fetchNeighborhood } from './useNeighborhoodData.js'
import { nearestNode, validateConnection, validatePark, connectionGeometry, prepareNetwork } from '../lib/networkModel.js'
import InfrastructurePanel from './InfrastructurePanel.js'
import RecommendationAudit from './RecommendationAudit.js'
import StudioPriorities from './StudioPriorities.js'
import StudioSites from './StudioSites.js'
import { studioSites } from '../lib/studioPresentation.js'
import HousingComparison from './HousingComparison.js'
import TitleNineChecks, { ZoningInputs } from './TitleNine.js'
import { evaluateTitleNine, housingSpec } from '../lib/titleNine.js'
import StudioWorkspace from './StudioWorkspace.js'
import MapLegend from './MapLegend.js'
import StudioTour from './StudioTour.js'
import { draftPreview } from '../lib/draftPreview.js'
import { evaluatePlanner, nearbyStops, preferredStop, round } from '../lib/plannerModel.js'
import { EXAMPLES, MODEL_VERSION, PLANNER_FACTORS, MASSING_DEFAULTS, initialStudioScenario, historyFor, scenarioReducer, scenarioExport } from '../lib/plannerState.js'

const PlannerMap = dynamic(() => import('./PlannerMap.js'), { ssr: false, loading: () => <div className="planner-loading">Preparing the map…</div> })
const fmt = (value, suffix = '') => typeof value === 'number' && Number.isFinite(value) ? `${round(value).toLocaleString()}${suffix}` : 'Unknown'
const cash = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

function Icon({ name, size = 20 }) {
  const paths = {
    building: <><path d="M4 21V8l8-5 8 5v13M2 21h20M9 21v-6h6v6"/><path d="M8 9h1m6 0h1M8 12h1m6 0h1"/></>,
    bus: <><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1"/></>,
    chart: <><path d="M4 3v17h17M8 15V9m5 6V5m5 10v-4"/></>,
    network: <><path d="M4 20 9 4m6 0 5 16M12 5v3m0 4v3m0 4v2"/></>,
    layers: <><path d="m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5"/></>,
    undo: <><path d="M8 4 3 9l5 5M3 9h10a7 7 0 0 1 0 14"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    pin: <><path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.building}</svg>
}

function Numeric({ label, value, onChange, min = 0, max = 100000, step = 1, hint, nullable = false }) {
  const [draft, setDraft] = useState(value ?? '')
  const dirty = useRef(false)
  useEffect(() => { setDraft(value ?? ''); dirty.current = false }, [value])
  function commit() {
    if (!dirty.current) return
    dirty.current = false
    if (draft === '' && nullable) { onChange(null); return }
    const n = Number(draft)
    if (draft !== '' && Number.isFinite(n)) { const next = Math.min(max, Math.max(min, n)); setDraft(next); onChange(next) }
    else setDraft(value ?? '')
  }
  return <label className="planner-field"><span>{label}</span><input type="number" min={min} max={max} step={step} value={draft} onChange={e => { dirty.current = true; setDraft(e.target.value) }} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} placeholder={nullable ? 'Unknown' : undefined} />{hint && <small>{hint}</small>}</label>
}

function useEvaluation(input, network) {
  const worker = useRef(null), latest = useRef(0), current = useRef(input)
  const networkRef = useRef(network), fallback = useRef(null)
  networkRef.current = network
  function compute(input) {
    if (fallback.current?.source !== networkRef.current) fallback.current = { source: networkRef.current, prepared: networkRef.current ? prepareNetwork(networkRef.current) : null }
    return evaluatePlanner({ ...input, networkContext: fallback.current.prepared })
  }
  const [state, setState] = useState({ result: null, pending: true, error: null })
  current.current = input
  useEffect(() => {
    let w
    try {
      w = new Worker(new URL('../workers/planner.worker.js', import.meta.url), { type: 'module' })
      worker.current = w
      w.onmessage = ({ data }) => {
        if (data.revision !== latest.current) return
        setState({ result: data.result || null, pending: false, error: data.error || null, pin: data.pin, input: current.current })
      }
      w.onerror = () => {
        w.terminate(); worker.current = null
        try { setState({ result: compute(current.current), pending: false, error: null, pin: current.current.feature.properties.pin, input: current.current }) }
        catch (error) { setState({ result: null, pending: false, error: error.message }) }
      }
    } catch { worker.current = null }
    return () => { w?.terminate(); worker.current = null }
  }, [])
  useEffect(() => { worker.current?.postMessage({ type: 'network', network }) }, [network])
  useEffect(() => {
    const revision = ++latest.current
    setState(old => ({ ...old, pending: true, error: null }))
    const timer = setTimeout(() => {
      if (worker.current) worker.current.postMessage({ revision, input })
      else {
        try { setState({ result: compute(input), pending: false, error: null, pin: input.feature.properties.pin, input }) }
        catch (error) { setState({ result: null, pending: false, error: error.message }) }
      }
    }, 60)
    return () => clearTimeout(timer)
  }, [input, network])
  return { ...state, pending: state.pending || state.input !== input }
}

export default function Planner() {
  const [data, setData] = useState(null), [error, setError] = useState(null), [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const names = ['studio/manifest.json', 'neighborhoods.geojson', 'stops.geojson', 'zoning.json', 'summary.json', 'existing-buildings.sources.json']
    setError(null)
    Promise.all(names.map(async name => {
      const response = await fetch(`/data/${name}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`${name}: ${response.status}`)
      return response.json()
    })).then(async ([manifest, neighborhoods, stops, zoning, summary, buildingManifest]) => {
      const linked = new URLSearchParams(window.location.search).get('pin')
      const initialPin = manifest.catalogue.some(p => p[0] === linked) ? linked : EXAMPLES[0].pin
      const id = manifest.catalogue.find(p => p[0] === initialPin)[2]
      const chunk = await fetchNeighborhood(manifest.neighborhoods.find(n => n.id === id), controller.signal)
      if (!controller.signal.aborted) setData({ manifest, neighborhoods, stops, zoning, summary, buildingManifest, initialPin, initialChunk: { id, data: chunk } })
    })
      .catch(error => { if (error.name !== 'AbortError') setError(error.message) })
    return () => controller.abort()
  }, [attempt])
  if (!data) return <main className="planner-loading"><div className="planner-brandmark"><Icon name="building" size={30}/></div><h1>Playhouse</h1><p>{error ? `The study data could not load: ${error}` : 'Opening the Pittsburgh planning studio…'}</p>{error ? <button onClick={() => setAttempt(n => n + 1)}>Try again</button> : <span className="planner-loading-bar"/>}<small>Hazelwood + Lawrenceville · committed regional data</small></main>
  return <Studio data={data}/>
}

function Studio({ data }) {
  const { manifest, neighborhoods, stops, zoning, summary, buildingManifest, initialChunk, initialPin } = data
  const catalogue = useMemo(() => new Map(manifest.catalogue.map(([pin, address, id]) => {
    const n = manifest.neighborhoods.find(n => n.id === id)
    return [pin, { id, properties: { pin, address, neighborhood: n.name, area: n.area } }]
  })), [manifest])
  const [viewport, setViewport] = useState(null), [pendingPin, setPendingPin] = useState(null), [pendingHistory, setPendingHistory] = useState(null)
  const [showExisting, setShowExisting] = useState(true)
  const [networkData, setNetworkData] = useState(null), [networkError, setNetworkError] = useState(null), [networkAttempt, setNetworkAttempt] = useState(0)
  const network = networkData?.network || null
  useEffect(() => {
    const controller = new AbortController(); setNetworkError(null)
    Promise.all(['walking-network.json', 'walking-network.sources.json'].map(async name => {
      const response = await fetch(`/data/${name}`, { signal: controller.signal })
      if (!response.ok) throw new Error(`Network data: ${response.status}`)
      return response.json()
    })).then(([network, manifest]) => setNetworkData({ network, manifest })).catch(error => { if (error.name !== 'AbortError') setNetworkError(error.message) })
    return () => controller.abort()
  }, [networkAttempt])
  const [history, dispatch] = useReducer(scenarioReducer, null, () => {
    const feature = initialChunk.data.parcels.features.find(f => f.properties.pin === initialPin)
    return historyFor({ ...initialStudioScenario(initialPin, feature.properties, String(preferredStop(nearbyStops(feature, stops))?.stop_id || '')), accessMode: 'network' })
  })
  const scenario = history.present
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('pin', scenario.pin)
    window.history.replaceState(null, '', url)
  }, [scenario.pin])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [tool, setActiveTool] = useState('housing'), [proposed, setProposed] = useState(true), [view3d, setView3d] = useState(true)
  const requiredIds = [...new Set([scenario.pin, ...(scenario.buildings || []).map(b => b.pin)].map(pin => catalogue.get(pin).id))].sort()
  const historyTarget = pendingHistory === 'undo' ? history.past.at(-1) : pendingHistory === 'redo' ? history.future[0] : null
  const historyIds = historyTarget ? [...new Set([historyTarget.pin, ...(historyTarget.buildings || []).map(b => b.pin)].map(pin => catalogue.get(pin).id))] : []
  const extraIds = [...historyIds, ...(pendingPin ? [catalogue.get(pendingPin).id] : []), ...(tool === 'sites' ? manifest.neighborhoods.filter(n => n.area === catalogue.get(scenario.pin).properties.area).map(n => n.id) : [])]
  const loaded = useNeighborhoodData(manifest, initialChunk, requiredIds, viewport, extraIds)
  const { parcels } = loaded
  const byPin = useMemo(() => new Map(parcels.features.map(f => [f.properties.pin, f])), [parcels])
  const selected = byPin.get(scenario.pin), props = selected.properties
  const mapParcels = useMemo(() => slimParcels(loaded.mapParcels), [loaded.mapParcels])
  // Panning may load map context, but cannot change the plan's evidence or rerun its scores.
  const evidenceKey = requiredIds.map(id => `${id}:${loaded.chunks.has(id)}`).join('|')
  const context = useMemo(() => requiredIds.every(id => loaded.chunks.has(id)) ? { buildings: mergeNeighborhoods(requiredIds.map(id => loaded.chunks.get(id)), 'buildings'), manifest: buildingManifest } : null, [evidenceKey, buildingManifest])
  const planByPin = useMemo(() => new Map(mergeNeighborhoods(requiredIds.map(id => loaded.chunks.get(id)), 'parcels').features.map(f => [f.properties.pin, f])), [evidenceKey])
  const makeScenario = useCallback(pin => {
    const feature = byPin.get(pin)
    return { ...initialStudioScenario(pin, feature.properties, String(preferredStop(nearbyStops(feature, stops))?.stop_id || '')), accessMode: 'network' }
  }, [byPin, stops])
  useEffect(() => { if (pendingPin && byPin.has(pendingPin)) { select(pendingPin); setPendingPin(null) } }, [pendingPin, byPin])
  useEffect(() => {
    if (pendingHistory && historyTarget && historyIds.every(id => loaded.chunks.has(id))) {
      dispatch({ type: pendingHistory }); setPendingHistory(null)
    }
  }, [pendingHistory, historyTarget, loaded.chunks])
  const returningCamera = useRef(null)
  function setTool(value) { setActiveTool(value); setSidebarOpen(true) }
  useEffect(() => {
    if (returningCamera.current !== null) { setView3d(returningCamera.current); returningCamera.current = null; return }
    if (tool === 'housing') setView3d(true)
    else if (tool === 'network' || tool === 'service') setView3d(false)
  }, [tool])
  const [placing, setPlacing] = useState(false)
  const [hoverPoint, setHoverPoint] = useState(null)
  useEffect(() => { if (!placing) setHoverPoint(null) }, [placing])
  const [drawing, setDrawing] = useState(null), [draftNode, setDraftNode] = useState(null)
  useEffect(() => { setPlacing(false) }, [tool, scenario.pin, scenario.draft.typeId])
  useEffect(() => { setDrawing(null); setDraftNode(null) }, [tool, scenario.pin])
  useEffect(() => { if (!placing) setHoverPoint(null) }, [scenario.pin])
  const [query, setQuery] = useState(''), [notice, setNotice] = useState(''), [inspectorTab, setInspectorTab] = useState('rankings')
  const [tourRequest, setTourRequest] = useState(0)
  const tourButton = useRef(null), tourReturn = useRef(null), tourView = useRef(null)
  tourView.current = { tool, inspectorTab, sidebarOpen, view3d }
  const showTourStep = useCallback(step => {
    tourReturn.current ||= { ...tourView.current }
    setSidebarOpen(true); setActiveTool(step.tool); setInspectorTab(step.tab); setView3d(step.tool !== 'service')
  }, [])
  const finishTour = useCallback(() => {
    const previous = tourReturn.current
    if (!previous) return
    if (tourView.current.tool !== previous.tool) returningCamera.current = previous.view3d
    setActiveTool(previous.tool); setInspectorTab(previous.inspectorTab); setSidebarOpen(previous.sidebarOpen); setView3d(previous.view3d)
    tourReturn.current = null
  }, [])
  const [siteFilters, setSiteFilters] = useState({})
  const sitesLoading = manifest.neighborhoods.some(n => n.area === props.area && !loaded.chunks.has(n.id))
  const sites = useMemo(() => tool === 'sites' ? studioSites(parcels, zoning, props.area, siteFilters) : [], [tool, parcels, zoning, props.area, siteFilters])
  const discoveryPins = useMemo(() => tool === 'sites' ? sites.map(f => f.properties.pin) : [], [tool, sites])
  const nearby = useMemo(() => nearbyStops(selected, stops), [selected, stops])
  const stop = nearby.find(s => String(s.stop_id) === scenario.stopId) || null
  const buildingIndex = useMemo(() => context ? spatialIndex(context.buildings.features) : null, [context])
  const loadedBuildingIndex = useMemo(() => spatialIndex(mergeNeighborhoods([...loaded.chunks.values()], 'buildings').features), [loaded.chunks])
  const nearbyBuildings = useMemo(() => {
    if (!buildingIndex) return null
    const bounds = geometryBounds(selected.geometry)
    return buildingIndex.query(bounds)
  }, [buildingIndex, selected])
  const areaSites = useMemo(() => (scenario.buildings || []).map(building => {
    const feature = planByPin.get(building.pin), bounds = geometryBounds(feature.geometry)
    const areaStop = stops.features.find(s => String(s.properties.stop_id) === building.stopId)
    return { ...building, feature, existingBuildings: buildingIndex ? buildingIndex.query(bounds) : null,
      stop: areaStop ? { ...areaStop.properties, coordinates: areaStop.geometry.coordinates, distance: nearbyStops(feature, stops).find(s => String(s.stop_id) === building.stopId)?.distance ?? 0 } : null }
  }), [scenario.buildings, planByPin, buildingIndex, stops])
  const input = useMemo(() => ({ feature: selected, zoning, scenario, stop, existingBuildings: nearbyBuildings, areaSites }), [selected, zoning, scenario, stop, nearbyBuildings, areaSites])
  const evaluation = useEvaluation(input, network)
  const result = evaluation.pin === scenario.pin ? evaluation.result : null
  const options = result ? (proposed ? result.proposal : result.baseline) : null
  const option = scenario.draft, evaluated = options?.[option.typeId]
  const zoningInputs = scenario.zoningInputsByPin?.[scenario.pin] || {}
  function setZoningInput(key, value) { set('zoningInputsByPin', { ...scenario.zoningInputsByPin, [scenario.pin]: { ...zoningInputs, [key]: value } }) }
  const matches = useMemo(() => query.trim().length > 1 ? [...catalogue.values()].filter(f => `${f.properties.address} ${f.properties.pin}`.toLowerCase().includes(query.toLowerCase().trim())).slice(0, 6) : [], [query, catalogue])

  function select(pin) {
    if (!catalogue.has(pin)) return
    setPendingHistory(null)
    if (!byPin.has(pin)) { setPendingPin(pin); setNotice('Loading the selected neighborhood…'); return }
    setPendingPin(null)
    if (pin === scenario.pin) { setTool('housing'); setInspectorTab('edit'); setQuery(''); return }
    const sameArea = byPin.get(pin).properties.area === props.area
    const next = makeScenario(pin)
    if (sameArea) Object.assign(next, { zoningInputsByPin: scenario.zoningInputsByPin, projectInputs: scenario.projectInputs, connections: scenario.connections, parks: scenario.parks, parkAccessShare: scenario.parkAccessShare, weights: scenario.weights, comparisonTypes: scenario.comparisonTypes, buildings: scenario.buildings || [], additionalDepartures: scenario.additionalDepartures, serviceHours: scenario.serviceHours, serviceStopId: scenario.serviceStopId || scenario.stopId, capacityStopId: scenario.capacityStopId || scenario.stopId, spareBoardings: scenario.spareBoardings, availablePlacesPerDeparture: scenario.availablePlacesPerDeparture, boardingsPerHome: scenario.boardingsPerHome })
    if (sameArea && nearbyStops(byPin.get(pin), stops).some(s => String(s.stop_id) === next.serviceStopId)) next.stopId = next.serviceStopId
    dispatch({ type: 'reset', scenario: next }); setQuery(''); setTool('housing'); setInspectorTab('rankings')
    setNotice(sameArea ? 'Placed buildings retained. Site changed. Local infrastructure and priorities retained; housing and stop assumptions reset for this parcel.' : 'Study area changed. A new local scenario starts here.')
  }
  function selectStop(id) {
    if (nearby.some(s => String(s.stop_id) === id)) { dispatch({ type: 'set', key: 'stopId', value: id }); setNotice('Selected stop updated. The same stop is used for baseline and proposal.') }
    else setNotice('Choose a scheduled stop within 1,200 m of this parcel.')
  }
  function restoreHistory(direction) { setPendingPin(null); setPendingHistory(direction) }
  function changeType(typeId) { setInspectorTab('edit'); dispatch({ type: 'draft', value: { typeId, ...MASSING_DEFAULTS[typeId], height: BUILDINGS[typeId].heightM, floors: BUILDINGS[typeId].floors, residentialForm: 'duplex', placement: null } }) }
  function previewTemplate(template) {
    if (evaluation.pending) return
    dispatch({ type: 'draft', value: template }); setTool('housing'); setInspectorTab('edit'); setPlacing(false)
    setNotice(`${BUILDINGS[template.typeId].label} selected as the current draft. Undo restores the previous draft.`)
  }
  function cycle(direction) { changeType(BUILDING_IDS[(BUILDING_IDS.indexOf(option.typeId) + direction + BUILDING_IDS.length) % BUILDING_IDS.length]) }
  function set(key, value) {
    dispatch({ type: 'patch', value: { [key]: value, ...(key === 'additionalDepartures' ? { serviceStopId: scenario.stopId } : {}), ...(key === 'spareBoardings' ? { capacityStopId: scenario.stopId } : {}) } })
  }
  function setOption(key, value) { dispatch({ type: 'draft', value: { [key]: value } }) }
  const placement = option.placement || evaluated?.massing.placement || { east: 0, north: 0, bearing: 0 }
  function moveProposal(changes) { setOption('placement', { ...placement, ...changes }) }
  const proposalObstacles = useMemo(() => nearbyBuildings === null ? null : [...nearbyBuildings, ...(result?.committed?.proposal || []).filter(b => b.massing.geometry).map(b => ({ geometry: b.massing.geometry })), ...(result?.reservations || [])], [nearbyBuildings, result])
  const hoverMassing = useMemo(() => hoverPoint ? fitMassing(selected.geometry, option.width, option.depth, placementAt(selected.geometry, hoverPoint, placement.bearing), proposalObstacles) : null, [hoverPoint, selected, option.width, option.depth, placement.bearing, proposalObstacles])
  function screenPlacement(massing) {
    return evaluateTitleNine({ option, feature: selected, zoning, massing, existingBuildings: nearbyBuildings, siteInputs: zoningInputs, projectInputs: scenario.projectInputs,
      members: [...areaSites.map(site => ({ option: site.option, feature: site.feature, izStatus: scenario.zoningInputsByPin?.[site.feature.properties.pin]?.izStatus })), { option, feature: selected, izStatus: zoningInputs.izStatus }] })
  }
  const previewOption = hoverMassing && evaluated ? { ...evaluated, massing: hoverMassing, titleNine: screenPlacement(hoverMassing) } : evaluated
  const buildingPreview = useMemo(() => draftPreview(previewOption, evaluation.pending), [previewOption, evaluation.pending])
  function addBuilding(massing = result?.proposal?.[option.typeId]?.massing) {
    if (!proposed || evaluation.pending || result?.infrastructureErrors?.length || !massing?.fits || massing.collisions !== 0 || screenPlacement(massing).conflict) { setNotice('Cannot add: physical fit or a supported zoning check conflicts. Check the red preview and zoning details.'); return }
    if ((scenario.buildings || []).length >= 40) { setNotice('This local plan supports 40 buildings.'); return }
    dispatch({ type: 'addBuilding', building: { id: crypto.randomUUID(), pin: scenario.pin, option: { ...option, placement: massing.placement }, targetIncome: scenario.targetIncome, stopId: scenario.stopId } })
    setPlacing(false); setNotice('Building added. Select another parcel or place the next building; the plan stays on the map.')
  }
  function placeProposal(coordinates) {
    addBuilding(fitMassing(selected.geometry, option.width, option.depth, placementAt(selected.geometry, coordinates, placement.bearing), proposalObstacles))
  }
  function beginDrawing(kind) { setPlacing(false); setDrawing(kind); setDraftNode(null); setNotice('') }
  function cancelDrawing() { setDrawing(null); setDraftNode(null) }
  function drawInfrastructure(coordinates) {
    if (!network || !drawing || !context) { setNotice('Wait for network and building context to load before drawing.'); return }
    const snapped = nearestNode(network, coordinates, drawing === 'park' ? 50 : 35)
    if (!snapped) { setNotice('No eligible ground-level node nearby. Choose a point closer to the blue walking network.'); return }
    if (drawing !== 'park' && draftNode === null) { setDraftNode(snapped.node); setNotice('First endpoint selected. Choose the second endpoint.'); return }
    const id = crypto.randomUUID()
    const operation = drawing === 'park' ? { id, name: `Proposed park ${scenario.parks.length + 1}`, coordinates, node: snapped.node, width: 20, depth: 20 } : { id, kind: drawing, from: draftNode, to: snapped.node, width: drawing === 'path' ? 3 : 12 }
    const error = drawing === 'park' ? validatePark(network, operation) : validateConnection(network, operation)
    if (error) { setNotice(error); return }
    const geometry = drawing === 'park' ? rectangleAt(coordinates, 20, 20) : connectionGeometry(network, operation)
    const bounds = geometryBounds(geometry)
    if (!manifest.neighborhoods.some(n => loaded.chunks.has(n.id) && containsBounds(n.bounds, bounds))) { setNotice('Pan closer to a study neighborhood to load its building evidence before drawing here.'); return }
    if (loadedBuildingIndex.query(bounds).some(b => geometriesOverlap(geometry, b.geometry))) { setNotice('This reservation overlaps a recorded building. Choose a clear location; demolition is not modeled.'); return }
    const key = drawing === 'park' ? 'parks' : 'connections'
    if (scenario[key].length >= 12) { setNotice('This local scenario supports up to 12 edits of each kind.'); return }
    set(key, [...scenario[key], operation]); setProposed(true); cancelDrawing(); setNotice('Hypothetical infrastructure added. Access and reserved land are recalculated; buildability remains unverified.')
  }
  function download() {
    const payload = { ...scenarioExport(scenario, summary), results: result, networkContext: networkData?.manifest.sha256 || null, buildingContext: context ? { sha256: context.manifest.sha256, retrievedAt: context.manifest.retrieved_at } : null, sources: { parcels: '/data/parcels.geojson', zoning: '/data/zoning.json', stops: '/data/stops.geojson', buildings: '/data/existing-buildings.sources.json', network: '/data/walking-network.sources.json' } }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `housing-scenario-${scenario.pin}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Scenario exported with model version, assumptions and comparison results.')
  }

  return <main className="studio">
    <a className="skip-link" href="#planner-inspector" onClick={() => setSidebarOpen(true)}>Skip to planning controls</a>
    <header className="studio-header">
      <div className="studio-brand"><span className="planner-brandmark"><Icon name="building"/></span><div><strong>Playhouse<span className="studio-beta">LAB</span></strong><small>Housing + infrastructure studio</small></div></div>
      <nav className="study-switch" aria-label="Study examples">{EXAMPLES.map((example, i) => <button key={example.id} className={props.area === example.label ? 'active' : ''} onClick={() => select(example.pin)}><span>0{i + 1}</span>{example.label}</button>)}</nav>
      <div className="studio-header-actions"><button ref={tourButton} className="studio-tour-trigger" onClick={() => setTourRequest(n => n + 1)}>Tour</button><button className="sidebar-toggle" aria-expanded={sidebarOpen} aria-controls="planner-inspector" onClick={() => { if (tool === 'compare') setActiveTool('housing'); setSidebarOpen(!sidebarOpen) }}>{sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}</button><button className="find-sites-button" onClick={() => { setTool('sites'); setInspectorTab('edit') }}>Find sites</button><button data-tour="export" className="studio-export" onClick={download} disabled={!result || evaluation.pending}>Export scenario <span aria-hidden="true">↓</span></button></div>
    </header>
    <StudioWorkspace sidebarOpen={sidebarOpen} expanded={tool === 'compare'} map={
      <section className="studio-canvas" aria-label="Planning map">
        <PlannerMap parcels={mapParcels} neighborhoods={neighborhoods} stops={stops} existingBuildings={loaded.mapBuildings} showExisting={showExisting} selected={selected} buildingPreview={buildingPreview} stop={stop} proposed={proposed} additionalDepartures={scenario.additionalDepartures} view3d={view3d} onSelect={select} onStop={selectStop} tool={tool} placing={placing} onPlace={placeProposal} onHover={setHoverPoint} placedBuildings={result?.committed?.[proposed ? 'proposal' : 'baseline'] || []} network={network} networkResult={evaluated?.access} reservations={result?.reservations} connections={scenario.connections} drawing={drawing} draftNode={draftNode} onDraw={drawInfrastructure} discoveryPins={discoveryPins} onViewport={setViewport}/>
        <div className="map-detail-status" role="status">{loaded.error ? <button onClick={loaded.retry}>Neighborhood data unavailable · Retry</button> : pendingPin || pendingHistory || loaded.pending ? 'Loading neighborhood…' : viewport && viewport.zoom < DETAIL_ZOOM ? 'Zoom in for buildings and parcels' : null}</div>
        {placing && <div className="placement-banner" role="status">Click to add {housingSpec(option).label}. Green: passes placement screen · red: needs review. <button onClick={() => setPlacing(false)}>Cancel placement</button></div>}
        <nav data-tour="tools" className="studio-tools" aria-label="Planning tools">{[['sites', 'pin', 'Sites'], ['housing', 'building', 'Housing'], ['service', 'bus', 'Transit'], ['network', 'network', 'Infra'], ['compare', 'chart', 'Compare']].map(([id, icon, label]) => <button key={id} className={tool === id ? 'active' : ''} aria-pressed={tool === id} onClick={() => { setTool(id); setInspectorTab(id === 'compare' ? 'rankings' : 'edit') }}><Icon name={icon}/><span>{label}</span></button>)}<div className="tool-divider"/><button onClick={() => setView3d(!view3d)} aria-pressed={view3d}><Icon name="layers"/><span>{view3d ? '3D' : '2D'}</span></button></nav>
        <div className="canvas-heading"><span className="eyebrow">PITTSBURGH / {props.area?.toUpperCase()}</span></div>
        <div className="canvas-mode"><div className="segmented" aria-label="Infrastructure view"><button className={!proposed ? 'active' : ''} aria-pressed={!proposed} onClick={() => setProposed(false)}>Baseline</button><button className={proposed ? 'active' : ''} aria-pressed={proposed} onClick={() => setProposed(true)}>Proposal {scenario.additionalDepartures > 0 && <i/>}</button></div><div className="history-controls"><button aria-label="Undo scenario edit" disabled={!history.past.length || !!pendingHistory} onClick={() => restoreHistory('undo')}>↶</button><button aria-label="Redo scenario edit" disabled={!history.future.length || !!pendingHistory} onClick={() => restoreHistory('redo')}>↷</button></div></div>
        <div className="map-overlays">
        {tool === 'housing' && <div data-tour="housing" className="massing-tray"><div className="tray-top"><div><span className="eyebrow">CURRENT DRAFT</span><strong>{housingSpec(option).label}</strong></div><span className="option-chip">{housingSpec(option).units} homes</span></div><div className="type-cycler"><button aria-label="Previous housing type" onClick={() => cycle(-1)}>←</button><div className="type-dots">{BUILDING_IDS.map(id => <button key={id} title={BUILDINGS[id].label} aria-label={`Preview ${BUILDINGS[id].label}`} aria-pressed={id === option.typeId} className={id === option.typeId ? 'active' : ''} onClick={() => changeType(id)}><Icon name="building" size={18}/></button>)}</div><button aria-label="Next housing type" onClick={() => cycle(1)}>→</button></div><p>{option.width} × {option.depth} m footprint · {option.height} m high <span>Proposed dimensions</span></p><div className="draft-preview-status" role="status"><i style={{ background: buildingPreview?.properties.color || "#94a3b8" }}/>{buildingPreview?.properties.status || "Preparing preview…"}<small>Preview only · not added to plan</small></div></div>}
        <MapLegend showExisting={showExisting} onShowExisting={setShowExisting} context={context} error={loaded.error} onRetry={loaded.retry}/>
        </div>
      </section>
    }>
      <aside data-tour="inspector" id="planner-inspector" className="studio-inspector" tabIndex={-1}>
        <div className="inspector-top">{tool === 'compare' && <button className="comparison-back" onClick={() => setTool('housing')}>← Back to map</button>}<div className="inspector-status"><span className="live-dot"/>{evaluation.pending ? 'Recalculating…' : 'Scenario ready'}<span>{MODEL_VERSION}</span></div><label data-tour="site" className="site-search"><Icon name="pin" size={16}/><input aria-label="Search address or parcel ID" placeholder="Find an address or parcel…" value={query} onChange={e => setQuery(e.target.value)}/></label>{query.length > 1 && <div className="search-results">{matches.length ? matches.map(f => <button key={f.properties.pin} onClick={() => select(f.properties.pin)}>{f.properties.address || f.properties.pin}<small>{f.properties.neighborhood}</small></button>) : <p>No matching study parcels.</p>}</div>}</div>
        <nav className="inspector-tabs" aria-label="Inspector sections">{[['edit', tool === 'sites' ? 'Sites' : 'Edit'], ['rankings','Rankings'], ['priorities','Priorities'], ['assumptions','Assumptions']].map(([id,label]) => <button key={id} aria-pressed={inspectorTab === id} onClick={() => setInspectorTab(id)}>{label}</button>)}</nav>
        <div className="inspector-scroll" key={inspectorTab}>
          {inspectorTab === 'edit' && tool === 'sites' && <StudioSites filters={siteFilters} setFilters={setSiteFilters} sites={sites} selectedPin={scenario.pin} onSelect={select} loading={sitesLoading}/>}
          {inspectorTab === 'priorities' && <StudioPriorities pending={evaluation.pending} weights={scenario.weights} included={result?.comparison?.included} onChange={weights => set('weights', weights)}/>}
          {inspectorTab !== 'priorities' && !(inspectorTab === 'edit' && tool === 'sites') && <div className="site-heading"><span className="eyebrow">YOUR SELECTED SITE</span><h2>{props.address || 'Unnamed parcel'}</h2><p>{props.neighborhood} · {fmt(props.lot_sqft)} sq ft</p><div className="site-tags"><span>{props.land_use || 'Land use unknown'}</span><span>{props.zoning_code || 'Zoning unknown'}</span>{props.city_owned && <span>City inventory</span>}</div></div>}
          {evaluation.error && <p role="alert" className="planner-warning">Calculation failed: {evaluation.error}</p>}
          {(inspectorTab === 'edit' || inspectorTab === 'rankings') && (scenario.buildings || []).length > 0 && <section className="area-plan"><div className="section-heading"><h3>Placed plan</h3><span>{scenario.buildings.length} buildings · {scenario.buildings.reduce((n, b) => n + housingSpec(b.option).units, 0)} homes</span></div>{result?.placedPlan && !evaluation.pending && <p className="placed-plan-score"><span>{result.placedPlan.proposal.parcels} parcel(s) · current plan</span><strong>{fmt(result.placedPlan.baseline.total)} → {fmt(result.placedPlan.proposal.total)}</strong><small>Score with existing → proposed infrastructure</small></p>}{inspectorTab === 'edit' && <><p className="compact-help">Placed buildings stay fixed. Rankings compare this plan plus the next building.</p><ul>{scenario.buildings.map((b, i) => <li key={b.id}><button onClick={() => select(b.pin)}><strong>{i + 1}. {housingSpec(b.option).label}</strong><small>{byPin.get(b.pin)?.properties.address || b.pin}</small></button><button aria-label={`Remove placed building ${i + 1}`} onClick={() => dispatch({ type: 'removeBuilding', id: b.id })}>×</button></li>)}</ul></>}</section>}
          {inspectorTab === 'rankings' && <HousingComparison comparison={result?.comparison} draft={option} selectedTypes={scenario.comparisonTypes} onSelection={types => set('comparisonTypes', types)} proposed={proposed} pending={evaluation.pending} expanded={tool === 'compare'} onExpand={() => setTool('compare')} onBack={() => setTool('housing')} area={!!scenario.buildings?.length} onUse={previewTemplate} onAssumptions={() => setInspectorTab('assumptions')}/>}
          {inspectorTab === 'edit' && (tool === 'housing' || tool === 'compare') && <>
            <div className="section-heading"><h3>Shape the proposal</h3><span className="data-badge">Assumed</span></div><p className="compact-help">{option.width} × {option.depth} m · {option.height} m high. Previewed on the map. Add it to your plan when ready.</p>
            <label className="planner-field"><span>Housing type</span><select value={option.typeId} onChange={e => changeType(e.target.value)}>{BUILDING_IDS.map(id => <option key={id} value={id}>{BUILDINGS[id].label}</option>)}</select></label>

            <div className="placement-actions"><button disabled={!proposed || evaluation.pending || !result?.proposal?.[option.typeId]?.physicalEligible || result?.proposal?.[option.typeId]?.titleNine.conflict} onClick={() => addBuilding()}>Add building to plan</button><button disabled={!proposed || evaluation.pending || !context} aria-pressed={placing} onClick={() => setPlacing(!placing)}>{placing ? 'Cancel placement' : 'Place manually'}</button></div>
            <button className="assumptions-link" onClick={() => setInspectorTab('assumptions')}>Advanced options · size, position, income & costs →</button>
            {evaluated && !evaluation.pending && <div className={`fit-note ${evaluated.siteEligible ?? evaluated.eligible ? 'fits' : 'review'}`}><strong>{evaluated.gate}</strong><small>{evaluated.units} assumed homes · unsupported checks excluded</small></div>}
            {evaluated && <TitleNineChecks result={evaluated.titleNine}/>}
            <button className="next-tool" onClick={() => { setTool('service'); setInspectorTab('edit') }}>Next, test a transit investment <Icon name="arrow" size={18}/></button>
          </>}
          {inspectorTab === 'edit' && tool === 'service' && <>
            <div className="section-heading"><h3>Improve scheduled service</h3><span className="data-badge observed">PRT baseline</span></div><p className="section-help">Test extra departures at an existing stop.</p>
            <label className="planner-field"><span>Existing stop within 1,200 m</span><select value={scenario.stopId} onChange={e => selectStop(e.target.value)}>{!nearby.length && <option value="">No scheduled stop nearby</option>}{nearby.map(s => <option key={s.stop_id} value={String(s.stop_id)}>{s.name} · {Math.round(s.distance)} m</option>)}</select></label>
            {stop && <div className="service-baseline"><Icon name="bus"/><div><strong>{stop.weekday_trips} scheduled stop departures</strong><small>Baseline weekday · route labels {(stop.routes || []).join(', ') || 'unavailable'}</small></div></div>}
            <label className="service-slider"><span>Additional departures / weekday <strong>+{scenario.additionalDepartures}</strong></span><input type="range" min="0" max="120" step="5" value={scenario.additionalDepartures} disabled={!stop} onChange={e => set('additionalDepartures', Number(e.target.value))}/><small>0 <span>120 new departures</span></small></label>
            <div className="service-presets">{[0, 30, 60].map(n => <button key={n} aria-pressed={scenario.additionalDepartures === n} className={scenario.additionalDepartures === n ? 'active' : ''} onClick={() => { set('additionalDepartures', n); setProposed(true) }} disabled={!stop}>{n ? `+${n} / day` : 'No change'}</button>)}</div>
            {result?.baseline[option.typeId]?.service && <div className="before-after"><div><span>Baseline walk + wait</span><strong>{fmt(result.baseline[option.typeId].service.minutes, ' min')}</strong></div><Icon name="arrow"/><div><span>With added service</span><strong>{fmt(result.proposal[option.typeId].service?.minutes, ' min')}</strong></div></div>}
            {scenario.serviceStopId && scenario.serviceStopId !== scenario.stopId && <p className="planner-warning">The current service investment is at stop {scenario.serviceStopId}. Changing departures here moves it to this stop.</p>}
            <button className="assumptions-link" onClick={() => setInspectorTab('assumptions')}>Service & capacity assumptions →</button>
            <button className="next-tool" onClick={() => { setTool('compare'); setInspectorTab('rankings') }}>Compare the housing outcomes <Icon name="arrow" size={18}/></button>
          </>}
          {inspectorTab === 'edit' && tool === 'network' && <InfrastructurePanel network={network} manifest={networkData?.manifest} error={networkError} retry={() => setNetworkAttempt(n => n + 1)} scenario={scenario} set={set} result={result} drawing={drawing} begin={beginDrawing} cancel={cancelDrawing} draftNode={draftNode} remove={(key, id) => set(key, scenario[key].filter(edit => edit.id !== id))} numeric={Numeric} onAssumptions={() => setInspectorTab('assumptions')}/>}
          {inspectorTab === 'assumptions' && <>
            <div className="section-heading"><h3>Assumptions & advanced options</h3></div>
            <p className="compact-help">Proposed values are editable. Sources, model choices and limits are below.</p>
            <details className="planner-details advanced-options" open><summary>Advanced options · exact values</summary>
            <p className="compact-help">Editing the current draft. Enter exact values; changes recalculate on Enter or leaving the field.</p>
            <div className="field-grid three"><Numeric label="Width (m)" value={option.width} min={2} max={100} onChange={v => setOption('width', v)}/><Numeric label="Depth (m)" value={option.depth} min={2} max={100} onChange={v => setOption('depth', v)}/><Numeric label="Zoning height above grade (m)" value={option.height} min={3} max={100} onChange={v => setOption('height', v)}/></div>
            <Numeric label="Stories" value={option.floors ?? housingSpec(option).floors} min={1} max={60} step={1} hint="Whole floors used for zoning and the gross floor-area estimate." onChange={v => setOption('floors', v)}/>
            {option.typeId === 'townhouse_duplex' && <label className="planner-field"><span>Legal residential form</span><select value={option.residentialForm || 'duplex'} onChange={e => setOption('residentialForm', e.target.value)}><option value="duplex">Duplex · two units on one lot</option><option value="attached">Attached house · one unit on its own lot</option></select><small>Attached houses need a shared wall; this map does not establish that configuration.</small></label>}
            <ZoningInputs inputs={zoningInputs} project={scenario.projectInputs || {}} onChange={setZoningInput} onProjectChange={v => set('projectInputs', v)} numeric={Numeric} typeId={option.typeId} code={props.zoning_code}/>
            <details className="planner-details placement-controls">
              <summary>Position & orientation <span>{option.placement ? 'Manual placement' : 'Automatic parcel alignment'}</span></summary>
              <p>Automatic placement follows parcel edges; street frontage is not identified. Manual moves preserve your chosen size and position.</p>
              <fieldset disabled={evaluation.pending || !evaluated}>
              <div className="field-grid three"><Numeric label="Bearing (°)" value={round(placement.bearing)} min={0} max={359.9} step={5} onChange={v => moveProposal({ bearing: v })}/><Numeric label="East offset (m)" value={round(placement.east)} min={-2000} max={2000} step={1} onChange={v => moveProposal({ east: v })}/><Numeric label="North offset (m)" value={round(placement.north)} min={-2000} max={2000} step={1} onChange={v => moveProposal({ north: v })}/></div>
              <small>Bearing: depth axis clockwise from north. Offsets: from parcel bounding-box centre.</small>
              <div className="placement-actions"><button onClick={() => moveProposal({ bearing: (placement.bearing + 345) % 360 })}>Rotate −15°</button><button onClick={() => moveProposal({ bearing: (placement.bearing + 15) % 360 })}>Rotate +15°</button><button disabled={!proposed || evaluation.pending || !context} aria-pressed={placing} onClick={() => setPlacing(!placing)}>{placing ? 'Cancel placement' : 'Place manually'}</button><button onClick={() => { setOption('placement', null); setPlacing(false) }}>Reset alignment</button></div>
              </fieldset>
            </details>
            <div className="section-heading"><h3>Affordability assumptions</h3><span className="data-badge">Editable</span></div><p className="section-help">Starting income and gross rent come from the selected Census geography as context. Proposed rent and utilities are independent assumptions, not a forecast.</p>
            <Numeric label="Target household income / year ($)" value={scenario.targetIncome} min={1000} max={500000} step={1000} onChange={v => set('targetIncome', v)}/>
            <div className="field-grid"><Numeric label="Rent / month ($)" value={option.rent} max={10000} step={50} onChange={v => setOption('rent', v)}/><Numeric label="Utilities / month ($)" value={option.utilities} max={2000} step={25} onChange={v => setOption('utilities', v)}/></div>
            {evaluated && <div className="metric-highlight"><span>Housing cost / target income</span><strong>{fmt(evaluated.burden === null ? null : evaluated.burden * 100, '%')}</strong><small>30% is a screening benchmark. Financing and subsidies are not evaluated.</small></div>}
            <p className="section-help">Routed walking at 80 m/min (stairs: assumed 40 m/min), plus assumed last-metre connectors and half the average departure interval. Assumes evenly spaced, usable departures in the service span. Route destinations, transfers, hills and actual arrival times are not modeled.</p>
            <Numeric label="Assumed service span (hours/day)" value={scenario.serviceHours} min={1} max={24} onChange={v => set('serviceHours', v)}/>
            <details className="planner-details"><summary>Capacity assumptions <span>{scenario.spareBoardings === null ? 'Unknown until supplied' : 'User-supplied scenario'}</span></summary><p>No observed spare-capacity or utility data is available. Enter a hypothetical transit reserve to test a conditional capacity scenario.</p><Numeric label="Baseline spare boardings / day" value={scenario.spareBoardings} nullable max={100000} onChange={v => set('spareBoardings', v)}/><Numeric label="Available boarding places / added departure" value={scenario.availablePlacesPerDeparture} min={0} max={100} onChange={v => set('availablePlacesPerDeparture', v)}/><Numeric label="Added daily boardings / proposed home" value={scenario.boardingsPerHome} min={0} max={20} step={.5} onChange={v => set('boardingsPerHome', v)}/><p>These assumed daily totals do not establish peak load, vehicle occupancy, funding, route feasibility or water/sewer capacity.</p></details>

            </details>
            {result?.scope === 'area' && <p className="compact-help">Area rankings include all placed buildings plus the next alternative. Factor scores are averages per proposed home, not neighborhood forecasts. Each building retains the rent, income and stop recorded at placement. Transit reserve is shared by all proposed homes using that stop.</p>}
            {evaluated && <TitleNineChecks result={evaluated.titleNine}/>}
            {options && <details className="planner-details"><summary>Factor calculations · current draft</summary><div className="factor-list">{PLANNER_FACTORS.map(factor => <Factor key={factor.id} factor={factor} option={evaluated} result={result} scenario={scenario} onPriorities={() => setInspectorTab('priorities')}/>)}</div></details>}
            {result && <><details className="planner-details"><summary>Why this result? Full audit</summary><p>{result.explanation}</p><RecommendationAudit result={result} proposed={proposed} options={options}/></details><details className="planner-details"><summary>Comparison assumptions & exclusions</summary><p>Selected types share the current draft’s rent, utilities and target income. The current draft keeps your exact dimensions and position; other types use standard dimensions and automatic placement. Unit counts are fixed assumptions. Triplex and 12-home apartment share the source small-apartment demand/carbon proxy.</p>{result.comparison.factors.map(f => <p key={f.id}><strong>{f.short}:</strong> {f.included ? `${(100*f.effectiveWeight).toFixed(1)}% effective weight.` : f.exclusion} {f.source}.</p>)}<p>Every selected type uses the same evidence coverage and relative priorities. Adding a type with missing evidence can change that shared coverage.</p></details></>}
          </>}
          {inspectorTab === 'assumptions' && <details className="evidence-panel"><summary>Public sources & limits</summary><p><strong>Infrastructure:</strong> Paths reserve 3 m, streets 12 m, parks 20 × 20 m. Only endpoints form junctions. River crossings, grades, safe access, land rights and engineering are unreviewed. Park access uses mapped paths and an assumed connector; wheelchair suitability is unknown. Transit preference uses a 30-minute anchor and parks a 15-minute anchor. Park priority is a value judgment, not an estimate of cooling or price change.</p><p><strong>Observed:</strong> OSM walking graph and mapped parks; County parcels/assessments, ACS 2020–2024, CHAS 2018–2022, PRT stop aggregates, mapped hazards. Snapshot {summary.pulled_at}.</p><p><strong>Existing buildings:</strong> County roof outlines in their recorded positions. {context ? buildingHeightCoverage(context.manifest.height_methods) : 'Building evidence is loading or unavailable.'} Click a building to inspect its height method. Colours show matched parcel assessment use, not recommended housing or verified occupancy. Neutral footprints have unknown use. Heights retain their separate evidence methods. These display estimates do not affect recommendations. No independently verified heights or terrain model; source dates and coverage vary. Nonresidential buildings are included.</p><p><strong>Proposed:</strong> dimensions, rents, utilities, target income, additional departures, service span and optional capacity. No LiDAR-derived heights have been added.</p><p><strong>Calculated:</strong> sampled outline fit, cost burden, aggregate walk/wait, conditional boarding capacity and weighted comparison.</p><p><strong>Not evaluated:</strong> zoning rules marked not assessed, contextual exceptions, utility capacity, occupied-site acquisition, engineering, travel destinations, displacement caused by development, or marginal tonnes of CO₂.</p><p>Hazard context: {props.flood_zones?.length ? props.flood_zones.join(', ') : 'no mapped flood overlap recorded'}; steep slope {fmt(typeof props.steep_slope_overlap === 'number' ? props.steep_slope_overlap * 100 : null, '%')}; mine overlap {fmt(typeof props.undermined_overlap === 'number' ? props.undermined_overlap * 100 : null, '%')}. Missing data is not a clean site finding.</p><a href="/data/walking-network.sources.json" target="_blank" rel="noreferrer">Walking network & park assumptions ↗</a><a href="/data/existing-buildings.sources.json" target="_blank" rel="noreferrer">Building evidence & height assumptions ↗</a><a href="/data/sources.json" target="_blank" rel="noreferrer">Source manifest ↗</a><a href="/data/score_model.json" target="_blank" rel="noreferrer">Baseline model assumptions ↗</a><a href="https://ecode360.com/45476524#45476524" target="_blank" rel="noreferrer">Zoning use table ↗</a></details>}
        </div>
        <footer className="inspector-footer"><span className="live-dot"/>Local scenario · public data · human review</footer>
      </aside>
    </StudioWorkspace>
    <StudioTour startRequest={tourRequest} onStep={showTourStep} onFinish={finishTour} triggerRef={tourButton}/>
    <div className={notice ? 'network-notice' : 'planner-announcement'} role="status" aria-live="polite">{notice}{notice && <button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button>}</div>
  </main>
}

function Factor({ factor, option, result, scenario, onPriorities }) {
  const a = option
  const details = {
    demand: 'Existing neighborhood sales activity and team-chosen lot-fit curve. Not a forecast of household or typology demand. Infrastructure edits leave it unchanged.',
    physical: '100 if the fixed-size footprint fits inside the parcel without touching recorded buildings; otherwise 0. Missing building context excludes this factor and withholds ranking. Supported Title Nine conflicts separately remove the housing total. Rules without sufficient evidence are excluded. Street frontage, occupancy, demolition and engineering remain unreviewed.',
    affordability: 'Monthly proposed rent + utilities divided by target monthly household income. Score falls linearly from 100 at 20% burden to 0 at 50%; these anchors are value judgments.',
    displacement: '100 minus the existing tract displacement screen. Shared by housing types at this site. New service does not predict or rewrite displacement.',
    capacity: 'Available daily boardings divided by assumed new housing boardings, capped at 100. Baseline reserve + added departures × available places. Unknown reserve excludes this factor from comparison. Utilities not assessed.',
    access: 'Routed transit access: 100 × (1 − walk plus average wait / 30 minutes). Park access: 100 × (1 − walk to mapped/proposed park / 15 minutes). Both are clamped and blended by your park-share preference (default 0%). The anchors are policy choices. No jobs, actual timetables or safe crossings are evaluated.',
    carbon: '100 minus the existing relative carbon proxy per home. Not incremental tonnes. Unchanged by this service edit because travel mode shifts and infrastructure emissions are not modeled.',
  }
  function metric(o) {
    if (o.area) return `${o.area.units} proposed homes across ${o.area.buildings} buildings · average per home`
    if (factor.id === 'affordability') return `${fmt(o.burden === null ? null : o.burden * 100, '%')} cost burden`
    if (factor.id === 'capacity') return `${fmt(o.supply)} available / ${fmt(o.demandBoardings)} assumed boardings`
    if (factor.id === 'access') return `${fmt(o.service?.minutes, ' min')} walk + wait`
    if (factor.id === 'physical') return !o.massing.fits ? 'Outline does not fit' : o.massing.collisions === null ? 'Building context unavailable' : o.massing.collisions ? 'Recorded building overlap' : 'Outline + overlap pass'
    if (factor.id === 'carbon') return `${fmt(o.raw.carbon_index)} relative index / home`
    if (factor.id === 'displacement') return `${fmt(o.raw.displacement_risk)} tract risk`
    return `${fmt(o.raw.demand)} market/lot proxy`
  }
  return <details className="factor-item"><summary><div><strong>{factor.label}</strong><small>{factor.kind}</small></div><span className="factor-score a">{fmt(a.scores[factor.id])}</span></summary><div className="factor-content"><div className="factor-values"><span>{metric(a)}</span></div><p>{details[factor.id]}</p><small>Source: {factor.source}</small><button className="assumptions-link" onClick={onPriorities}>Adjust relative priorities →</button>{result.excluded.includes(factor.id) && <p className="planner-warning">Excluded: missing evidence or zero weight. The same coverage is used for all selected types and both infrastructure states.</p>}</div></details>
}
