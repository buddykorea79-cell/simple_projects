import { Countdown, formatTime } from './timer-core.mjs';

const $ = (selector) => document.querySelector(selector);
const timer = new Countdown();
const themes = [
  { id:'apricot', name:'살구와 네이비', bg:'#ffbd88', ink:'#1d385b' },
  { id:'violet', name:'라일락과 올리브', bg:'#d7c5ef', ink:'#384712' },
  { id:'mint', name:'민트와 버건디', bg:'#bce3d3', ink:'#71223e' },
  { id:'blue', name:'블루와 오렌지', bg:'#153d73', ink:'#ffc18a' },
  { id:'rose', name:'로즈와 포레스트', bg:'#f5b6c7', ink:'#164d3c' },
  { id:'yellow', name:'레몬과 퍼플', bg:'#f3e8a3', ink:'#513479' },
];
let soundEnabled = true;
let audioContext;
let wakeLock;
let wakeRequestPending = false;
let lastStatus;
let toastTimeout;
let alarmNodes = [];
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key,value) { try { localStorage.setItem(key,value); } catch {} },
};

function announce(text) { $('#announcer').textContent = text; }
function toast(text) {
  clearTimeout(toastTimeout);
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 2800);
}
function describeDuration(ms) {
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return [minutes ? `${minutes}분` : '', remainder ? `${remainder}초` : ''].filter(Boolean).join(' ') || '0초';
}

function selectTheme(id) {
  const theme = themes.find(item => item.id === id) || themes[0];
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.style.setProperty('--timer-bg',theme.bg);
  document.documentElement.style.setProperty('--timer-ink',theme.ink);
  $('#theme-name').textContent = theme.name;
  document.querySelectorAll('.theme-button').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.theme === theme.id)));
  storage.set('jigeum-theme',theme.id);
}
themes.forEach(theme => {
  const button = document.createElement('button');
  button.className = 'theme-button';
  button.type = 'button';
  button.dataset.theme = theme.id;
  button.setAttribute('aria-label',theme.name);
  button.setAttribute('aria-pressed','false');
  button.title = theme.name;
  button.style.setProperty('--swatch-bg',theme.bg);
  button.style.setProperty('--swatch-ink',theme.ink);
  button.innerHTML = '<svg aria-hidden="true"><use href="#i-check"/></svg>';
  button.addEventListener('click',() => selectTheme(theme.id));
  $('#themes').append(button);
});
selectTheme(storage.get('jigeum-theme'));

function prepareAudio() {
  if (!soundEnabled) return;
  try {
    const AudioAPI = window.AudioContext || window.webkitAudioContext;
    if (!AudioAPI) return;
    audioContext ||= new AudioAPI();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch {}
}
function stopAlarm() {
  for (const node of alarmNodes) { try { node.stop(); } catch {} }
  alarmNodes = [];
}
function playAlarm() {
  if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
  stopAlarm();
  for (let index = 0; index < 3; index++) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = audioContext.currentTime + index * .48;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(index === 2 ? 1046.5 : 880,start);
    gain.gain.setValueAtTime(0,start);
    gain.gain.linearRampToValueAtTime(.16,start + .02);
    gain.gain.exponentialRampToValueAtTime(.001,start + .4);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + .43);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    alarmNodes.push(oscillator);
  }
}
async function syncWakeLock() {
  if (timer.status !== 'running' || document.visibilityState !== 'visible') {
    if (wakeLock) { const lock = wakeLock; wakeLock = null; await lock.release().catch(() => {}); }
    return;
  }
  if (!('wakeLock' in navigator) || wakeLock || wakeRequestPending) return;
  wakeRequestPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (timer.status !== 'running' || document.visibilityState !== 'visible') { await lock.release(); return; }
    wakeLock = lock;
    lock.addEventListener('release',() => { if (wakeLock === lock) wakeLock = null; });
  } catch {} finally { wakeRequestPending = false; }
}

