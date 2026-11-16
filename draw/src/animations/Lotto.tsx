import { useEffect, useMemo, useRef, useState } from 'react';
import { type AnimProps, celebrate, useAutoStep, useLater, useSignal, useSize } from './common';
import * as sfx from '../lib/sound';
import type { WinnerRecord } from '../types';
import { ARM, HUES, addBall, armWidth, createSim, resizeSim, stepSim, takeTopBall, type LottoSim } from './lottoSim';

interface Flying { label: string; hue: number; t0: number; dur: number; p0: [number, number]; }

/** 보석 톤 공 색 — 공개 화면의 큰 공은 추첨번호(뒷 4자리) 구간별 */
const JEWELS = ['#d9b45f', '#3563b0', '#a8324a', '#2f7d5b', '#cfc8b8'];
export const ballColor = (last4: string) => JEWELS[Math.min(4, Math.floor(Number(last4) / 2000))] ?? JEWELS[0];
/** 통 안의 작은 공 색 (숫자 없는 공) */
const MINI = ['#e3bf6a', '#3d6fc4', '#b23a55', '#348a64', '#ece6d6', '#8a63c9'];
const MAX_BALLS = 80;

/**
 * 로또 볼 추첨기: 숫자 없는 작은 공들이 바람·회오리·교반 막대에 쉬지 않고 날아다니다가,
 * 추첨하면 한 개가 배출구로 튀어나오며 커지고 당첨자의 추첨번호(휴대폰 뒷 4자리)가 떠오른다.
 */
