import { useEffect, useRef, useState } from 'react'

const MIN_WIDTH = 320, DEFAULT_WIDTH = 440

export default function StudioWorkspace({ sidebarOpen, expanded, map, children }) {
  const workspace = useRef(null), drag = useRef(null)
  const [preferredWidth, setPreferredWidth] = useState(DEFAULT_WIDTH)
  const [maxWidth, setMaxWidth] = useState(900)
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setMaxWidth(Math.max(MIN_WIDTH, Math.min(900, entry.contentRect.width - 308))))
    observer.observe(workspace.current)
    return () => observer.disconnect()
  }, [])
  const width = Math.max(MIN_WIDTH, Math.min(maxWidth, preferredWidth))
  function resize(value) { setPreferredWidth(Math.max(MIN_WIDTH, Math.min(maxWidth, value))) }
  function keyResize(event) {
    const step = event.shiftKey ? 80 : 20
    const next = { ArrowLeft: width + step, ArrowRight: width - step, Home: MIN_WIDTH, End: maxWidth, Enter: DEFAULT_WIDTH }[event.key]
    if (next !== undefined) { event.preventDefault(); resize(next) }
  }
  return <div ref={workspace} className={`studio-workspace ${expanded ? 'is-comparing' : ''} ${sidebarOpen ? '' : 'sidebar-collapsed'}`} style={{ '--sidebar-width': `${width}px` }}>
    {map}
    <div className="sidebar-resizer" role="separator" tabIndex={0} aria-label="Resize sidebar" aria-orientation="vertical" aria-controls="planner-inspector" aria-valuemin={MIN_WIDTH} aria-valuemax={maxWidth} aria-valuenow={width} aria-valuetext={`${Math.round(width)} pixels wide`} title="Drag to resize. Arrow keys adjust width; Enter resets."
      onKeyDown={keyResize} onDoubleClick={() => resize(DEFAULT_WIDTH)}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); drag.current = { x: event.clientX, width }; event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { if (drag.current) resize(drag.current.width + drag.current.x - event.clientX) }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
    ><span/></div>
    {children}
  </div>
}
