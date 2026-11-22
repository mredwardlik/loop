/**
 * loop: runs a list of steps over and over. Every step has its own condition,
 * delay and store; all steps share a common store and a context.
 *
 *   iteration:  step 1 → step 2 → … → step N   then wait `delay`, repeat
 *
 * No dependencies, works in browsers and in Node.
 */

const DEFAULTS = { delay: 1000, store: {}, limit: Infinity }

/**
 * Wait `ms` milliseconds or until `signal` is aborted, whichever comes first.
 * A timer is used even for 0 ms, so a loop never blocks the page.
 */
export function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, Math.max(0, ms))
    signal?.addEventListener('abort', done, { once: true })
  })
}

function check(condition, message) {
  if (!condition) throw new TypeError(message)
}

function isDelay(value) {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value)
}

function makeStep(config, index) {
  check(config && typeof config === 'object', `step ${index + 1} must be an object`)
  const { name, body, condition = () => true, delay = 0, store = {}, enabled = true } = config
  check(typeof name === 'string' && name !== '', `step ${index + 1} needs a name`)
  check(typeof body === 'function', `step "${name}" needs a body function`)
  check(typeof condition === 'function', `the condition of step "${name}" must be a function`)
  check(isDelay(delay), `the delay of step "${name}" must be a number of milliseconds`)
  return {
    name,
    body,
    condition,
    delay,
    store,
    enabled: Boolean(enabled),
    iterations: 0,
    result: undefined,
  }
}

/** What every `body` and `condition` receives as its argument. */
export class Context {
  #loop

  constructor(loop) {
    this.#loop = loop
  }

  /** The common store, or the store of step `name`. */
  store(name) {
    return name === undefined ? this.#loop.store : this.#loop.step(name).store
  }

  /** The step that is being checked or run now. */
  current() {
    return this.#loop.current
  }

  /** What step `name` returned the last time it ran. */
  result(name) {
    return this.#loop.step(name).result
  }

  /** How many iterations have finished, or how many times step `name` has run. */
  iterations(name) {
    return name === undefined ? this.#loop.iterations : this.#loop.step(name).iterations
  }

  /** All steps, in order. */
  steps() {
    return this.#loop.steps
  }

  /** Stop the whole loop, or turn off only step `name`. */
  stop(name) {
    if (name === undefined) this.#loop.stop()
    else this.#loop.disable(name)
  }

  /** Turn step `name` on again. */
  resume(name) {
    this.#loop.enable(name)
  }

  /** `await ctx.delay(300)` pauses inside a step; stopping the loop ends the pause early. */
  delay(ms) {
    return sleep(ms, this.#loop.signal)
  }
}

export class Loop {
  #controller = new AbortController()
  #running = null
  #steps = new Map()

  /**
   * @param {object} [config]
   * @param {number} [config.delay=1000] pause between iterations, ms
   * @param {object[]} [config.steps] the steps, run in this order (`methods` works too)
   * @param {object} [config.store] the common store
   * @param {number} [config.limit=Infinity] stop after this many iterations
   * @param {(error: Error, ctx: Context) => void} [config.onError] called when a step throws;
   *   without it the error stops the loop and rejects `start()`
   */
  constructor(config = {}) {
    const options = { ...DEFAULTS, ...config }
    check(isDelay(options.delay), 'delay must be a number of milliseconds')
    check(options.limit === Infinity || (Number.isInteger(options.limit) && options.limit >= 0),
      'limit must be a whole number of iterations')
    check(options.onError === undefined || typeof options.onError === 'function', 'onError must be a function')
    const steps = options.steps ?? options.methods ?? []
    check(Array.isArray(steps), 'steps must be an array')
    steps.forEach((config, index) => {
      const step = makeStep(config, index)
      check(!this.#steps.has(step.name), `two steps are called "${step.name}"`)
      this.#steps.set(step.name, step)
    })
    this.delay = options.delay
    this.limit = options.limit
    this.store = options.store
    this.onError = options.onError
    this.iterations = 0
    this.current = null
    this.context = new Context(this)
  }

  get steps() {
    return [...this.#steps.values()]
  }

  get signal() {
    return this.#controller.signal
  }

  get running() {
    return this.#running !== null
  }

  get stopped() {
    return this.signal.aborted
  }

  step(name) {
    const step = this.#steps.get(name)
    if (!step) throw new Error(`there is no step called "${name}"`)
    return step
  }

  enable(name) {
    this.step(name).enabled = true
  }

  disable(name) {
    this.step(name).enabled = false
  }

  /**
   * Run the loop. Resolves with the number of finished iterations once it is
   * stopped or reaches `limit`. Calling it while it runs returns the same promise.
   */
  start() {
    if (this.#running) return this.#running
    if (this.stopped) this.#controller = new AbortController() // started again after a stop
    this.#running = this.#run().finally(() => {
      this.#running = null
      this.current = null
    })
    return this.#running
  }

  /** Stop after the step that is running now; pauses end at once. */
  stop() {
    this.#controller.abort()
  }

  /** The old name of `stop()`. */
  stopLoop() {
    this.stop()
  }

  async #run() {
    let first = true
    while (!this.stopped && this.iterations < this.limit) {
      if (!first) await sleep(this.delay, this.signal)
      first = false
      if (this.stopped) break
      let complete = true
      for (const step of this.#steps.values()) {
        if (this.stopped) {
          complete = false
          break
        }
        await this.#runStep(step)
      }
      this.current = null
      if (complete) this.iterations++
    }
    return this.iterations
  }

  async #runStep(step) {
    this.current = step
    try {
      if (!step.enabled || !(await step.condition(this.context))) return
      if (step.delay) await sleep(step.delay, this.signal)
      if (this.stopped) return
      step.result = await step.body(this.context)
      step.iterations++
    } catch (error) {
      if (!this.onError) {
        this.stop()
        throw error
      }
      this.onError(error, this.context)
    }
  }
}

export default Loop
