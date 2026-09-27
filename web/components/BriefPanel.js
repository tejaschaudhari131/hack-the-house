"use client"

import DecisionBrief from "./DecisionBrief.js"

/** Step 3: the decision brief on screen, with print and share. Printing uses the separate print-only copy. */
export default function BriefPanel({ compare, guide, share, onPrint, onBack, briefProps }) {
  return (
    <aside className="panel" id="panel">
      {guide}
      {compare?.result ? (
        <>
          <section className="brief-intro">
            <h2>Your decision brief</h2>
            <p>
              One page to bring to a meeting: both options, whether each is allowed, why they score differently, what
              other priorities do, what is not checked, and three next steps.
            </p>
            <div className="action-row">
              <button type="button" className="explain" onClick={onPrint}>
                Print or save as PDF
              </button>
              <button type="button" className="secondary" onClick={onBack}>
                ← Back to the comparison
              </button>
            </div>
            <details className="more">
              <summary>Save or share this scenario</summary>
              {share}
            </details>
          </section>
          <div className="brief-screen">
            <DecisionBrief compare={compare} {...briefProps} />
          </div>
        </>
      ) : (
        <section className="empty-state">
          <h2>No brief yet</h2>
          <p>Compare two options first (step 2). The brief is built from that comparison.</p>
          <button type="button" className="explain" onClick={onBack}>
            Go to step 2: compare options
          </button>
        </section>
      )}
    </aside>
  )
}
