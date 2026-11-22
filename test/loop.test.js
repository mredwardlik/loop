import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import Loop, { Context, sleep } from '../src/loop.js'

const steps = (...names) => names.map((name) => ({ name, body: () => name }))

describe('running', () => {
  test('steps run in order, once per iteration', async () => {
    const seen = []
    const loop = new Loop({
      delay: 0,
      limit: 3,
      steps: ['a', 'b', 'c'].map((name) => ({ name, body: () => seen.push(name) })),
    })
    assert.equal(await loop.start(), 3)
    assert.deepEqual(seen, ['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c'])
  })

  test('async and sync bodies; results are kept', async () => {
    const loop = new Loop({
      delay: 0,
      limit: 1,
      steps: [
        { name: 'sync', body: () => 1 },
        { name: 'async', body: async (ctx) => ctx.result('sync') + 1 },
      ],
    })
    await loop.start()
    assert.equal(loop.context.result('async'), 2)
  })

  test('condition decides whether a step runs', async () => {
    const loop = new Loop({
      delay: 0,
      limit: 6,
      steps: [{ name: 'even', condition: (ctx) => ctx.iterations() % 2 === 0, body: () => {} }],
    })
    await loop.start()
    assert.equal(loop.step('even').iterations, 3)
  })

  test('the delay is between iterations, not before the first one', async () => {
    const times = []
    const loop = new Loop({ delay: 60, limit: 3, steps: [{ name: 'tick', body: () => times.push(Date.now()) }] })
    const started = Date.now()
    await loop.start()
    assert.ok(times[0] - started < 40)
    assert.ok(times[1] - times[0] >= 50)
    assert.ok(times[2] - times[1] >= 50)
  })

  test('a step delay comes before its body', async () => {
    let ran = 0
    const loop = new Loop({ delay: 0, limit: 1, steps: [{ name: 'slow', delay: 80, body: () => (ran = Date.now()) }] })
    const started = Date.now()
    await loop.start()
    assert.ok(ran - started >= 70)
  })

  test('a loop with delay 0 and nothing to do does not block timers', async () => {
    const loop = new Loop({ delay: 0, steps: [{ name: 'never', condition: () => false, body: () => {} }] })
    const running = loop.start()
    let fired = false
    setTimeout(() => {
      fired = true
      loop.stop()
    }, 20)
    await running
    assert.equal(fired, true)
    assert.ok(loop.iterations > 0)
  })

  test('start() while running returns the same promise', async () => {
    const loop = new Loop({ delay: 0, limit: 2, steps: steps('a') })
    assert.equal(loop.start(), loop.start())
    await loop.start()
    assert.equal(loop.running, false)
  })
})

describe('stopping', () => {
  test('ctx.stop() ends the loop after the current step', async () => {
    const seen = []
    const loop = new Loop({
      delay: 0,
      steps: [
        { name: 'a', body: (ctx) => { seen.push('a'); if (ctx.iterations() === 1) ctx.stop() } },
        { name: 'b', body: () => seen.push('b') },
      ],
    })
    assert.equal(await loop.start(), 1)
    assert.deepEqual(seen, ['a', 'b', 'a'])
  })

  test('stop() during a long pause ends it at once', async () => {
    const loop = new Loop({ delay: 10_000, steps: steps('a') })
    const running = loop.start()
    await sleep(20)
    const started = Date.now()
    loop.stop()
    await running
    assert.ok(Date.now() - started < 100)
  })

  test('a step stopped while waiting for its delay does not run', async () => {
    let ran = false
    const loop = new Loop({ delay: 0, steps: [{ name: 'late', delay: 5000, body: () => (ran = true) }] })
    const running = loop.start()
    await sleep(20)
    loop.stop()
    await running
    assert.equal(ran, false)
  })

  test('ctx.delay() inside a step is cut short by stop()', async () => {
    const loop = new Loop({ delay: 0, steps: [{ name: 'wait', body: (ctx) => ctx.delay(10_000) }] })
    const running = loop.start()
    await sleep(20)
    const started = Date.now()
    loop.stopLoop()
    await running
    assert.ok(Date.now() - started < 100)
  })

  test('a stopped loop can start again', async () => {
    const loop = new Loop({ delay: 0, limit: 2, steps: steps('a') })
    loop.stop()
    assert.equal(await loop.start(), 2)
  })

  test('turning one step off and on', async () => {
    const loop = new Loop({
      delay: 0,
      limit: 5,
      steps: [
        { name: 'switch', body: (ctx) => (ctx.iterations() === 1 ? ctx.stop('work') : ctx.iterations() === 3 && ctx.resume('work')) },
        { name: 'work', body: () => {} },
        { name: 'off', enabled: false, body: () => {} },
      ],
    })
    await loop.start()
    assert.equal(loop.step('work').iterations, 3) // iterations 0, 3 and 4
    assert.equal(loop.step('off').iterations, 0)
  })
})

