import { housingPermission, housingSpec, housingUseOptions } from '../lib/titleNine.js'
import { resolveZoning } from '../lib/zoning.js'

const labels = { permitted: 'By right · use only', not_permitted: 'Not permitted', special: 'Needs approval / conditions', unknown: 'Not assessed', partial: 'Depends on unit count' }

export default function SiteZoning({ properties, zoning, option, showHousing }) {
  const code = properties.zoning_code
  const district = resolveZoning(code, zoning)
  const permission = housingPermission(option, code, zoning)
  const districtLabel = district.district?.label || properties.zoning_label
  return <div className="site-zoning">
    <dl className="site-records">
      <div><dt>Recorded use</dt><dd>{properties.land_use || 'Unknown'} <small>County assessment</small></dd></div>
      <div><dt>Mapped zoning</dt><dd>{code || 'Unknown'}{code && districtLabel && <small>{districtLabel}</small>}</dd></div>
    </dl>
    {properties.city_owned && <div className="site-tags"><span>City inventory</span></div>}
    {showHousing && <>
      <div className={`proposed-use ${permission.category}`}><span>Proposed use · {housingSpec(option).label}</span><strong>{labels[permission.category]}</strong></div>
      <details className="housing-permissions">
        <summary>Housing use permissions</summary>
        <p className="compact-help">Existing use does not decide what you can build. These are mapped district use rules; fit, dimensions and other checks still apply.</p>
        <ul>{housingUseOptions(code, zoning).map(item => <li key={item.useRow + item.typeId} className={item.permission.category}><span>{item.label}</span><strong>{labels[item.permission.category]}</strong></li>)}</ul>
        {district.codeUrl && <a href={district.codeUrl} target="_blank" rel="noreferrer">Source: {district.codeSection || 'district review'} ↗</a>}
      </details>
    </>}
  </div>
}
