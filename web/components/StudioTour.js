import { useEffect, useRef, useState } from 'react'

const SEEN_KEY = 'playhouse.studio-tour.v1'
let dismissedThisSession = false
const STEPS = [
  { title: 'Choose a place', target: 'site', tool: 'housing', tab: 'edit',
    text: 'Start in Hazelwood or Lawrenceville. Click a parcel on the map, or search for an address in the sidebar.' },
  { title: 'Try a housing type', target: 'housing', tool: 'housing', tab: 'edit',
    text: 'Cycle through homes to preview them. Green means no supported conflict; red needs review. Add a building when ready, then plan the next one.' },
  { title: 'Compare the tradeoffs', target: 'comparison', tool: 'housing', tab: 'rankings',
    text: 'Use “Compare to” for side-by-side housing scores. Physical or supported zoning conflicts remove the score; unsupported rules stay marked “Not assessed”.' },
  { title: 'Set your priorities', target: 'inspector', tool: 'housing', tab: 'priorities',
    text: 'Move the sliders to change what matters most. Their relative levels set the ranking. Assumptions holds exact income, rent and building-size inputs.' },
  { title: 'Test infrastructure', target: 'tools', tool: 'service', tab: 'edit',
    text: 'Transit tests extra bus service. Infra adds paths, streets and parks. Compare Baseline and Proposal to see the effects supported by the data.' },
  { title: 'Keep your work', target: 'export', tool: 'housing', tab: 'rankings',
    text: 'Export your scenario before reloading to keep a copy. Your plan is local to this session. Use the Tour button any time to replay these steps.' },
]

/** Native modal supplies focus containment and makes the background inert. No tour dependency. */
export default function StudioTour({ startRequest, onStep, onFinish, triggerRef }) {
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
  }, [open, current])

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
    <div className="tour-top"><span>QUICK TOUR · {step + 1} / {STEPS.length}</span><button onClick={finish} aria-label="Skip tour">Skip</button></div>
    <h2 id="studio-tour-title" ref={title} tabIndex={-1}>{current.title}</h2>
    <p id="studio-tour-description">{current.text}</p>
    <div className="tour-progress" aria-hidden="true">{STEPS.map((item, i) => <i key={item.title} className={i === step ? 'active' : ''}/>)}</div>
    <div className="tour-actions"><button disabled={step === 0} onClick={() => move(step - 1)}>Back</button><button className="tour-next" onClick={() => step === STEPS.length - 1 ? finish() : move(step + 1)}>{step === STEPS.length - 1 ? 'Start planning' : 'Next'}</button></div>
  </dialog>
}