function render() {
  const { minutes, seconds } = formatTime(timer.remainingMs);
  $('#minutes-display').textContent = minutes;
  $('#seconds-display').textContent = seconds;
  $('#time-display').classList.toggle('long-time',minutes.length > 2);
  $('#time-display').setAttribute('aria-label',`${Number(minutes)}분 ${Number(seconds)}초 남음`);
  $('#progress-fill').style.width = `${timer.durationMs > 0 ? timer.remainingMs / timer.durationMs * 100 : 0}%`;
  $('#progress-track').setAttribute('aria-valuemax',String(timer.durationMs / 1000));
  $('#progress-track').setAttribute('aria-valuenow',String(Math.ceil(timer.remainingMs / 1000)));
  $('#progress-track').setAttribute('aria-valuetext',`${describeDuration(timer.remainingMs)} 남음`);
  $('#duration-label').textContent = `${describeDuration(timer.durationMs)} 타이머`;
  document.title = timer.status === 'idle' ? '지금, 타이머' : timer.status === 'finished' ? '시간이 다 됐어요 · 지금, 타이머' : `${minutes}:${seconds} · 지금, 타이머`;
  document.querySelectorAll('.preset-button').forEach(button => button.setAttribute('aria-pressed',String(Number(button.dataset.minutes) * 60000 === timer.durationMs)));
  if (lastStatus !== timer.status) {
    const states = {
      idle: ['준비','작은 집중이 쌓이는 시간','시작하기','#i-play'],
      running: ['집중 중','지금, 한 가지에만 집중해요','일시정지','#i-pause'],
      paused: ['일시정지','잠시 쉬어 가도 괜찮아요','계속하기','#i-play'],
      finished: ['완료','시간이 다 됐어요. 수고했어요!','다시 시작','#i-reset'],
    };
    const [state,message,label,icon] = states[timer.status];
    $('#state-label').textContent = state;
    $('#timer-message').textContent = message;
    $('#start-label').textContent = label;
    $('#start-icon use').setAttribute('href',icon);
    $('.timer-stage').dataset.status = timer.status;
    lastStatus = timer.status;
    void syncWakeLock();
  }
}

function tick() {
  if (timer.tick()) {
    playAlarm();
    announce('시간이 다 됐어요. 수고했어요!');
  }
  render();
}
function toggleTimer() {
  tick();
  stopAlarm();
  if (timer.status === 'running') { timer.pause(); announce('타이머를 일시정지했어요.'); }
  else {
    if (timer.durationMs <= 0) return;
    prepareAudio();
    timer.start();
    announce('타이머가 시작됐어요.');
  }
  render();
}
function resetTimer() {
  stopAlarm();
  timer.reset();
  render();
  announce(`${describeDuration(timer.durationMs)}으로 초기화했어요.`);
}
function updateInputs(seconds) {
  $('#minutes-input').value = String(Math.floor(seconds / 60));
  $('#seconds-input').value = String(seconds % 60);
  $('#input-error').textContent = '';
  $('#minutes-input').removeAttribute('aria-invalid');
  $('#seconds-input').removeAttribute('aria-invalid');
}
for (let minutes = 1; minutes <= 10; minutes++) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'preset-button';
  button.dataset.minutes = String(minutes);
  button.setAttribute('aria-label',`${minutes}분 타이머 바로 시작`);
  button.setAttribute('aria-pressed','false');
  button.innerHTML = `<strong>${minutes}</strong><span>분</span>`;
  button.addEventListener('click',() => {
    stopAlarm();
    prepareAudio();
    timer.setDuration(minutes * 60);
    updateInputs(minutes * 60);
    timer.start();
    render();
    $('#start-button').focus({preventScroll:true});
    announce(`${minutes}분 타이머를 시작했어요.`);
  });
  $('#presets').append(button);
}
$('#custom-form').addEventListener('submit',event => {
  event.preventDefault();
  const minuteInput = $('#minutes-input');
  const secondInput = $('#seconds-input');
  minuteInput.removeAttribute('aria-invalid');
  secondInput.removeAttribute('aria-invalid');
  const minutes = minuteInput.value === '' ? 0 : Number(minuteInput.value);
  const seconds = secondInput.value === '' ? 0 : Number(secondInput.value);
  const minutesValid = !minuteInput.validity.badInput && Number.isInteger(minutes) && minutes >= 0 && minutes <= 999;
  const secondsValid = !secondInput.validity.badInput && Number.isInteger(seconds) && seconds >= 0 && seconds <= 59;
  if (!minutesValid || !secondsValid || minutes * 60 + seconds === 0) {
    $('#input-error').textContent = !minutesValid ? '분은 0~999 사이의 정수로 입력해 주세요.' : !secondsValid ? '초는 0~59 사이의 정수로 입력해 주세요.' : '1초 이상의 시간을 설정해 주세요.';
    const invalidInput = !minutesValid ? minuteInput : secondInput;
    invalidInput.setAttribute('aria-invalid','true');
    invalidInput.focus();
    return;
  }
  stopAlarm();
  timer.setDuration(minutes * 60 + seconds);
  updateInputs(minutes * 60 + seconds);
  render();
  announce(`${describeDuration(timer.durationMs)}으로 설정했어요. 시작하기를 눌러 주세요.`);
  $('#start-button').focus({preventScroll:true});
});
$('#start-button').addEventListener('click',toggleTimer);
$('#reset-button').addEventListener('click',resetTimer);

