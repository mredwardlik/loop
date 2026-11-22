import Loop from '../src/loop.js'

const $ = (id) => document.getElementById(id)
const POSITIONS = ['forward', 'left', 'right', 'far', 'lost']
const SAY = {
  forward: ['🙂', 'Great, hold still'],
  left: ['🙂', 'Turn your head a little to the right'],
  right: ['🙂', 'Turn your head a little to the left'],
  far: ['🙂', 'Come closer to the camera'],
  lost: ['', "We can't see you"],
}

// the "camera": random positions, or the one picked with the buttons
const camera = {
  mode: 'auto',
  last: 'forward',
  read() {
    if (this.mode !== 'auto') return this.mode
    if (Math.random() < 0.3) this.last = POSITIONS[Math.floor(Math.random() * POSITIONS.length)]
    return this.last
  },
}

// a step for every position: runs once for each new detection of it
const react = (name) => ({
  name,
  delay: 400,
  condition: (ctx) => {
    const store = ctx.store()
    if (store.position !== name || store.handled) return false
    store.handled = true
    return true
  },
  body: () => {
    const [face, text] = SAY[name]
    $('face').textContent = face
    $('frame').dataset.position = name
    $('instruction').textContent = text
    return text
  },
})

let loop = null

function makeLoop() {
  return new Loop({
    delay: Number($('delay').value),
    store: { position: null, handled: true },
    steps: [
      {
        name: 'detect',
        body: (ctx) => {
          const store = ctx.store()
          const position = camera.read()
          if (position !== store.position) {
            store.position = position
            store.handled = false
          }
          return position
        },
      },
      ...POSITIONS.map(react),
    ],
  })
}

const CONDITIONS = { detect: 'always', forward: 'new “forward”', left: 'new “left”', right: 'new “right”', far: 'new “far”', lost: 'new “lost”' }

function drawSteps() {
  $('steps').innerHTML = loop.steps
    .map((step) => `<tr data-step="${step.name}" class="${loop.current === step ? 'current' : ''}">
      <td><code>${step.name}</code></td><td>${CONDITIONS[step.name]}</td><td>${step.delay} ms</td>
      <td>${step.iterations}</td>
      <td><input type="checkbox" ${step.enabled ? 'checked' : ''} aria-label="turn ${step.name} on or off"></td></tr>`)
    .join('')
  $('iterations').textContent = loop.iterations
  $('current').textContent = loop.current ? loop.current.name : '—'
}

function log(step) {
  const item = document.createElement('li')
  const time = new Date().toLocaleTimeString([], { hour12: false })
  item.innerHTML = `<time>${time}</time> <code>${step.name}</code> ${step.name === 'detect' ? '' : '→ ' + step.result}`
  $('log').prepend(item)
  while ($('log').children.length > 8) $('log').lastChild.remove()
}

// watch the steps: every time a reaction step runs, write it to the log
let seen = {}
function watch() {
  for (const step of loop.steps) {
    if (step.name !== 'detect' && step.iterations !== (seen[step.name] ?? 0)) log(step)
    seen[step.name] = step.iterations
  }
  drawSteps()
  if (loop.running) requestAnimationFrame(watch)
}

$('start').onclick = async () => {
  loop = makeLoop()
  seen = {}
  $('log').innerHTML = ''
  $('start').disabled = true
  $('stop').disabled = false
  requestAnimationFrame(watch)
  await loop.start()
  drawSteps()
  $('start').disabled = false
  $('stop').disabled = true
  $('instruction').textContent = `Stopped after ${loop.iterations} iterations`
}

$('stop').onclick = () => loop?.stop()

$('delay').oninput = () => {
  $('delayValue').textContent = `${$('delay').value} ms`
  if (loop) loop.delay = Number($('delay').value)
}

$('positions').onclick = (event) => {
  const position = event.target.dataset?.position
  if (!position) return
  camera.mode = position
  for (const button of $('positions').querySelectorAll('button')) button.classList.toggle('on', button === event.target)
}

$('steps').onchange = (event) => {
  const name = event.target.closest('tr')?.dataset.step
  if (name) event.target.checked ? loop.enable(name) : loop.disable(name)
}

loop = makeLoop()
drawSteps()
