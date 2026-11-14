import { useEffect, useMemo, useRef, useState } from 'react';
import { type AnimProps, celebrate, useAutoStep, useLater, useSignal, useSize } from './common';
import { shuffled } from '../lib/random';
import * as sfx from '../lib/sound';
import type { WinnerRecord } from '../types';

interface Ball { x: number; y: number; vx: number; vy: number; label: string; }
interface Flying { label: string; t0: number; dur: number; p0: [number, number]; }

/** 보석 톤 공 색 — 추첨번호(뒷 4자리) 구간별 */
const JEWELS = ['#d9b45f', '#3563b0', '#a8324a', '#2f7d5b', '#cfc8b8'];
export const ballColor = (last4: string) => JEWELS[Math.min(4, Math.floor(Number(last4) / 2000))] ?? JEWELS[0];

/** 로또 볼 추첨기: 통 안에서 공이 섞이다가 한 개씩 굴러 나온다. 공에는 추첨번호(휴대폰 뒷 4자리). */
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

  const sim = useRef({ balls: [] as Ball[], blow: 1, flying: null as Flying | null, geo: { cx: 0, cy: 0, R: 0, br: 0 } });

  // 공 만들기 (최대 36개, 번호는 참가자 추첨번호에서 무작위)
  const labels = useMemo(() => shuffled(pool.map(p => p.last4)).slice(0, 36), [pool]);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv || !size.w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    const R = Math.min(size.w * .42, size.h * .38);
    const geo = { cx: size.w / 2, cy: size.h * .52, R, br: Math.max(12, R * .115) };
    const s = sim.current;
    const old = s.geo;
    if (!s.balls.length) {
      s.balls = labels.map((label, i) => {
        const a = (i / labels.length) * Math.PI * 2, r = R * .5 * Math.sqrt((i % 7) / 7 + .1);
        return { x: geo.cx + Math.cos(a) * r, y: geo.cy + Math.sin(a) * r, vx: (Math.random() - .5) * 300, vy: (Math.random() - .5) * 300, label };
      });
    } else if (old.R) {
      const k = R / old.R;
      s.balls.forEach(b => { b.x = geo.cx + (b.x - old.cx) * k; b.y = geo.cy + (b.y - old.cy) * k; });
    }
    s.geo = geo;
  }, [size]);

  // 물리 + 그리기 루프
  useEffect(() => {
    const cv = canvasRef.current!; const ctx = cv.getContext('2d')!;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(.033, (now - last) / 1000); last = now;
      const s = sim.current; const { cx, cy, R, br } = s.geo;
      if (R) {
        const scale = R / 220;
        for (let sub = 0; sub < 2; sub++) {
          const h = dt / 2;
          for (const b of s.balls) {
            b.vy += 900 * scale * h;
            if (b.y > cy + R * .15) { b.vy -= (1400 + 3200 * s.blow * Math.random()) * scale * h * 1.5; b.vx += (Math.random() - .5) * 3600 * s.blow * scale * h; }
            b.vx *= .999; b.vy *= .999;
            b.x += b.vx * h; b.y += b.vy * h;
            const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy), lim = R - br;
            if (d > lim) {
              const nx = dx / d, ny = dy / d;
              b.x = cx + nx * lim; b.y = cy + ny * lim;
              const vn = b.vx * nx + b.vy * ny;
              if (vn > 0) { b.vx -= 1.85 * vn * nx; b.vy -= 1.85 * vn * ny; }
            }
          }
          const bs = s.balls;
          for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
            const a = bs[i], c = bs[j];
            const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy, min = br * 2;
            if (d2 > 0 && d2 < min * min) {
              const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, push = (min - d) / 2;
              a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
              const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
              if (rel < 0) { const imp = rel * .95; a.vx += imp * nx; a.vy += imp * ny; c.vx -= imp * nx; c.vy -= imp * ny; }
            }
          }
        }
      }
      draw(ctx, cv, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, label: string) {
    const base = ballColor(label);
    const grad = ctx.createRadialGradient(x - r * .38, y - r * .42, r * .08, x, y, r);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(.22, base); grad.addColorStop(1, shade(base, .45));
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fbf8f1'; ctx.beginPath(); ctx.ellipse(x, y, r * .66, r * .5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#141a33'; ctx.font = `700 ${r * .5}px Outfit, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, x, y + r * .03);
  }

  function draw(ctx: CanvasRenderingContext2D, cv: HTMLCanvasElement, now: number) {
    const s = sim.current; const { cx, cy, R, br } = s.geo;
    const dpr = cv.width / Math.max(1, cv.clientWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!R) return;
    // 받침대 (어두운 금속 + 금색 테)
    const pg = ctx.createLinearGradient(0, cy + R * .9, 0, cy + R * 1.32);
    pg.addColorStop(0, '#2a2f45'); pg.addColorStop(1, '#11142a');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.moveTo(cx - R * .42, cy + R * .9); ctx.lineTo(cx + R * .42, cy + R * .9); ctx.lineTo(cx + R * .72, cy + R * 1.32); ctx.lineTo(cx - R * .72, cy + R * 1.32); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c9a35a'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#c9a35a'; ctx.fillRect(cx - R * .76, cy + R * 1.32, R * 1.52, 3);
    // 배출구
    ctx.strokeStyle = 'rgba(232,212,160,.35)'; ctx.lineWidth = br * 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - R - br * 1.4); ctx.stroke();
    // 유리 통
    const g = ctx.createRadialGradient(cx - R * .3, cy - R * .4, R * .1, cx, cy, R);
    g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(201,163,90,.05)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    for (const b of s.balls) drawBall(ctx, b.x, b.y, br, b.label);
    ctx.strokeStyle = 'rgba(232,206,150,.75)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(232,206,150,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R + 7, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, R * .9, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke();
    // 날아가는 공
    const f = s.flying;
    if (f) {
      const p = Math.min(1, (now - f.t0) / f.dur);
      const [x0, y0] = f.p0, x1 = cx, y1 = cy - R - br * 2;
      let x = x1, y = y1;
      if (p < .55) { const q = p / .55, e = q < .5 ? 2 * q * q : 1 - (-2 * q + 2) ** 2 / 2; x = x0 + (x1 - x0) * e; y = y0 + (y1 - y0) * e; }
      else y = y1 - ((p - .55) / .45) * R * .25;
      drawBall(ctx, x, y, br * (1 + p * .8), f.label);
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
    if (busy || finished) return;
    const w = ordered[revealed];
    const s = sim.current;
    setBusy(true);
    setCurrent(null);
    const mix = fast ? 900 : 2300;
    s.blow = 3;
    sfx.drumroll(mix / 1000);
    later(() => {
      s.blow = 1;
      // 맨 위에 있는 공을 골라 당첨자 번호로 바꿔 꺼낸다
      const top = s.balls.reduce((m, b, i) => (b.y < s.balls[m].y ? i : m), 0);
      const [ball] = s.balls.splice(top, 1);
      if (ball) {
        s.flying = { label: w.last4, t0: performance.now(), dur: fast ? 600 : 1100, p0: [ball.x, ball.y] };
        if (pool.length > s.balls.length + revealed + 1 && s.balls.length < labels.length) {
          const { cx, cy, R } = s.geo;
          s.balls.push({ x: cx, y: cy + R * .5, vx: 0, vy: -200, label: labels[(revealed + s.balls.length) % labels.length] });
        }
      }
      sfx.whoosh();
      later(() => {
        s.flying = null;
        sfx.pop();
        celebrate(false);
        setCurrent(w);
        setRevealed(r => r + 1);
        setBusy(false);
        if (revealed + 1 === ordered.length) later(() => { sfx.fanfare(); celebrate(); onDone(); }, 700);
      }, fast ? 650 : 1150);
    }, mix);
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
