import { useEffect, useLayoutEffect, useRef } from 'react'
import { ScanBuffer } from '../core/scanner'

/**
 * One global keydown listener; scans go to the most recently mounted handler only.
 * A dialog that must NOT react to scans mounts useScanner(null) to swallow them.
 */
type Handler = ((code: string) => void) | null
const stack: { current: Handler }[] = []
const buffer = new ScanBuffer()
let installed = false

function install() {
  if (installed) return
  installed = true
  document.addEventListener(
    'keydown',
    (e) => {
      const code = buffer.feed(e)
      if (!code) return
      // The scanner's trailing Enter must not also "press" whatever button has focus.
      e.preventDefault()
      e.stopPropagation()
      stack[stack.length - 1]?.current?.(code)
    },
    true,
  )
}

// Listen from app start, so a scan arriving while a screen is still mounting keeps all its digits.
if (typeof document !== 'undefined') install()

export function useScanner(handler: Handler) {
  const ref = useRef<Handler>(handler)
  useLayoutEffect(() => {
    ref.current = handler
  })
  useEffect(() => {
    install()
    stack.push(ref)
    return () => {
      stack.splice(stack.indexOf(ref), 1)
    }
  }, [])
}
