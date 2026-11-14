import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { isValidEan13 } from '../core/barcode'

/** Renders EAN-13 when valid (our own codes), otherwise Code 128 (supplier codes). Scales to its box. */
export function BarcodeSvg({ value, className = '', fontSize = 14 }: { value: string; className?: string; fontSize?: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    JsBarcode(svg, value, {
      format: isValidEan13(value) ? 'EAN13' : 'CODE128',
      width: 2,
      height: 60,
      fontSize,
      margin: 0,
      flat: true,
    })
    // Make it scale with CSS instead of fixed pixels.
    const w = svg.getAttribute('width')!.replace('px', '')
    const h = svg.getAttribute('height')!.replace('px', '')
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    svg.removeAttribute('width')
    svg.removeAttribute('height')
  }, [value, fontSize])
  return <svg ref={ref} className={className} />
}
