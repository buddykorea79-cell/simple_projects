const MAX_SECONDS = 999 * 60 + 59;

function normalizeSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(MAX_SECONDS, Math.max(0, Math.floor(number)));
}

/** A deadline-based countdown. Call tick() to refresh its display state. */
export class Countdown {
  #now;
  #durationMs = 5 * 60 * 1000;
  #remainingMs = this.#durationMs;
  #deadline = null;
  #status = 'idle';

  constructor({ now = () => Date.now() } = {}) {
    this.#now = now;
  }

  get durationMs() { return this.#durationMs; }
  get remainingMs() { return this.#remainingMs; }
  get status() { return this.#status; }

  setDuration(seconds) {
    this.#durationMs = normalizeSeconds(seconds) * 1000;
    this.reset();
  }

  start() {
    if (this.#status === 'running') return;
    if (this.#status === 'finished') this.#remainingMs = this.#durationMs;
    this.#deadline = this.#now() + this.#remainingMs;
    this.#status = 'running';
  }

  pause() {
    if (this.#status !== 'running') return;
    this.tick();
    if (this.#status === 'running') {
      this.#status = 'paused';
      this.#deadline = null;
    }
  }

  reset() {
    this.#status = 'idle';
    this.#remainingMs = this.#durationMs;
    this.#deadline = null;
  }

  /** Returns true exactly when this call completes a running countdown. */
  tick() {
    if (this.#status !== 'running') return false;
    this.#remainingMs = Math.max(0, Math.min(this.#durationMs, this.#deadline - this.#now()));
    if (this.#remainingMs > 0) return false;
    this.#status = 'finished';
    this.#deadline = null;
    return true;
  }
}

export function formatTime(milliseconds) {
  const value = Number(milliseconds);
  const seconds = Number.isFinite(value) ? Math.max(0, Math.ceil(value / 1000)) : 0;
  return {
    minutes: String(Math.floor(seconds / 60)).padStart(2, '0'),
    seconds: String(seconds % 60).padStart(2, '0'),
  };
}
