"use client"

export default function InfrastructurePanel({ network, manifest, error, retry, scenario, set, result, drawing, begin, cancel, draftNode, remove, numeric: Numeric, onAssumptions }) {
  const before = result?.baseline.A.access, after = result?.proposal.A.access
  const minutes = n => Number.isFinite(n) ? `${n.toFixed(1)} min` : 'No route / unknown'
  return <>
    <div className="section-heading"><h3>Connections & parks</h3><span className="data-badge">Hypothetical</span></div>
    <p className="section-help">Draw a connection or park. Reserved land reduces space for housing.</p>
    {!network ? <div className="fit-note review"><strong>{error ? 'Walking network unavailable' : 'Loading walking network…'}</strong><p>Routed access remains unknown until the data loads.</p>{error && <button onClick={retry}>Retry network</button>}</div> : <>
      <div className="network-tools"><button aria-pressed={drawing === 'path'} onClick={() => begin('path')}>Draw walking path</button><button aria-pressed={drawing === 'street'} onClick={() => begin('street')}>Draw street + sidewalks</button><button aria-pressed={drawing === 'park'} onClick={() => begin('park')}>Place park zone</button>{drawing && <button onClick={cancel}>Cancel drawing</button>}</div>
      <p className="section-help">{drawing === 'park' ? 'Click an open location within 50 m of a walking node. The 20 × 20 m park zone and final entrance connector are assumptions.' : drawing ? `${draftNode === null ? 'Choose the first' : 'Choose the second'} ground-level node on the blue network. Click within 35 m; connections may be 2–500 m long.` : 'Choose a tool, then click the map. Walking paths reserve 3 m width; streets with sidewalks reserve 12 m. Reservations reduce space available for proposed housing.'}</p>

    </>}
    <div className="infrastructure-list">{scenario.connections.map(c => <div key={c.id}><strong>{c.kind === 'path' ? 'Walking path' : 'Street + sidewalks'}</strong><small>{c.width} m reserved width · two endpoint junctions</small><button aria-label={`Remove ${c.kind} ${c.id}`} onClick={() => remove('connections', c.id)}>Remove</button></div>)}{scenario.parks.map(p => <div key={p.id}><strong>{p.name}</strong><small>{p.width} × {p.depth} m proposed zone · assumed entrance</small><button aria-label={`Remove park ${p.id}`} onClick={() => remove('parks', p.id)}>Remove</button></div>)}</div>
    <div className="section-heading"><h3>Calculated scenario differences</h3><span className="data-badge">Modeled</span></div>
    <div className="network-comparison"><div><span>Walk to selected stop</span><strong>{minutes(before?.walkMinutes)} → {minutes(after?.walkMinutes)}</strong></div><div><span>Nearest mapped / proposed park</span><strong>{minutes(before?.parkMinutes)} → {minutes(after?.parkMinutes)}</strong><small>{after?.parkName || 'No reachable park in extract'}</small></div></div>
    <p className="section-help">{after?.reason}</p>
    <Numeric label="Park share of access priority (%)" value={scenario.parkAccessShare} max={100} step={10} onChange={v => set('parkAccessShare', v)}/>
    <p className="compact-help">Priority: {100 - scenario.parkAccessShare}% transit / {scenario.parkAccessShare}% parks.</p>
    <button className="assumptions-link" onClick={onAssumptions}>Sources & assumptions →</button>
  </>
}