describe('context', () => {
  test('stores, current step, steps and iterations', async () => {
    const seen = {}
    const loop = new Loop({
      delay: 0,
      limit: 2,
      store: { shared: 0 },
      steps: [
        {
          name: 'count',
          store: { own: 0 },
          condition: (ctx) => ctx.current().name === 'count',
          body: (ctx) => {
            ctx.store().shared++
            ctx.store('count').own += 10
            seen.current = ctx.current().name
            seen.names = ctx.steps().map((step) => step.name)
          },
        },
      ],
    })
    await loop.start()
    assert.equal(loop.store.shared, 2)
    assert.equal(loop.context.store('count').own, 20)
    assert.equal(loop.context.iterations('count'), 2)
    assert.equal(loop.context.iterations(), 2)
    assert.deepEqual(seen, { current: 'count', names: ['count'] })
    assert.equal(loop.current, null)
    assert.ok(loop.context instanceof Context)
  })

  test('unknown step names throw', () => {
    const { context } = new Loop({ steps: steps('a') })
    for (const call of [() => context.store('b'), () => context.result('b'), () => context.stop('b'),
      () => context.iterations('b'), () => context.resume('b')]) {
      assert.throws(call, /no step called "b"/)
    }
  })
})

describe('errors', () => {
  test('an error stops the loop and rejects start()', async () => {
    const loop = new Loop({ delay: 0, steps: [{ name: 'bad', body: () => { throw new Error('boom') } }] })
    await assert.rejects(loop.start(), /boom/)
    assert.equal(loop.stopped, true)
  })

  test('with onError the loop goes on', async () => {
    const errors = []
    const loop = new Loop({
      delay: 0,
      limit: 3,
      onError: (error, ctx) => errors.push(`${ctx.current().name}: ${error.message}`),
      steps: [{ name: 'bad', body: async () => { throw new Error('boom') } }, { name: 'good', body: () => 1 }],
    })
    assert.equal(await loop.start(), 3)
    assert.equal(errors.length, 3)
    assert.equal(errors[0], 'bad: boom')
    assert.equal(loop.step('good').iterations, 3)
  })

  test('bad configuration', () => {
    assert.throws(() => new Loop({ steps: [{ body: () => {} }] }), /needs a name/)
    assert.throws(() => new Loop({ steps: [{ name: 'a' }] }), /needs a body/)
    assert.throws(() => new Loop({ steps: [...steps('a'), ...steps('a')] }), /two steps are called "a"/)
    assert.throws(() => new Loop({ delay: -1 }), /delay/)
    assert.throws(() => new Loop({ steps: [{ name: 'a', body() {}, delay: '5' }] }), /delay of step "a"/)
    assert.throws(() => new Loop({ steps: [{ name: 'a', body() {}, condition: true }] }), /condition/)
    assert.throws(() => new Loop({ limit: 1.5 }), /limit/)
  })
})

test('methods is the old name of steps', async () => {
  const loop = new Loop({ delay: 0, limit: 1, methods: steps('a', 'b') })
  await loop.start()
  assert.deepEqual(loop.steps.map((step) => step.iterations), [1, 1])
})
