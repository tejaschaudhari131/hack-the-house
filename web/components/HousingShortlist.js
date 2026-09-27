import { useEffect, useState } from 'react'
import { BUILDINGS } from '../lib/buildings.js'

const number = value => Number.isFinite(value) ? value.toFixed(1) : 'Unknown'
const delta = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}` : 'Excluded'
const cash = value => Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const leaders = values => values.length ? values.map(id => BUILDINGS[id].label).join(' / ') : 'No ranked template'
const total = option => option.eligible && Number.isFinite(option.total) ? number(option.total) : 'Not ranked'

export default function HousingShortlist({ shortlist, slot, proposed, pending, showExpanded, area, onUse }) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { if (showExpanded) setExpanded(true) }, [showExpanded])
  if (!shortlist) return null
  const state = proposed ? 'proposal' : 'baseline'
  const waiting = pending || shortlist.sourceSlot !== slot
  const order = shortlist[state].order
  const entries = [...shortlist.entries].sort((a, b) => {
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })
  return <section className="housing-shortlist" aria-label="Housing shortlist" aria-busy={waiting}>
    <button className="shortlist-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <span><strong>{area ? 'Area plan + next building' : 'Housing shortlist'}</strong><small>{waiting ? 'Updating all five templates…' : `${shortlist[state].order.length} of 5 templates ranked · ${proposed ? 'proposal' : 'baseline'}`}</small></span><span aria-hidden="true">{expanded ? '−' : '+'}</span>
    </button>
    {expanded && <div className="shortlist-content">
      <p>{area ? 'Compares your placed plan plus each next-building template. Factor scores are averages per proposed home, with shared transit capacity.' : 'All five standard housing templates, screened after each scenario edit.'} Preview one in option {slot} to examine or customize it.</p>
      <p className="shortlist-assumptions"><strong>Common assumptions:</strong> option {shortlist.sourceSlot}’s {cash(shortlist.assumptions.rent)} rent + {cash(shortlist.assumptions.utilities)} utilities per home/month; {cash(shortlist.assumptions.targetIncome)} target annual income. Standard dimensions and automatic placement replace any custom size or position when previewed. These are assumptions, not rent forecasts or calculated dwelling capacity.</p>
      <div className="shortlist-leaders"><p><span>Baseline lead</span><strong>{leaders(shortlist.baseline.leaders)}</strong></p><p><span>Proposal lead</span><strong>{leaders(shortlist.proposal.leaders)}</strong></p></div>
      <p>{shortlist.explanation}</p>
      <p className="shortlist-coverage">{shortlist.included.length}/7 factors weighted across all five templates in both states. A/B may use different shared coverage; compare totals within the same panel.</p>
      {!!shortlist.excluded.length && <details className="shortlist-evidence"><summary>Excluded factors</summary>{shortlist.factors.filter(f => !f.included).map(f => <p key={f.id}><strong>{f.short}:</strong> {f.exclusion}</p>)}</details>}
      <details className="shortlist-evidence"><summary>Factor sources & effective weights</summary>{shortlist.factors.map(f => <p key={f.id}><strong>{f.short} · {f.included ? `${(f.effectiveWeight * 100).toFixed(1)}%` : 'Excluded'}:</strong> {f.source} ({f.kind.toLowerCase()}).</p>)}</details>
      <ul className="shortlist-entries">{entries.map(entry => <li key={entry.id} className={shortlist[state].leaders.includes(entry.id) ? 'shortlist-leading' : ''}>
        <div className="shortlist-entry-heading"><h4>{entry.baseline.label}</h4>{shortlist[state].leaders.includes(entry.id) && <span className="data-badge">{shortlist[state].leaders.length > 1 ? 'Joint lead' : 'Leads screen'}</span>}</div>
        <p className="shortlist-dimensions">{entry.baseline.units} proposed {entry.baseline.units === 1 ? 'home' : 'homes'} · {entry.option.width} × {entry.option.depth} m · {entry.option.height} m high</p>
        <div className="shortlist-scores"><div><span>Baseline</span><strong>{total(entry.baseline)}</strong></div><div><span>Proposal</span><strong>{total(entry.proposal)}</strong></div></div>
        <p className="shortlist-gate">{entry[state].gate}</p>
        <details className="shortlist-evidence"><summary>Seven factors & checks</summary>
          <p><strong>Baseline:</strong> {entry.baseline.gate}. {entry.baseline.massing.reason}</p>
          <p><strong>Proposal:</strong> {entry.proposal.gate}. {entry.proposal.massing.reason}</p>
          <p><strong>Checked use:</strong> {entry[state].permission.label}. Detailed zoning, utilities, ownership, engineering and financing remain unreviewed.</p>
          {['triplex', 'small_apartment'].includes(entry.id) && <p>Triplex and 12-home templates share the source small-apartment demand and carbon proxies. Their home counts affect assumed boarding demand when capacity is evaluated.</p>}
          <div className="audit-table-wrap"><table className="audit-table"><caption>{entry.baseline.label}: factor scores and weighted infrastructure change</caption><thead><tr><th>Factor</th><th>Before</th><th>After</th><th>Δ points</th></tr></thead><tbody>{entry.factors.map(f => <tr key={f.id}><th>{shortlist.factors.find(meta => meta.id === f.id).short}</th><td>{number(f.before)}</td><td>{number(f.after)}</td><td>{delta(f.weightedDelta)}</td></tr>)}</tbody></table></div>
          <p>Δ points use this shortlist’s common weights. Excluded factors contribute no points; a failed eligibility check prevents ranking regardless of score.</p>
        </details>
        <button className="shortlist-preview" disabled={waiting} onClick={() => onUse(entry.option)} aria-label={`Preview ${entry.baseline.label} in ${slot}`}>Preview in {slot} <span aria-hidden="true">↗</span></button>
      </li>)}</ul>
      <p className="shortlist-caveat">A screening shortlist for these templates only. An unsuccessful placement search does not prove that no design could fit. Close scores are treated as ties, not statistical confidence.</p>
    </div>}
  </section>
}
