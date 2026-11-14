import test from 'node:test';
import assert from 'node:assert/strict';
import { Countdown, formatTime } from '../timer-core.mjs';

function makeTimer() {
  let now = 1_000_000;
  const timer = new Countdown({ now: () => now });
  return { timer, advance: milliseconds => { now += milliseconds; } };
}

test('starts at five minutes and counts against elapsed wall-clock time', () => {
  const { timer, advance } = makeTimer();
  assert.equal(timer.status, 'idle');
  assert.equal(timer.durationMs, 300_000);
  assert.equal(timer.remainingMs, 300_000);
  timer.start();
  advance(1_475);
  assert.equal(timer.tick(), false);
  assert.equal(timer.remainingMs, 298_525);
  assert.equal(timer.status, 'running');
});

test('pause captures elapsed time and resume excludes time spent paused', () => {
  const { timer, advance } = makeTimer();
  timer.setDuration(10);
  timer.start();
  advance(2_350);
  timer.pause();
  assert.equal(timer.status, 'paused');
  assert.equal(timer.remainingMs, 7_650);
  advance(100_000);
  assert.equal(timer.tick(), false);
  assert.equal(timer.remainingMs, 7_650);
  timer.start();
  advance(650);
  timer.tick();
  assert.equal(timer.remainingMs, 7_000);
});

test('background throttling finishes once even after a large clock jump', () => {
  const { timer, advance } = makeTimer();
  timer.setDuration(60);
  timer.start();
  advance(10 * 60_000);
  assert.equal(timer.tick(), true);
  assert.equal(timer.remainingMs, 0);
  assert.equal(timer.status, 'finished');
  assert.equal(timer.tick(), false);
  advance(1000);
  assert.equal(timer.tick(), false);
});

test('reset restores the chosen duration and cancels the active deadline', () => {
  const { timer, advance } = makeTimer();
  timer.setDuration(83);
  timer.start();
  advance(12_000);
  timer.reset();
  advance(100_000);
  assert.equal(timer.tick(), false);
  assert.equal(timer.status, 'idle');
  assert.equal(timer.remainingMs, 83_000);
  timer.start();
  advance(1000);
  timer.tick();
  assert.equal(timer.remainingMs, 82_000);
});

test('start after completion begins the full selected duration again', () => {
  const { timer, advance } = makeTimer();
  timer.setDuration(2);
  timer.start();
  advance(2000);
  assert.equal(timer.tick(), true);
  timer.start();
  assert.equal(timer.status, 'running');
  assert.equal(timer.remainingMs, 2000);
  advance(500);
  timer.tick();
  assert.equal(timer.remainingMs, 1500);
});

test('repeated start cannot move the deadline and changing duration resets state', () => {
  const { timer, advance } = makeTimer();
  timer.setDuration(10);
  timer.start();
  advance(1000);
  timer.start();
  advance(1000);
  timer.tick();
  assert.equal(timer.remainingMs, 8000);
  timer.setDuration(45);
  assert.equal(timer.status, 'idle');
  assert.equal(timer.remainingMs, 45_000);
  advance(100_000);
  assert.equal(timer.tick(), false);
  assert.equal(timer.remainingMs, 45_000);
});

test('durations are bounded whole seconds and zero completes on the next tick', () => {
  const { timer } = makeTimer();
  for (const input of [-20, NaN, Infinity, 'oops', undefined]) {
    timer.setDuration(input);
    assert.equal(timer.durationMs, 0);
  }
  timer.setDuration('12.9');
  assert.equal(timer.durationMs, 12_000);
  timer.setDuration(1_000_000);
  assert.equal(timer.durationMs, 59_999_000);
  timer.setDuration(0);
  timer.start();
  assert.equal(timer.tick(), true);
  assert.equal(timer.status, 'finished');
  assert.equal(timer.tick(), false);
});

test('pausing after the deadline preserves completion', () => {
  const { timer, advance } = makeTimer();
  timer.setDuration(1);
  timer.start();
  advance(1500);
  timer.pause();
  assert.equal(timer.status, 'finished');
  assert.equal(timer.remainingMs, 0);
});

test('format uses ceiling seconds, carries at minute boundaries, and supports 999 minutes', () => {
  assert.deepEqual(formatTime(1), { minutes: '00', seconds: '01' });
  assert.deepEqual(formatTime(60_001), { minutes: '01', seconds: '01' });
  assert.deepEqual(formatTime(60_000), { minutes: '01', seconds: '00' });
  assert.deepEqual(formatTime(59_999_000), { minutes: '999', seconds: '59' });
  for (const value of [0, -1000, NaN, Infinity]) {
    assert.deepEqual(formatTime(value), { minutes: '00', seconds: '00' });
  }
});
