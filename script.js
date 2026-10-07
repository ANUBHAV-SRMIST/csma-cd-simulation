/* =====================================================================
   CSMA/CD simulation
   - Signals are pulses: {start, end} = time the sender is emitting.
   - A pulse travels along the channel at "speed" such that the end-to-end
     delay is P (= 15 s of simulated time, as in the exercise hint).
   - A node detects a collision when it is still emitting at the moment
     the other node's signal reaches it  ->  this is why the exercise
     needs transmission time >= 2t.
   ===================================================================== */

const P        = 15;     // one-way propagation time (simulated seconds)
const SCALE    = 0.15;   // real seconds per simulated second
const CELLS    = 26;     // dashes drawn on the channel
const SPEED    = 0.5;    // MBps (exercise)
const JAM      = 2;      // jam signal length (sim s)
const USER_LEN = 10;     // packet length for the first two pages (sim s)
const BOT_LEN  = 8;      // bot packet length (sim s)
const SLOT     = 2;      // back-off slot time (sim s)
const EPS      = 1e-6;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

/* ---------------------------------------------------------------- Sim */
class Sim {
  constructor(root) {
    this.root = root;
    this.mode = root.dataset.sim;               // interference | backoff | exercise
    this.q = s => root.querySelector(s);
    this.cellsEl = this.q('[data-cells]');
    this.logEl = this.q('[data-log]');
    this.userEl = this.q('[data-user]');
    this.botEl = this.q('[data-bot]');
    this.sendBtn = this.q('[data-send]');
    this.boBtn = this.q('[data-backoff]');
    this.kInput = this.q('[data-k]');
    this.checkBtn = this.q('[data-check]');
    this.sizeInput = this.q('[data-size]');
    this.setSizeBtn = this.q('[data-setsize]');

    this.cells = [];
    for (let i = 0; i < CELLS; i++) {
      const c = document.createElement('div');
      c.className = 'cell';
      this.cellsEl.appendChild(c);
      this.cells.push(c);
    }
    this.reset();
    this.bind();
  }

  reset() {
    this.t = 0;
    this.K = 0;              // total collisions (accumulates)
    this.attemptK = 0;       // collisions for the current packet
    this.users = [];
    this.bots = [];
    this.botId = 0;
    this.active = null;      // current user transmission
    this.needBackoff = false;
    this.backoffUntil = null;
    this.sensing = false;
    this.sentOnce = false;
    this.packetMB = null;
    this.nextBot = (this.mode === 'exercise') ? Infinity : rand(1, 5);
    this.logEl.innerHTML = '';
    this.updateButtons();
  }

  bind() {
    this.sendBtn.addEventListener('click', () => this.send());
    if (this.boBtn) this.boBtn.addEventListener('click', () => this.backOff());
    this.checkBtn.addEventListener('click', () => this.checkK());
    if (this.setSizeBtn) this.setSizeBtn.addEventListener('click', () => this.setSize());
  }

  /* ---------- helpers ---------- */
  log(msg, cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = `[${this.t.toFixed(1)}s] ${msg}`;
    this.logEl.appendChild(d);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
  flash(el, cls, ms) { el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); }

  updateButtons() {
    const busy = !!this.active || this.backoffUntil !== null || this.sensing;
    this.sendBtn.disabled = busy;
    if (this.mode !== 'exercise' || this.sentOnce) {
      this.kInput.disabled = !this.sentOnce && this.mode !== 'exercise';
      this.checkBtn.disabled = !this.sentOnce && this.mode !== 'exercise';
    }
    if (this.boBtn && this.mode !== 'interference') {
      this.boBtn.disabled = !this.needBackoff || busy;
      this.boBtn.classList.toggle('pulse', this.needBackoff && !busy);
    }
  }

  /* ---------- user actions ---------- */
  setSize() {
    const v = parseFloat(this.sizeInput.value);
    if (!(v > 0)) { this.log('Please enter a valid packet size (MB).', 'bad'); return; }
    this.packetMB = v;
    this.log(`Packet size set to ${v} MB (transmission time = ${v} / ${SPEED} = ${(v / SPEED).toFixed(1)} s).`);
  }

