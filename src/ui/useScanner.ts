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
      if (code) stack[stack.length - 1]?.current?.(code)
    },
    true,
  )
}

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
