import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * A sliding "liquid drop" behind the active item of a group (segmented control, tab list, side rail).
 * The leading edge moves first and the trailing edge follows a beat later, so the drop stretches and settles.
 * CSS transitions only: one absolutely placed element, measured on change — no canvas, no per-frame JS.
 */
export function useLiquidDrop<T extends HTMLElement>(axis: 'x' | 'y', selector: string) {
  const ref = useRef<T>(null)
  const last = useRef<number | null>(null)
  const [box, setBox] = useState<{ start: number; end: number; crossStart: number; crossSize: number; dir: number; animate: boolean } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const measure = () => {
      const active = el.querySelector<HTMLElement>(selector)
      if (!active) { setBox(null); last.current = null; return }
      const c = el.getBoundingClientRect()
      const r = active.getBoundingClientRect()
      const padLeft = c.left + el.clientLeft
      const padTop = c.top + el.clientTop
      const box = axis === 'x'
        ? { start: r.left - padLeft + el.scrollLeft, end: padLeft + el.clientWidth - r.right - el.scrollLeft, crossStart: r.top - padTop, crossSize: r.height }
        : { start: r.top - padTop + el.scrollTop, end: el.scrollHeight - (r.top - padTop + el.scrollTop + r.height), crossStart: r.left - padLeft, crossSize: r.width }
      const prev = last.current
      last.current = box.start
      setBox((p) => ({ ...box, dir: prev == null ? 0 : Math.sign(box.start - prev) || (p?.dir ?? 0), animate: prev != null }))
    }
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure) }
    measure()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    const mo = new MutationObserver(schedule)
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['data-state', 'data-drop-active'] })
    return () => { ro.disconnect(); mo.disconnect(); cancelAnimationFrame(raf) }
  }, [axis, selector])

  let style: CSSProperties = { display: 'none' }
  if (box) {
    const lag = '70ms'
    const delays = box.dir > 0 ? `${lag}, 0ms` : box.dir < 0 ? `0ms, ${lag}` : '0ms, 0ms'
    style = axis === 'x'
      ? { left: box.start, right: box.end, top: box.crossStart, height: box.crossSize, transitionProperty: 'left, right', transitionDelay: delays }
      : { top: box.start, bottom: box.end, left: box.crossStart, width: box.crossSize, transitionProperty: 'top, bottom', transitionDelay: delays }
  }
  return { ref, style, animate: !!box?.animate }
}
