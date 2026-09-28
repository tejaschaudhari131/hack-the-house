import { useEffect, useRef, useState } from 'react'
import { TOUR_STEPS as STEPS } from '../lib/studioTour.js'

const SEEN_KEY = 'playhouse.studio-tour.v2'
let dismissedThisSession = false

/** Native modal supplies focus containment and makes the background inert. No tour dependency. */
export default function StudioTour({ startRequest, onStep, onFinish, triggerRef, ready, error, evidence, onRetry }) {
  const dialog = useRef(null), title = useRef(null)
  const [open, setOpen] = useState(false), [step, setStep] = useState(0)
  const current = STEPS[step]

  useEffect(() => {
    let seen = dismissedThisSession
    try { seen ||= window.localStorage.getItem(SEEN_KEY) === 'seen' } catch { /* Storage may be disabled. */ }
    if (startRequest > 0 || !seen) {
      onStep(STEPS[0]); setStep(0); setOpen(true)
    }
  }, [startRequest, onStep])

  useEffect(() => {
    const node = dialog.current
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
    return () => { if (node.open) node.close() }
  }, [open])

  useEffect(() => {
    if (!open) return
    let target
    const frame = requestAnimationFrame(() => {
      target = document.querySelector(`[data-tour="${current.target}"]`)
      target?.classList.add('tour-highlight')
      if (window.matchMedia('(max-width: 760px)').matches) target?.scrollIntoView({ block: 'center' })
      title.current?.focus({ preventScroll: true })
    })
    return () => { cancelAnimationFrame(frame); target?.classList.remove('tour-highlight') }
  }, [open, current, ready])

  function finish() {
    dismissedThisSession = true
    try { window.localStorage.setItem(SEEN_KEY, 'seen') } catch { /* Still dismiss for this session. */ }
    setOpen(false)
    onFinish()
    // Closing the native modal restores background focusability before focusing the replay button.
    dialog.current?.close()
    triggerRef.current?.focus({ preventScroll: true })
  }
  function move(next) { onStep(STEPS[next]); setStep(next) }

  return <dialog ref={dialog} className="studio-tour" aria-labelledby="studio-tour-title" aria-describedby="studio-tour-description" onCancel={event => { event.preventDefault(); finish() }}>
    <div className="tour-top"><span>HAZELWOOD EXAMPLE · {step + 1} / {STEPS.length}</span><button onClick={finish} aria-label="Skip tour">Skip</button></div>
    <h2 id="studio-tour-title" ref={title} tabIndex={-1}>{current.title}</h2>
    <p id="studio-tour-description">{current.text}</p>
    <p className="tour-evidence" role="status">{error ? `Example unavailable: ${error}` : ready ? evidence : 'Loading the example and recalculating…'}</p>
    {error && <button onClick={onRetry}>Retry example</button>}
    <div className="tour-progress" aria-hidden="true">{STEPS.map((item, i) => <i key={item.title} className={i === step ? 'active' : ''}/>)}</div>
    <div className="tour-actions"><button disabled={step === 0 || !ready} onClick={() => move(step - 1)}>Back</button><button className="tour-next" disabled={!ready} onClick={() => step === STEPS.length - 1 ? finish() : move(step + 1)}>{step === STEPS.length - 1 ? 'Return to my plan' : 'Next'}</button></div>
  </dialog>
}
