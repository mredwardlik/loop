<div align="center">

# 🔁 loop

**A small async scheduler that runs a list of steps in an endless loop.**

Each step has its own condition, delay and local store. All steps share a
common store and a context for talking to each other.

![JavaScript](https://img.shields.io/badge/JavaScript-ES2017+-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Webpack](https://img.shields.io/badge/Webpack-5-8DD6F9?style=flat-square&logo=webpack&logoColor=black)
![Status](https://img.shields.io/badge/status-experimental-orange?style=flat-square)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](LICENSE)

</div>

---

## 💡 Idea

Some UI logic is easiest to write as a **polling loop**: check a sensor, react
when something changes, wait, repeat. This is common in camera and face-tracking
flows, kiosk screens and simple game loops. `loop` turns that into a
declarative list of steps:

```text
┌──────────── iteration ────────────┐
│  step 1 → step 2 → … → step N     │ ── wait `delay` ──┐
└───────────────────────────────────┘                   │
              ▲                                         │
              └─────────────────────────────────────────┘
```

On every iteration, each step:

1. is skipped if it was stopped or its `condition(context)` returns `false`
2. waits for its own `delay`
3. runs its `body(context)`, sync or `async`, and saves the result

## 🚀 Example

```js
import Loop from '@/index'

const loop = new Loop({
  delay: 500, // pause between iterations, ms
  store: { position: null, handled: true },
  methods: [
    {
      name: 'detect',
      body: async (ctx) => {
        const store = ctx.store()
        const position = await camera.getHeadPosition() // 'left' | 'right' | ...
        if (position !== store.position) {
          store.position = position
          store.handled = false
        }
      },
    },
    {
      name: 'left',
      delay: 1000,
      // run once for each new "left" detection
      condition: (ctx) => {
        const store = ctx.store()
        if (store.position === ctx.current().name && !store.handled) {
          store.handled = true
          return true
        }
        return false
      },
      body: (ctx) => {
        console.log('turn your head back')
        if (ctx.iterations('left') >= 3) ctx.stop() // stop the whole loop
      },
    },
  ],
})

await loop.start() // resolves after the loop is stopped
```

## 📖 API

### `new Loop(config)`

| Option    | Type       | Default | Description                                 |
| --------- | ---------- | ------- | ------------------------------------------- |
| `delay`   | `number`   | `1000`  | Pause between iterations, in ms             |
| `methods` | `Method[]` | `[]`    | Steps, run in the order they're listed      |
| `store`   | `object`   | `{}`    | Global store shared by all steps            |

**`Method`**

| Field       | Type                         | Default      | Description                                |
| ----------- | ---------------------------- | ------------ | ------------------------------------------ |
| `name`      | `string`                     | (required)   | Unique step name                           |
| `body`      | `(ctx) => any \| Promise`    | (required)   | Step logic, sync or `async`                |
| `condition` | `(ctx) => boolean`           | `() => true` | Runs the step only when it returns `true`  |
| `delay`     | `number`                     | `0`          | Pause before the step runs, in ms          |
| `store`     | `object`                     | `{}`         | The step's own store                       |

**Instance methods:** `start()` starts the loop and returns a promise.
`stopLoop()` stops it after the current step.

### Context

Every `body` and `condition` receives a `context`:

| Method                | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `store(name?)`        | Global store, or the store of step `name`                          |
| `current()`           | The step that is running now                                       |
| `result(name)`        | Last value returned by step `name`                                 |
| `iterations(name?)`   | Number of loop iterations, or how many times step `name` has run   |
| `methods()`           | All registered steps                                               |
| `stop(name?)`         | Stop the whole loop, or turn off only step `name`                  |
| `delay(ms)`           | `await ctx.delay(300)` pauses inside a step                        |

## 🧪 Demo

`src/methods.js` contains a demo that simulates head-position detection
(`forward`, `left`, `right`, `Too Far`, `No Face`) and updates the page once for
each new position.

```bash
git clone https://github.com/mredwardlik/loop.git
cd loop
npm install
npm start          # dev server → http://localhost:8000
npm run build      # production bundle → dist/
```

## 🗺 Roadmap

- [ ] Publish as a standalone package (move the demo out of `src/index.js`)
- [ ] `Store` helper with safe `get` / `set` and default values (`src/store.js`)
- [ ] Tests

## 📄 License

[MIT](LICENSE) © Eduard Lik
