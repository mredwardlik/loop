export type Store = Record<string, any>

export interface StepConfig<S extends Store = Store, L extends Store = Store> {
  /** Unique name of the step. */
  name: string
  /** The work of the step, sync or async. What it returns is kept as its result. */
  body: (ctx: Context<S>) => unknown
  /** The step runs only when this returns true. Default: always. */
  condition?: (ctx: Context<S>) => boolean | Promise<boolean>
  /** Pause before the body runs, ms. Default: 0. */
  delay?: number
  /** The own store of the step. */
  store?: L
  /** Start with the step turned off. Default: true. */
  enabled?: boolean
}

export interface Step<L extends Store = Store> {
  readonly name: string
  readonly delay: number
  readonly store: L
  enabled: boolean
  /** How many times the body has run. */
  iterations: number
  /** What the body returned the last time. */
  result: unknown
}

export interface LoopConfig<S extends Store = Store> {
  /** Pause between iterations, ms. Default: 1000. */
  delay?: number
  /** The steps, run in this order. */
  steps?: StepConfig<S>[]
  /** The old name of `steps`. */
  methods?: StepConfig<S>[]
  /** The store shared by all steps. */
  store?: S
  /** Stop after this many iterations. Default: Infinity. */
  limit?: number
  /** Called when a step throws. Without it the error stops the loop and rejects `start()`. */
  onError?: (error: unknown, ctx: Context<S>) => void
}

export declare class Context<S extends Store = Store> {
  /** The common store. */
  store(): S
  /** The store of step `name`. */
  store<L extends Store = Store>(name: string): L
  /** The step that is being checked or run now. */
  current(): Step | null
  /** What step `name` returned the last time it ran. */
  result(name: string): unknown
  /** Finished iterations, or how many times step `name` has run. */
  iterations(name?: string): number
  /** All steps, in order. */
  steps(): Step[]
  /** Stop the whole loop, or turn off only step `name`. */
  stop(name?: string): void
  /** Turn step `name` on again. */
  resume(name: string): void
  /** Pause inside a step; stopping the loop ends the pause early. */
  delay(ms: number): Promise<void>
}

export declare class Loop<S extends Store = Store> {
  constructor(config?: LoopConfig<S>)
  delay: number
  limit: number
  readonly store: S
  readonly context: Context<S>
  /** Finished iterations. */
  readonly iterations: number
  /** The step that is being checked or run now. */
  readonly current: Step | null
  readonly steps: Step[]
  readonly running: boolean
  readonly stopped: boolean
  step(name: string): Step
  enable(name: string): void
  disable(name: string): void
  /** Run the loop; resolves with the number of iterations once it stops. */
  start(): Promise<number>
  /** Stop after the step that is running now. */
  stop(): void
  /** The old name of `stop()`. */
  stopLoop(): void
}

/** Wait `ms` milliseconds or until `signal` is aborted. */
export declare function sleep(ms: number, signal?: AbortSignal): Promise<void>

export default Loop
