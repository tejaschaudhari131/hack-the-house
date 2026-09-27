import { FACTOR_LABELS } from '../lib/studioPresentation.js'
const number = value => Number.isFinite(value) ? value.toFixed(1) : 'Unknown'
const delta = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}` : 'Excluded'

export default function RecommendationAudit({ result, proposed, options }) {
  const audit = result.audit
  if (!audit) return null
  const ids = Object.keys(options), state = proposed ? 'proposal' : 'baseline', sensitivity = audit.sensitivity[state]
  const winnerName = winner => winner === 'tie' ? 'a tie' : options[winner]?.label || 'no eligible type'
  return <section className="recommendation-audit" aria-label="Recommendation evidence">
    <div className="section-heading"><h3>Why these scores?</h3><span className="data-badge">Traceable</span></div>
    <p className="section-help">Selected housing types share the same infrastructure scenario and usable evidence.</p>
    <details className="planner-details" open><summary>What changed with infrastructure?</summary><div className="audit-table-wrap"><table className="audit-table"><caption>Weighted score change, proposal minus baseline</caption><thead><tr><th>Factor</th>{ids.map(id => <th key={id}>{options[id].label}</th>)}</tr></thead><tbody>{audit.factors.map(f => <tr key={f.id}><th>{FACTOR_LABELS[f.id]}</th>{ids.map(id => <td key={id}>{delta(f.values[id].weightedDelta)}</td>)}</tr>)}</tbody></table></div><p>Zero means no modeled change. Excluded means missing evidence or zero priority.</p>{audit.factors.map(f => <details key={f.id} className="audit-factor"><summary>{FACTOR_LABELS[f.id]} · {f.included ? `${(f.effectiveWeight * 100).toFixed(1)}% of score` : 'Excluded'}</summary><p>{f.effect}</p>{ids.map(id => <p key={id}>{options[id].label}: {number(f.values[id].before)} → {number(f.values[id].after)} / 100.</p>)}{f.exclusion && <p>{f.exclusion}</p>}<small>Source: {f.source}</small></details>)}</details>
    <details className="planner-details"><summary>Does the lead depend on priorities?</summary>{!sensitivity.applicable ? <p>Select at least two eligible types and enable a factor with available evidence.</p> : <><p>Each included priority is varied by −25% and +25%, one at a time, holding the evidence fixed. This checks preferences, not statistical confidence.</p><strong>{sensitivity.changedCases.length ? `${sensitivity.changedCases.length} of ${sensitivity.cases.length} checks change the result.` : `Same result in all ${sensitivity.cases.length} checks.`}</strong><ul>{sensitivity.changedCases.map(c => <li key={`${c.factor}-${c.multiplier}`}>{FACTOR_LABELS[c.factor]} {c.multiplier < 1 ? '−25%' : '+25%'} → {winnerName(c.winner)}</li>)}</ul></>}</details>
    <details className="planner-details"><summary>Evidence gaps & feasibility review</summary><p>Passing the outline and use screen does not establish development feasibility.</p><ul>{audit.hazards.map(h => <li key={h.id}>{h.label}: {h.overlap === null ? 'unknown — needs review' : `${(h.overlap * 100).toFixed(1)}% overlap${h.review ? ' — needs review' : ' in this source'}`}</li>)}</ul><strong>Still unreviewed</strong><ul>{audit.unreviewed.map(note => <li key={note}>{note}</li>)}</ul>{audit.sourceNotes.length > 0 && <><strong>Source caveats for this parcel</strong><ul>{audit.sourceNotes.map(note => <li key={note}>{note}</li>)}</ul></>}</details>
  </section>
}
