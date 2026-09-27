"use client"

export default function InfrastructurePanel({ network, manifest, error, retry, scenario, set, result, drawing, begin, cancel, draftNode, remove, numeric: Numeric }) {
  const before = result?.baseline.A.access, after = result?.proposal.A.access
  const minutes = n => Number.isFinite(n) ? `${n.toFixed(1)} min` : 'No route / unknown'
  return <>
    <div className="section-heading"><h3>Connections & parks</h3><span className="data-badge">Hypothetical</span></div>
    <p className="section-help">Use mapped walking nodes to test a new connection or a park. Connections join only at their endpoints. Traffic, legal access, engineering and construction costs are not modeled.</p>
    {!network ? <div className="fit-note review"><strong>{error ? 'Walking network unavailable' : 'Loading walking network…'}</strong><p>Routed access remains unknown until the data loads.</p>{error && <button onClick={retry}>Retry network</button>}</div> : <>
      <div className="network-tools"><button aria-pressed={drawing === 'path'} onClick={() => begin('path')}>Draw walking path</button><button aria-pressed={drawing === 'street'} onClick={() => begin('street')}>Draw street + sidewalks</button><button aria-pressed={drawing === 'park'} onClick={() => begin('park')}>Place park zone</button>{drawing && <button onClick={cancel}>Cancel drawing</button>}</div>
      <p className="section-help">{drawing === 'park' ? 'Click an open location within 50 m of a walking node. The 20 × 20 m park zone and final entrance connector are assumptions.' : drawing ? `${draftNode === null ? 'Choose the first' : 'Choose the second'} ground-level node on the blue network. Click within 35 m; connections may be 2–500 m long.` : 'Choose a tool, then click the map. Walking paths reserve 3 m width; streets with sidewalks reserve 12 m. Reservations reduce space available for proposed housing.'}</p>
      <small className="network-note">Crossings do not create new junctions. Grade separation, river crossings, land rights and buildability need review even when a connection passes the topology checks.</small>
    </>}
    <div className="infrastructure-list">{scenario.connections.map(c => <div key={c.id}><strong>{c.kind === 'path' ? 'Walking path' : 'Street + sidewalks'}</strong><small>{c.width} m reserved width · two endpoint junctions</small><button aria-label={`Remove ${c.kind} ${c.id}`} onClick={() => remove('connections', c.id)}>Remove</button></div>)}{scenario.parks.map(p => <div key={p.id}><strong>{p.name}</strong><small>{p.width} × {p.depth} m proposed zone · assumed entrance</small><button aria-label={`Remove park ${p.id}`} onClick={() => remove('parks', p.id)}>Remove</button></div>)}</div>
    <div className="section-heading"><h3>Calculated scenario differences</h3><span className="data-badge">Modeled</span></div>
    <div className="network-comparison"><div><span>Walk to selected stop</span><strong>{minutes(before?.walkMinutes)} → {minutes(after?.walkMinutes)}</strong></div><div><span>Nearest mapped / proposed park</span><strong>{minutes(before?.parkMinutes)} → {minutes(after?.parkMinutes)}</strong><small>{after?.parkName || 'No reachable park in extract'}</small></div></div>
    <p className="section-help">{after?.reason} Park access points are mapped paths within park boundaries, not audited entrances. The network includes stairs and does not establish wheelchair access.</p>
    <Numeric label="Park share of access priority (%)" value={scenario.parkAccessShare} max={100} step={10} onChange={v => set('parkAccessShare', v)}/>
    <p className="section-help">This is your policy preference, not an observed effect: {100 - scenario.parkAccessShare}% transit access, {scenario.parkAccessShare}% park access. At 0%, parks still change the access display and reserved land, but add no score bonus. Transit uses a 30-minute preference anchor; parks use 15 minutes. Neither predicts demand, rents, displacement, cooling or emissions.</p>
    {manifest && <p className="section-help">OSM snapshot {manifest.osm_base_timestamp?.slice(0, 10)} · {manifest.counts.nodes.toLocaleString()} nodes · {manifest.counts.parks_with_mapped_access} parks with mapped access. Coverage is incomplete. <a href="/data/walking-network.sources.json" target="_blank" rel="noreferrer">Network assumptions & provenance ↗</a></p>}
  </>
}
