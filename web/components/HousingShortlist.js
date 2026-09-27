import { simulatedColor } from '../lib/buildingUses.js'
import { FACTOR_LABELS, templateTradeoffs } from '../lib/studioPresentation.js'
const number=n=>Number.isFinite(n)?n.toFixed(1):'—'
export default function HousingShortlist({shortlist,slot,proposed,pending,area,onUse,onAssumptions}) {
 if(!shortlist) return <p>Loading housing comparisons…</p>
 const state=proposed?'proposal':'baseline', order=shortlist[state].order
 const entries=[...shortlist.entries].sort((a,b)=>(order.indexOf(a.id)<0?99:order.indexOf(a.id))-(order.indexOf(b.id)<0?99:order.indexOf(b.id)))
 return <section className="studio-rankings" aria-label="Housing rankings" aria-busy={pending}>
  <div className="section-heading"><h3>{area?'Your plan + next building':'Housing at this parcel'}</h3><span>{order.length}/5 ranked</span></div>
  <p className="compact-help">{area?'Whole-plan averages per proposed home.':'Standard templates, under your priorities.'} All factor scores: higher is preferred.</p>
  <p className="coverage-pill">{shortlist.included.length}/7 factors weighted · {proposed?'Proposed':'Existing'} infrastructure <button onClick={onAssumptions}>Assumptions</button></p>
  <ol className="housing-cards">{entries.map(entry=>{
   const option=entry[state], tradeoffs=templateTradeoffs(entry,entries,shortlist.factors,state), rank=order.indexOf(entry.id), leading=shortlist[state].leaders.includes(entry.id)
   return <li key={entry.id} className={`housing-card ${option.eligible?'':'unranked'}`} style={{'--housing-color':simulatedColor(entry.id)}}>
    <div className="housing-card-heading"><div><span className="rank-number">{rank>=0?`${rank+1}.`:'—'}</span><h4>{option.label}</h4></div><strong>{option.eligible?number(option.total):'Review'}</strong></div>
    <div className="card-meta"><span>{option.units} homes{area?` · ${option.area?.units ?? '…'} in plan`:''}</span><span>{leading?(shortlist[state].leaders.length>1?'Joint lead':'Leads screen'):option.eligible?'Screen passed':option.gate}</span></div>
    <div className="mini-factors">{shortlist.factors.map(f=><div key={f.id} className={!f.included?'excluded':''} title={`${f.source} · ${f.kind}${f.exclusion?` · ${f.exclusion}`:''}`}><span>{FACTOR_LABELS[f.id]} <small>{f.kind}</small></span><span className="factor-track"><i style={{width:`${option.scores[f.id]??0}%`}}/></span><b>{number(option.scores[f.id])}</b>{!f.included&&<em>excluded</em>}</div>)}</div>
    {tradeoffs.reference&&<div className="card-tradeoffs"><small>Compared with {tradeoffs.reference}</small>{tradeoffs.pros.length>0&&<p className="pro">+ {tradeoffs.pros.map(f=>`${f.label} +${f.points.toFixed(1)} pts`).join(' · ')}</p>}{tradeoffs.cons.length>0&&<p className="con">− {tradeoffs.cons.map(f=>`${f.label} ${f.points.toFixed(1)} pts`).join(' · ')}</p>}{!tradeoffs.pros.length&&!tradeoffs.cons.length&&<p>No material weighted difference.</p>}</div>}
    {!option.eligible&&<details className="compact-checks"><summary>Why it needs review</summary><p>{option.massing.reason}</p><p>{option.permission.label}</p>{option.area?.invalid.map(b=><p key={b.id}>{b.pin}: {b.gate}</p>)}</details>}
    <div className="card-action"><small>{entry.baseline.eligible&&entry.proposal.eligible&&Number.isFinite(entry.delta)?`${entry.delta>=0?'+':''}${number(entry.delta)} pts with infrastructure`:'Eligibility affects comparison'}</small><button disabled={pending||shortlist.sourceSlot!==slot} onClick={()=>onUse(entry.option)}>Try in {slot} →</button></div>
   </li>
  })}</ol>
 </section>
}