function renderSound() {
  $('#sound-toggle').setAttribute('aria-pressed',String(soundEnabled));
  $('#sound-toggle').title = `완료 알림 소리 ${soundEnabled ? '켜짐' : '꺼짐'}`;
  $('#sound-label').textContent = `소리 ${soundEnabled ? '켜짐' : '꺼짐'}`;
  $('#sound-toggle use').setAttribute('href',soundEnabled ? '#i-volume' : '#i-muted');
}
soundEnabled = storage.get('jigeum-sound') !== 'off';
renderSound();
$('#sound-toggle').addEventListener('click',() => {
  soundEnabled = !soundEnabled;
  storage.set('jigeum-sound',soundEnabled ? 'on' : 'off');
  if (soundEnabled) prepareAudio(); else stopAlarm();
  renderSound();
  announce(`완료 알림 소리를 ${soundEnabled ? '켰어요' : '껐어요'}.`);
});

function setFocusMode(enabled) {
  document.body.classList.toggle('focus-mode',enabled);
  $('#fullscreen-toggle').setAttribute('aria-pressed',String(enabled));
  $('#fullscreen-toggle').setAttribute('aria-label',enabled ? '전체 화면 종료' : '전체 화면');
  $('#fullscreen-toggle').title = enabled ? '전체 화면 종료 (Esc 또는 F)' : '전체 화면 (F)';
  $('#fullscreen-label').textContent = enabled ? '화면 줄이기' : '전체 화면';
  $('#fullscreen-toggle use').setAttribute('href',enabled ? '#i-shrink' : '#i-expand');
}
async function toggleFullscreen() {
  if (document.body.classList.contains('focus-mode')) {
    setFocusMode(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    return;
  }
  setFocusMode(true);
  if (document.documentElement.requestFullscreen) {
    try { await document.documentElement.requestFullscreen(); }
    catch { toast('집중 화면으로 전환했어요. F 또는 Esc로 돌아가세요.'); }
  } else toast('집중 화면으로 전환했어요. 화면 줄이기로 돌아가세요.');
}
$('#fullscreen-toggle').addEventListener('click',() => { void toggleFullscreen(); });
document.addEventListener('fullscreenchange',() => setFocusMode(Boolean(document.fullscreenElement)));
const guide = $('#guide');
$('#guide-toggle').addEventListener('click',() => guide.showModal());
$('#guide-close').addEventListener('click',() => guide.close());
guide.addEventListener('click',event => { if (event.target === guide) guide.close(); });
try { if (!localStorage.getItem('jigeum-guide-seen')) { guide.showModal(); localStorage.setItem('jigeum-guide-seen','1'); } } catch {}

document.addEventListener('keydown',event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (guide.open) return;
  if (event.key === 'Escape' && document.body.classList.contains('focus-mode') && !document.fullscreenElement) { setFocusMode(false); return; }
  if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (event.code === 'Space') {
    // Native Space activation remains available for focused buttons and links.
    if (event.target instanceof Element && event.target.closest('button,a')) return;
    event.preventDefault();
    toggleTimer();
  } else if (event.key.toLowerCase() === 'r') { event.preventDefault(); resetTimer(); }
  else if (event.key.toLowerCase() === 'f') { event.preventDefault(); void toggleFullscreen(); }
});
document.addEventListener('visibilitychange',() => { tick(); void syncWakeLock(); });
window.addEventListener('pagehide',() => { if (wakeLock) void wakeLock.release().catch(() => {}); });
setInterval(tick,100);
render();
