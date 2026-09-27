import { INITIAL_WEIGHTS } from './plannerState.js'
import { passesRecordFilters, DEFAULT_SITE_FILTERS, typePermission } from './sites.js'
import { resolveZoning } from './zoning.js'
export const FACTOR_LABELS = { demand: 'Market & lot fit', physical: 'Physical fit', affordability: 'Affordability', displacement: 'Lower displacement risk', capacity: 'Transit capacity', access: 'Access', carbon: 'Carbon proxy' }
export const STUDIO_PRESETS = [
 { id:'balanced', label:'Balanced', weights:{...INITIAL_WEIGHTS} },
 { id:'resident', label:'Resident', weights:{demand:5,physical:15,affordability:25,displacement:30,capacity:5,access:15,carbon:5} },
 { id:'cdc', label:'CDC', weights:{demand:5,physical:10,affordability:40,displacement:20,capacity:5,access:15,carbon:5} },
 { id:'developer', label:'Developer', weights:{demand:40,physical:25,affordability:10,displacement:5,capacity:10,access:5,carbon:5} },
 { id:'climate', label:'Carbon-first', weights:{demand:5,physical:10,affordability:15,displacement:10,capacity:5,access:20,carbon:35} },
]
/** Exact relative contributions against the best other eligible template, no invented outcomes. */
export function templateTradeoffs(entry, entries, factors, state) {
 const candidate=entry[state]
 const reference=entries.filter(e=>e.id!==entry.id && e[state].eligible && Number.isFinite(e[state].total)).sort((a,b)=>b[state].total-a[state].total)[0]
 if(!reference || !candidate.eligible) return {reference:null,pros:[],cons:[]}
 const changes=factors.filter(f=>f.included).map(f=>({id:f.id,label:FACTOR_LABELS[f.id],points:(candidate.scores[f.id]-reference[state].scores[f.id])*f.effectiveWeight}))
 return {reference:reference[state].label,pros:changes.filter(f=>f.points>=.05).sort((a,b)=>b.points-a.points).slice(0,2),cons:changes.filter(f=>f.points<=-.05).sort((a,b)=>a.points-b.points).slice(0,2)}
}
export function studioSites(parcels, zoning, area, filters) {
 const query=(filters.query||'').trim().toLowerCase()
 return parcels.features.filter(f=>{
  const p=f.properties
  if(!passesRecordFilters(p,{...DEFAULT_SITE_FILTERS,...filters,area})) return false
  if(query && !`${p.address||''} ${p.pin}`.toLowerCase().includes(query)) return false
  if(filters.typeId && typePermission(filters.typeId,resolveZoning(p.zoning_code,zoning))!=='by_right' && typePermission(filters.typeId,resolveZoning(p.zoning_code,zoning))!=='partial') return false
  return true
 }).sort((a,b)=>Number(!a.properties.address)-Number(!b.properties.address)||(a.properties.address||a.properties.pin).localeCompare(b.properties.address||b.properties.pin, undefined, {numeric:true}))
}