export function Lotto({ pool, winners, prize, speed, advance, revealAll, auto, onProgress, onDone }: AnimProps) {
  const later = useLater();
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ordered = useMemo(() => [...winners].sort((a, b) => a.order - b.order), [winners]);
  const [revealed, setRevealed] = useState(0);
  const [current, setCurrent] = useState<WinnerRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const fast = speed === 'fast';
  const finished = revealed >= ordered.length;

  const ballCount = Math.max(1, Math.min(MAX_BALLS, pool.length));
  const sim = useRef<LottoSim | null>(null);
  const view = useRef({ cx: 0, cy: 0, dpr: 1, flying: null as Flying | null, sprites: [] as HTMLCanvasElement[], trail: null as HTMLCanvasElement | null });

  // 공 그림(스프라이트)은 크기가 바뀔 때만 다시 만든다
  function makeSprites(br: number, dpr: number) {
    return MINI.map(color => {
      const c = document.createElement('canvas');
      const px = Math.ceil(br * 2 * dpr) + 2;
      c.width = c.height = px;
      const g = c.getContext('2d')!;
      const r = px / 2 - 1;
      const grad = g.createRadialGradient(px * .36, px * .32, r * .08, px / 2, px / 2, r);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(.28, color); grad.addColorStop(1, shade(color, .38));
      g.fillStyle = grad; g.beginPath(); g.arc(px / 2, px / 2, r, 0, Math.PI * 2); g.fill();
      return c;
    });
  }

  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    const R = Math.min(size.w * .42, size.h * .38);
    if (!sim.current) sim.current = createSim(R, ballCount);
    else resizeSim(sim.current, R);
    const v = view.current;
    v.cx = size.w / 2; v.cy = size.h * .52; v.dpr = dpr;
    v.sprites = makeSprites(sim.current.br, dpr);
    v.trail ??= document.createElement('canvas');
    v.trail.width = cv.width; v.trail.height = cv.height;
  }, [size]);

  // 물리 + 그리기 루프
  useEffect(() => {
    const cv = canvasRef.current!; const ctx = cv.getContext('2d')!;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(.033, (now - last) / 1000); last = now;
      if (sim.current) { stepSim(sim.current, dt); draw(ctx, now); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function drawNumberBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, label: string, hue: number, numAlpha: number) {
    const base = MINI[hue % MINI.length];
    const grad = ctx.createRadialGradient(x - r * .38, y - r * .42, r * .08, x, y, r);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(.25, base); grad.addColorStop(1, shade(base, .4));
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (numAlpha <= 0) return;
    ctx.globalAlpha = numAlpha;
    ctx.fillStyle = '#fbf8f1'; ctx.beginPath(); ctx.ellipse(x, y, r * .7, r * .5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#141a33'; ctx.font = `700 ${r * .5}px Outfit, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + r * .03);
    ctx.globalAlpha = 1;
  }

  function draw(ctx: CanvasRenderingContext2D, now: number) {
    const s = sim.current!; const v = view.current;
    const { R, br } = s; const { cx, cy, dpr } = v;
    if (!R) return;
    const cvs = ctx.canvas;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    // 받침대 (어두운 금속 + 금색 테)
    const pg = ctx.createLinearGradient(0, cy + R * .9, 0, cy + R * 1.32);
    pg.addColorStop(0, '#2a2f45'); pg.addColorStop(1, '#11142a');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.moveTo(cx - R * .42, cy + R * .9); ctx.lineTo(cx + R * .42, cy + R * .9); ctx.lineTo(cx + R * .72, cy + R * 1.32); ctx.lineTo(cx - R * .72, cy + R * 1.32); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c9a35a'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#c9a35a'; ctx.fillRect(cx - R * .76, cy + R * 1.32, R * 1.52, 3);
    // 배출구
    ctx.strokeStyle = 'rgba(232,212,160,.35)'; ctx.lineWidth = br * 3.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - R - br * 2); ctx.stroke();
    // 유리 통 안쪽
    const g = ctx.createRadialGradient(cx - R * .3, cy - R * .4, R * .1, cx, cy, R);
    g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(201,163,90,.06)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    // 바람 줄기 (추첨 중일수록 진하게)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, Math.PI * 2); ctx.clip();
    for (let i = 0; i < 5; i++) {
      const phase = (now / 1000 * (1.2 + s.mix * 2.5) + i / 5) % 1;
      const yy = cy + R * (1 - phase * 1.7);
      const xx = cx + Math.sin(i * 2.1 + now / 700) * R * .35;
      ctx.strokeStyle = `rgba(232,212,160,${(.05 + s.mix * .12) * Math.sin(phase * Math.PI)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + R * .08, yy - R * .15, xx, yy - R * .3); ctx.stroke();
    }
    ctx.restore();

    // 잔상: 이전 프레임을 조금씩 지우며 공 위치를 겹쳐 그린다
    const trail = v.trail!;
    const tctx = trail.getContext('2d')!;
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.globalCompositeOperation = 'destination-out';
    tctx.fillStyle = `rgba(0,0,0,${.42 - s.mix * .14})`;
    tctx.fillRect(0, 0, trail.width, trail.height);
    tctx.globalCompositeOperation = 'source-over';
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.globalAlpha = .32;
    for (const b of s.balls) tctx.drawImage(v.sprites[b.hue % HUES], cx + b.x - br * .8, cy + b.y - br * .8, br * 1.6, br * 1.6);
    tctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(trail, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 가운데서 도는 교반 막대 (금색 십자)
    const hw = armWidth(R), L = ARM * R;
    ctx.lineCap = 'round';
    for (const a of [s.angle, s.angle + Math.PI / 2]) {
      const ux = Math.cos(a) * L, uy = Math.sin(a) * L;
      ctx.strokeStyle = 'rgba(217,180,95,.55)'; ctx.lineWidth = hw * 2;
      ctx.beginPath(); ctx.moveTo(cx - ux, cy - uy); ctx.lineTo(cx + ux, cy + uy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,200,.35)'; ctx.lineWidth = Math.max(1, hw * .6);
      ctx.beginPath(); ctx.moveTo(cx - ux, cy - uy); ctx.lineTo(cx + ux, cy + uy); ctx.stroke();
    }
    const hub = ctx.createRadialGradient(cx - R * .015, cy - R * .02, 1, cx, cy, R * .055);
    hub.addColorStop(0, '#fff3cf'); hub.addColorStop(.5, '#d9b45f'); hub.addColorStop(1, '#8a6a2c');
    ctx.fillStyle = hub; ctx.beginPath(); ctx.arc(cx, cy, R * .055, 0, Math.PI * 2); ctx.fill();

    // 공 (또렷하게)
    for (const b of s.balls) ctx.drawImage(v.sprites[b.hue % HUES], cx + b.x - br, cy + b.y - br, br * 2, br * 2);

    // 유리 테두리와 반사광
    ctx.strokeStyle = 'rgba(232,206,150,.75)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(232,206,150,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R + 7, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, R * .9, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R * .82, Math.PI * .15, Math.PI * .3); ctx.stroke();

    // 배출구로 튀어나오는 공: 커지면서 추첨번호가 떠오른다
    const f = v.flying;
    if (f) {
      const p = Math.min(1, (now - f.t0) / f.dur);
      const [x0, y0] = f.p0, x1 = 0, y1 = -R - br * 2.4;
      let x = x1, y = y1;
      if (p < .5) { const q = p / .5, e = q < .5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2; x = x0 + (x1 - x0) * e; y = y0 + (y1 - y0) * e; }
      else y = y1 - ((p - .5) / .5) * R * .18;
      const grow = p < .5 ? 1 : 1 + ((p - .5) / .5) * 2.2;
      const r = br * grow;
      // 빛 번짐
      const glow = ctx.createRadialGradient(cx + x, cy + y, r * .5, cx + x, cy + y, r * 3);
      glow.addColorStop(0, `rgba(243,223,170,${.35 * p})`); glow.addColorStop(1, 'rgba(243,223,170,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx + x, cy + y, r * 3, 0, Math.PI * 2); ctx.fill();
      drawNumberBall(ctx, cx + x, cy + y, r, f.label, f.hue, Math.max(0, Math.min(1, (p - .55) / .3)));
    }
  }

  useEffect(() => {
    const hint = busy ? '두근두근…'
      : finished ? '모든 당첨자를 뽑았어요!'
      : auto ? `일괄 추첨 중 · ${revealed}/${ordered.length}명 공개`
      : `Space를 눌러 ${revealed + 1}번째 공을 뽑으세요 · A 전체 공개`;
    onProgress(revealed, hint);
  }, [revealed, busy, auto]);

  function drawOne() {
    const s = sim.current;
    if (busy || finished || !s) return;
    const w = ordered[revealed];
    setBusy(true);
    setCurrent(null);
    const mixMs = fast ? 1000 : 2400;
    s.mixTarget = 1;                       // 바람·회오리·막대가 빨라진다
    sfx.drumroll(mixMs / 1000);
    later(() => {
      const ball = takeTopBall(s);
      if (ball) {
        view.current.flying = { label: w.last4, hue: ball.hue, t0: performance.now(), dur: fast ? 700 : 1300, p0: [ball.x, ball.y] };
        // 아직 뽑히지 않은 사람이 통 안의 공보다 많으면 공을 다시 채운다
        if (pool.length - (revealed + 1) > s.balls.length) later(() => addBall(s), 700);
      }
      sfx.whoosh();
      later(() => { s.mixTarget = 0; }, 300);
      later(() => {
        view.current.flying = null;
        sfx.pop();
        celebrate(false);
        setCurrent(w);
        setRevealed(r => r + 1);
        setBusy(false);
        if (revealed + 1 === ordered.length) later(() => { sfx.fanfare(); celebrate(); onDone(); }, 700);
      }, fast ? 750 : 1350);
    }, mixMs);
  }

  // 일괄 추첨: 공개된 당첨자를 잠시 보여 준 뒤 다음 공을 자동으로 뽑는다
  useAutoStep(auto && !busy && !finished, revealed === 0 ? 900 : fast ? 1300 : 2800, revealed, drawOne);

  useSignal(advance, drawOne);
  useSignal(revealAll, () => {
    if (busy || finished) return;
    setCurrent(ordered[ordered.length - 1]);
    setRevealed(ordered.length);
    sfx.fanfare(); celebrate(); onDone();
  });

  const shownList = ordered.slice(0, revealed);

  return (
    <div className="lotto">
      <div ref={wrapRef} className="lotto-machine" onClick={() => { if (!auto) drawOne(); }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div className="lotto-side">
        <div className={`lotto-reveal${current ? ' show' : ''}`} key={current?.participantId ?? 'none'}>
          {current ? (
            <>
              <span className="kicker">{current.order}번째 당첨{prize && ` · ${prize}`}</span>
              <span className="lr-ball" style={{ background: `radial-gradient(circle at 32% 28%, #fff 0 8%, ${ballColor(current.last4)} 30%, ${shade(ballColor(current.last4), .45)} 100%)` }}><span>{current.last4}</span></span>
              <b className="lr-name">{current.nameMasked}</b>
              <span className="lr-num num4">{current.last4}</span>
            </>
          ) : (
            <span className="lr-wait">{busy ? '공이 섞이는 중…' : `${ordered.length}명 중 ${revealed}명 공개`}</span>
          )}
        </div>
        {shownList.length > 0 && (
          <ol className="lotto-rail">
            {shownList.map(w => (
              <li key={w.participantId}>
                <span className="rail-no">{w.order}</span>
                <b>{w.nameMasked}</b>
                <span className="num4">{w.last4}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function shade(hex: string, k = .6) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