  send() {
    if (this.active || this.backoffUntil !== null || this.sensing) return;
    if (this.needBackoff) {
      this.log('Collision occurred - use "Back Off" to retransmit.', 'bad');
      return;
    }
    let len = USER_LEN;
    if (this.mode === 'exercise') {
      if (this.sizeInput.value) this.setSize();
      if (!this.packetMB) { this.log('Enter a packet size first.', 'bad'); return; }
      len = this.packetMB / SPEED;
    }
    this.sentOnce = true;
    this.startTx(len);
  }

  startTx(len) {
    const u = { start: this.t, end: this.t + len, collided: false, evU: new Set(), evB: new Set() };
    this.users.push(u);
    this.active = u;
    this.log(`User starts sending (${len.toFixed(1)} s of data).`);
    if (this.mode === 'exercise') {
      // worst case: the bot starts just as the user's signal reaches it
      this.bots.push({ id: ++this.botId, start: this.t + P, end: this.t + P + BOT_LEN });
    }
    this.updateButtons();
  }

  backOff() {
    if (!this.needBackoff || this.active) return;
    if (this.attemptK >= 16) {
      this.log('16 collisions - transmission aborted.', 'bad');
      this.needBackoff = false; this.attemptK = 0; this.updateButtons(); return;
    }
    const k = Math.min(this.attemptK, 10);
    const r = randInt(0, Math.pow(2, k) - 1);
    const wait = r * SLOT;
    this.needBackoff = false;
    this.log(`Back-off: collision #${this.attemptK}, r chosen from 0..${Math.pow(2, k) - 1} -> r = ${r}, wait = ${wait} s.`);
    this.backoffUntil = this.t + wait;
    this.updateButtons();
  }

  checkK() {
    const v = this.kInput.value;
    if (v === '') { this.log('Enter a K value first.', 'bad'); return; }
    if (parseInt(v, 10) === this.K) this.log(`Correct! K = ${this.K} collision(s).`, 'ok');
    else this.log('Incorrect. Count the collisions in the status log and try again.', 'bad');
  }

  /* ---------- physics ---------- */
  userHears() {          // is a bot signal currently at the user's end?
    return this.bots.some(b => b.start + P <= this.t + EPS && this.t <= b.end + P + EPS);
  }

  step(dt) {
    this.t += dt;

    // bot
    if (this.t >= this.nextBot) {
      this.bots.push({ id: ++this.botId, start: this.t, end: this.t + BOT_LEN });
      this.nextBot = this.t + rand(15, 35);
    }

    // back-off timer, then carrier sense
    if (this.backoffUntil !== null && this.t >= this.backoffUntil) {
      this.backoffUntil = null; this.sensing = true;
      this.log('Back-off finished. Sensing the channel...');
    }
    if (this.sensing) {
      if (!this.userHears()) {
        this.sensing = false;
        this.log('Channel idle - retransmitting.');
        this.startTx(this.mode === 'exercise' ? this.packetMB / SPEED : USER_LEN);
      }
    }

    // collision detection
    for (const u of this.users) {
      if (u.done) continue;
      for (const b of this.bots) {
        // bot detects when the user's head reaches it
        const dB = Math.max(b.start, u.start + P);
        if (!u.evB.has(b.id) && this.t >= dB) {
          u.evB.add(b.id);
          if (dB <= Math.min(b.end, u.end + P) + EPS) {
            b.end = Math.min(b.end, dB + JAM);
            this.flash(this.botEl, 'crash', 400);
            this.log('Bot detected a collision and sent a jam signal.');
          }
        }
        // user detects when the bot's head reaches it
        const dU = Math.max(u.start, b.start + P);
        if (!u.evU.has(b.id) && this.t >= dU) {
          u.evU.add(b.id);
          if (!u.collided && dU <= Math.min(u.end, b.end + P) + EPS) {
            u.collided = true;
            u.end = Math.min(u.end, dU + JAM);
            this.K++; this.attemptK++;
            this.flash(this.userEl, 'crash', 400);
            this.log(`COLLISION detected by the User node! K = ${this.K}`, 'bad');
          }
        }
      }
      // transmission fully on the wire -> final verdict
      if (this.t >= u.end + P) this.finish(u);
    }

    // draw
    this.render();
  }

