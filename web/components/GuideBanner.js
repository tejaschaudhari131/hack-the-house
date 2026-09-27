"use client"

const STEPS = ["Shortlist", "Compare", "Brief"]

/** Step indicator and next action for the guided example. */
export default function GuideBanner({ guide, onNext, onExit, onPrint }) {
  if (!guide) return null
  const step = guide.step
  const place = guide.address ? `${guide.address} (PIN ${guide.pin})` : `PIN ${guide.pin}`
  return (
    <section className="guide-banner" aria-live="polite">
      <ol className="guide-steps" aria-label="Guided example steps">
        {STEPS.map((name, index) => (
          <li key={name} className={index + 1 === step ? "on" : index + 1 < step ? "done" : ""} aria-current={index + 1 === step ? "step" : undefined}>
            {index + 1}. {name}
          </li>
        ))}
      </ol>
      {!guide.pin ? (
        <p>No parcel matches the example question with the current data, so the guided example cannot continue.</p>
      ) : step === 1 ? (
        <>
          <p>
            <strong>Question:</strong> {guide.query.label}.
          </p>
          <p>
            {guide.count} parcels match. The top match under the current weights is {place}. A City inventory record is
            not availability; that is one of the things to verify.
          </p>
          <button type="button" className="explain" onClick={onNext}>
            Compare two housing options on this parcel →
          </button>
        </>
      ) : step === 2 ? (
        <>
          <p>
            Scenario A is a triplex (3 units, the §911.02 Three-Unit row); scenario B is the best-scoring other building
            permitted by right on the same lot. Permission is shown apart from the score. Try a viewpoint under Weights
            and watch whether the order holds.
          </p>
          <button type="button" className="explain" onClick={onNext}>
            Next: the decision brief →
          </button>
        </>
      ) : (
        <>
          <p>
            The brief has both scenarios, permission, the points each factor adds, what other priorities do, what is not
            evaluated, three next steps, and the sources. Print it or save it as a PDF.
          </p>
          <button type="button" className="explain" onClick={onPrint}>
            Print decision brief
          </button>
        </>
      )}
      <p>
        <button type="button" className="text-button" onClick={onExit}>
          Exit the guided example
        </button>
      </p>
    </section>
  )
}
