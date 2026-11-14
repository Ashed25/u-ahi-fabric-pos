let ctx: AudioContext | undefined

function tone(freq: number, ms: number, type: OscillatorType = 'sine', delayMs = 0) {
  try {
    ctx ??= new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.value = freq
    g.gain.value = 0.3
    o.connect(g).connect(ctx.destination)
    const t = ctx.currentTime + delayMs / 1000
    o.start(t)
    o.stop(t + ms / 1000)
  } catch {
    // no audio available: silent is fine
  }
}

/** Short high beep: scan OK */
export const beepOk = () => tone(1200, 120)
/** Low double buzz: not found / error */
export const beepError = () => {
  tone(300, 250, 'square')
  tone(200, 350, 'square', 300)
}