  finish(u) {
    u.done = true;
    if (this.active === u) this.active = null;
    if (u.collided) {
      this.needBackoff = this.mode !== 'interference';
      if (this.mode === 'exercise') {
        this.log('Collision was detected while transmitting - this packet size is large enough.', 'ok');
      } else if (this.mode === 'backoff') {
        this.log('Packet damaged. Click "Back Off" to retransmit.', 'bad');
      } else {
        this.log('Packet damaged by the collision.', 'bad');
      }
    } else {
      const damaged = this.bots.some(b => b.start < u.end + P - EPS && b.end + P > u.start + EPS);
      if (damaged) {
        this.log('Packet was damaged but the User node had already finished sending - collision NOT detected (packet too small).', 'bad');
        if (this.mode === 'exercise') this.log('Try a bigger packet size.', 'bad');
      } else {
        this.log('Data delivered successfully - no collision.', 'ok');
        this.attemptK = 0;
      }
    }
    this.updateButtons();
    this.users = this.users.filter(x => !x.done || x === u);
    if (this.bots.length > 30) this.bots.splice(0, this.bots.length - 30);
  }

  render() {
    const emit = (list, t) => list.some(s => t >= s.start - EPS && t <= s.end + EPS);
    this.userEl.classList.toggle('tx', emit(this.users, this.t));
    this.botEl.classList.toggle('tx', emit(this.bots, this.t));
    for (let i = 0; i < CELLS; i++) {
      const p = (i + 0.5) / CELLS * P;               // travel time from the user
      const tu = this.t - p, tb = this.t - (P - p);
      const hasU = this.users.some(s => tu >= s.start && tu <= s.end);
      const hasB = this.bots.some(s => tb >= s.start && tb <= s.end);
      this.cells[i].className = 'cell' + (hasU && hasB ? ' x' : hasU ? ' u' : hasB ? ' b' : '');
    }
  }
}

/* -------------------------------------------------------- bootstrapping */
const sims = {};
document.querySelectorAll('[data-sim]').forEach(el => { sims[el.dataset.sim] = new Sim(el); });

const tabs = ['interference', 'backoff', 'minsize', 'exercise'];
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
let current = 0;

function showTab(i) {
  current = Math.max(0, Math.min(tabs.length - 1, i));
  tabs.forEach((id, idx) => {
    document.getElementById(id).hidden = idx !== current;
    document.querySelector(`[data-tab="${id}"]`).classList.toggle('active', idx === current);
  });
  prevBtn.hidden = current === 0;
  nextBtn.hidden = current === tabs.length - 1;
  history.replaceState(null, '', '#' + tabs[current]);
}
document.querySelectorAll('[data-tab]').forEach(a =>
  a.addEventListener('click', e => { e.preventDefault(); showTab(tabs.indexOf(a.dataset.tab)); }));
prevBtn.addEventListener('click', () => showTab(current - 1));
nextBtn.addEventListener('click', () => showTab(current + 1));
showTab(Math.max(0, tabs.indexOf(location.hash.slice(1))));

/* animation loop - only the visible simulation advances */
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1) / SCALE;   // simulated seconds
  last = now;
  const s = sims[tabs[current]];
  if (s) s.step(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* minimum-size calculator */
function calc() {
  const v = parseFloat(document.getElementById('calcSpeed').value) || 0;
  const t = parseFloat(document.getElementById('calcT').value) || 0;
  document.getElementById('calcOut').textContent =
    `Minimum size = ${v} x 2 x ${t} = ${(v * 2 * t).toFixed(2)} MB`;
}
document.getElementById('calcSpeed').addEventListener('input', calc);
document.getElementById('calcT').addEventListener('input', calc);
calc();
