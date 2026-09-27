import { BUILDINGS, BUILDING_IDS } from '../lib/buildings.js'
import { simulatedColor } from '../lib/buildingUses.js'
import { FACTOR_LABELS, templateTradeoffs } from '../lib/studioPresentation.js'

const number = n => Number.isFinite(n) ? n.toFixed(1) : '—'
export default function HousingComparison({ comparison, draft, selectedTypes = [], onSelection, proposed, pending, expanded, onExpand, onBack, area, onUse, onAssumptions }) {
  const state = proposed ? 'proposal' : 'baseline'
  const entries = comparison?.entries || []
  function toggle(id) { onSelection(selectedTypes.includes(id) ? selectedTypes.filter(type => type !== id) : [...selectedTypes, id]) }
  return <section className="studio-rankings housing-comparison" aria-label="Housing type comparison" aria-busy={pending}>
    <div className="section-heading"><h3>{area ? 'Your plan + next building' : 'Compare housing types'}</h3>{!expanded && <button onClick={onExpand}>Expand comparison</button>}</div>
    <p className="compact-help">Current draft: <strong>{BUILDINGS[draft.typeId].label}</strong>. {area ? 'Scores include your placed plan, averaged per proposed home.' : 'Same parcel, costs and priorities.'}</p>
    <fieldset className="comparison-picker"><legend>Compare to</legend>
      <div>{BUILDING_IDS.filter(id => id !== draft.typeId).map(id => <label key={id}><input type="checkbox" checked={selectedTypes.includes(id)} onChange={() => toggle(id)}/>{BUILDINGS[id].label}</label>)}</div>
      <button onClick={() => onSelection(BUILDING_IDS.filter(id => id !== draft.typeId))}>All types</button>
      <button onClick={() => onSelection([])}>Clear comparisons</button>
    </fieldset>
    {!comparison ? <p role="status">Loading housing comparison…</p> : <>
      <p className="coverage-pill">{comparison.included.length}/7 factors weighted · {proposed ? 'Proposed' : 'Existing'} infrastructure <button onClick={onAssumptions}>Assumptions</button></p>
      {entries.length === 1 && <p className="compact-help">Select another type above to compare side by side.</p>}
      {!comparison.included.length && <p className="planner-warning" role="status">No ranking: all priorities are off or shared evidence is missing.</p>}
      <div className="housing-table-scroll" tabIndex={0} role="region" aria-label="Side-by-side housing scores">
        <table className="housing-comparison-table" style={{ minWidth: `${150 + entries.length * 175}px` }}>
          <caption>Factor scores: higher is preferred. Shared evidence and relative weights apply to every column.</caption>
          <thead><tr><th scope="col">Housing type</th>{entries.map(entry => <th scope="col" key={entry.id} style={{ borderTopColor: simulatedColor(entry.id) }}><strong>{entry[state].label}</strong><small>{entry.id === draft.typeId ? 'Current draft · your dimensions' : 'Standard template'}</small></th>)}</tr></thead>
          <tbody>
            <tr className="comparison-total"><th scope="row">Overall score</th>{entries.map(entry => <td key={entry.id}><strong>{entry[state].eligible ? number(entry[state].total) : 'Not ranked'}</strong><small>{comparison[state].leaders.includes(entry.id) ? (comparison[state].leaders.length > 1 ? 'Joint lead' : entries.length > 1 ? 'Leads screen' : 'Screen passed') : ''}</small></td>)}</tr>
            <tr><th scope="row">Homes added</th>{entries.map(entry => <td key={entry.id}>{entry[state].units}{area && <small>{entry[state].area?.units} in whole plan</small>}</td>)}</tr>
            <tr><th scope="row">Dimensions</th>{entries.map(entry => <td key={entry.id}>{entry.option.width} × {entry.option.depth} m<small>{entry.option.height} m high</small></td>)}</tr>
            {comparison.factors.map(f => <tr key={f.id} className={f.included ? '' : 'excluded'}><th scope="row">{FACTOR_LABELS[f.id]}<small>{f.included ? `${(f.effectiveWeight * 100).toFixed(1)}% of score` : 'Excluded'} · {f.kind}</small></th>{entries.map(entry => <td key={entry.id}><span className="comparison-factor"><b>{number(entry[state].scores[f.id])}</b><span className="factor-track"><i style={{ width: `${entry[state].scores[f.id] ?? 0}%`, background: simulatedColor(entry.id) }}/></span></span></td>)}</tr>)}
            <tr><th scope="row">Placement & use</th>{entries.map(entry => <td key={entry.id}><details><summary>{entry[state].eligible ? 'Screen passed' : entry[state].gate}</summary><p>{entry[state].massing.reason}</p><p>{entry[state].permission.label}</p>{entry[state].area?.invalid.map(b => <p key={b.id}>{b.pin}: {b.gate}</p>)}</details></td>)}</tr>
            <tr><th scope="row">Tradeoffs</th>{entries.map(entry => {
              const trade = templateTradeoffs(entry, entries, comparison.factors, state)
              return <td key={entry.id}>{!trade.reference ? <small>{entry[state].eligible ? 'Choose another eligible type to compare.' : 'Resolve placement and use checks first.'}</small> : <div className="card-tradeoffs"><small>vs {trade.reference}</small>{trade.pros.map(f => <p key={f.id} className="pro">+ {f.label}: +{f.points.toFixed(1)} pts</p>)}{trade.cons.map(f => <p key={f.id} className="con">− {f.label}: {f.points.toFixed(1)} pts</p>)}{!trade.pros.length && !trade.cons.length && <p>No material weighted difference.</p>}</div>}</td>
            })}</tr>
            <tr><th scope="row">Infrastructure effect</th>{entries.map(entry => <td key={entry.id}>{entry.baseline.eligible && entry.proposal.eligible && Number.isFinite(entry.delta) ? `${entry.delta >= 0 ? '+' : ''}${number(entry.delta)} points` : 'Eligibility needs review'}</td>)}</tr>
            <tr><th scope="row">Next building</th>{entries.map(entry => <td key={entry.id}><button disabled={pending || entry.id === draft.typeId} onClick={() => onUse(entry.option)}>{entry.id === draft.typeId ? 'Current draft' : 'Use this type'}</button></td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="compact-help">Current draft keeps your custom size and placement. Other columns use standard templates. <button className="comparison-assumptions" onClick={onAssumptions}>Why these scores?</button></p>
    </>}
  </section>
}
