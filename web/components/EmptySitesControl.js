export default function EmptySitesControl({ enabled, onChange, count, pending, loading, error, zoomedOut }) {
  return <div className="empty-sites-control">
    <div className="empty-sites-row"><label><input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)}/><i aria-hidden="true"/>Highlight empty sites</label>
      {enabled && <span role="status">{error ? 'Unavailable' : zoomedOut ? 'Zoom in' : loading || pending ? 'Checking…' : `${count} in view`}</span>}
    </div>
    {enabled && <details><summary>Candidate screen · what qualifies?</summary>
      <p>Recorded vacant, no mapped building overlap, and at least one standard housing template fits with a by-right use and no supported zoning conflict. Click a highlight to try a fitting template.</p>
      <p>Existing conditions only. Unknown checks remain unassessed. Availability, utilities and development approval need review. Unhighlighted parcels may still have options.</p>
      {loading && <p>Only loaded neighborhoods are screened.</p>}
      {error && <p role="alert">{error}</p>}
    </details>}
  </div>
}
