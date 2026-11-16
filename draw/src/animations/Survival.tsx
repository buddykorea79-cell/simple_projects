import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { type AnimProps, celebrate, fitGrid, useAutoStep, useLater, useSignal, useSize } from './common';
import { shuffled } from '../lib/random';
import * as sfx from '../lib/sound';
import { WinnerBoard } from './WinnerBoard';

interface Tile { id: string; name: string; last4: string; wave: number; d: number; d2: number; }

/** 서바이벌은 항상 3단계까지만 진행한다. */
export const SURVIVAL_STAGES = 3;

/** 추첨번호(휴대폰 뒷 4자리) 오름차순, 같으면 이름순 */
export const byNumber = (a: { last4: string; name: string }, b: { last4: string; name: string }) =>
  a.last4.localeCompare(b.last4) || a.name.localeCompare(b.name, 'ko');

type Phase = 'intro' | 'ready' | 'scan' | 'cut' | 'regroup' | 'survivors' | 'board';

/**
 * 서바이벌: 참가자 전원을 번호순으로 깔아 두고 단계마다 탈락자를 소거한다.
 * 한 단계가 끝나면 살아남은 사람만 다시 번호순으로 모아 타일을 키워 보여 준다.
 * 수백~수천 명이 참가하고 수백 명이 당첨되는 대량 추첨용.
 */
export function Survival({ pool, winners, prize, speed, advance, revealAll, auto, onProgress, onDone }: AnimProps) {
  const later = useLater();
  const [areaRef, size] = useSize<HTMLDivElement>();
  const fast = speed === 'fast';

  const { tiles, waves, aliveAfter } = useMemo(() => {
    const winIds = new Set(winners.map(w => w.participantId));
    const base = pool.map(p => ({ id: p.id, name: p.nameMasked, last4: p.last4 }));
    // 혹시 풀에 없는 당첨자(재추첨 등)가 있다면 추가
    for (const w of winners) if (!base.some(b => b.id === w.participantId)) base.push({ id: w.participantId, name: w.nameMasked, last4: w.last4 });
    const losers = shuffled(base.filter(b => !winIds.has(b.id)).map(b => b.id));
    const waves = Math.min(SURVIVAL_STAGES, losers.length);
    // 1단계 약 50%, 2단계 남은 탈락자의 약 60%, 마지막 단계에서 나머지 전부
    const shares = [.5, .6, 1];
    const waveOf = new Map<string, number>();
    const aliveAfter = [base.length];
    let idx = 0;
    for (let k = 1; k <= waves; k++) {
      const remaining = losers.length - idx;
      const share = shares[k - 1 + (SURVIVAL_STAGES - waves)];
      const take = k === waves ? remaining : Math.max(1, Math.min(remaining - (waves - k), Math.round(remaining * share)));
      for (let j = 0; j < take; j++) waveOf.set(losers[idx++], k);
      aliveAfter.push(base.length - idx);
    }
    const tiles: Tile[] = base
      .map(b => ({ ...b, wave: waveOf.get(b.id) ?? Infinity, d: Math.random(), d2: Math.random() }))
      .sort(byNumber);
    return { tiles, waves, aliveAfter };
  }, [pool, winners]);

  const [phase, setPhase] = useState<Phase>('intro');
  const [wave, setWave] = useState(0);              // 지금까지 소거된 단계 (탈락 타일이 흐려짐)
  const [layoutWave, setLayoutWave] = useState(0);  // 화면 배치에서 빠진 단계 (살아남은 사람만 다시 정렬)
  const [shown, setShown] = useState(tiles.length);
  const skipRef = useRef(false);                    // "전체 공개": 남은 단계를 빠르게 연속 진행
  const busy = phase !== 'ready';

  // 남은 인원 카운터 애니메이션
  const target = aliveAfter[wave] ?? winners.length;
  useEffect(() => {
    const from = shown; const to = target;
    if (from === to) return;
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      setShown(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  useEffect(() => {
    later(() => { if (waves === 0) finish(); else setPhase('ready'); }, 1300);
  }, []);

  useEffect(() => {
    const next = wave + 1;
    const ready = auto
      ? `일괄 추첨 · 곧 ${next}단계 소거가 시작돼요`
      : wave === 0 ? `참가자 ${tiles.length.toLocaleString()}명 · 번호순 · Space를 눌러 1단계 소거를 시작하세요`
      : next === waves ? `최종 ${next}단계! Space를 눌러 당첨자를 확정하세요` : `${next}단계 / ${waves}단계 · Space로 소거`;
    const hints: Record<Phase, string> = {
      intro: '참가자 입장 중…',
      ready,
      scan: next === waves ? '최종 단계 진행 중…' : `${next}단계 · 누가 살아남을까요…`,
      cut: `${wave}단계 소거`,
      regroup: `살아남은 ${(aliveAfter[wave] ?? 0).toLocaleString()}명을 번호순으로 다시 모았어요`,
      survivors: '축하합니다!',
      board: `당첨자 ${winners.length.toLocaleString()}명 · 번호순`,
    };
    onProgress(phase === 'board' || phase === 'survivors' ? winners.length : 0, hints[phase]);
  }, [phase, wave, auto]);

  // ── 다시 모으기: 탈락자를 배치에서 빼고, 살아남은 타일이 새 자리로 부드럽게 이동 (FLIP) ──
  const tileEls = useRef(new Map<string, HTMLDivElement>());
  const before = useRef<Map<string, DOMRect> | null>(null);

  function regroup(next: number) {
    const rects = new Map<string, DOMRect>();
    tileEls.current.forEach((el, id) => rects.set(id, el.getBoundingClientRect()));
    before.current = rects;
    setLayoutWave(next);
  }

  useLayoutEffect(() => {
    const prev = before.current;
    if (!prev) return;
    before.current = null;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const els = [...tileEls.current.entries()];
    const stagger = Math.min(4, 420 / Math.max(1, els.length));
    els.forEach(([id, el], i) => {
      const a = prev.get(id);
      const b = el.getBoundingClientRect();
      if (!a || !b.width) return;
      const dx = a.left - b.left, dy = a.top - b.top, sx = a.width / b.width, sy = a.height / b.height;
      if (Math.abs(dx) < .5 && Math.abs(dy) < .5 && Math.abs(sx - 1) < .01) return;
      el.animate(
        [{ transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transformOrigin: '0 0', transform: 'none' }],
        { duration: skipRef.current ? 450 : 800, delay: i * stagger, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
      );
    });
  }, [layoutWave]);

  function runWave() {
    if (phase !== 'ready') return;
    const next = wave + 1;
    const final = next === waves;
    const skip = skipRef.current;
    const scanMs = skip ? 500 : fast ? (final ? 1500 : 800) : (final ? 3400 : 1900);
    setPhase('scan');
    sfx.drumroll(scanMs / 1000);
    later(() => {
      sfx.thud();
      setWave(next);
      setPhase('cut');
      later(() => {
        regroup(next);
        setPhase('regroup');
        sfx.whoosh();
        later(() => {
          if (final) finish();
          else { setPhase('ready'); if (skipRef.current) later(() => runWaveRef.current(), 150); }
        }, skip ? 600 : fast ? 900 : 1300);
      }, skip ? 650 : 1200);
    }, scanMs);
  }
  const runWaveRef = useRef(runWave);
  runWaveRef.current = runWave;

  function finish() {
    setPhase('survivors');
    sfx.fanfare();
    celebrate();
    later(() => { setPhase('board'); onDone(); }, 2400);
  }

  // 일괄 추첨: 단계가 끝날 때마다 잠시 쉬었다가 다음 단계 자동 진행
  useAutoStep(auto && phase === 'ready' && !skipRef.current, wave === 0 ? 900 : fast ? 800 : 1600, `${phase}-${wave}`, runWave);

  useSignal(advance, () => { if (!busy) runWave(); });
  useSignal(revealAll, () => {
    if (phase === 'board' || phase === 'survivors') return;
    skipRef.current = true;
    if (phase === 'ready') runWave();
  });

  // 화면에 남아 있는 타일 (이미 정리된 단계의 탈락자는 뺀다). 원래 번호순이라 그대로 번호순.
  const visible = useMemo(() => tiles.filter(t => t.wave > layoutWave), [tiles, layoutWave]);
  const n = visible.length;
  const textGrid = useMemo(() => fitGrid(size.w, size.h, n, 2, 8, 250), [size, n]);
  const textMode = textGrid.w >= 76;
  const gap = textMode ? 8 : n > 1500 ? 2 : 4;
  const grid = useMemo(() => textMode ? textGrid : fitGrid(size.w, size.h, n, 1, gap, 110), [size, n, textMode, textGrid, gap]);

  return (
    <div className={`survival phase-${phase}`}>
      <div className="sv-bar">
        <div className="sv-counter">
          <span className="sv-label">남은 인원</span>
          <b>{shown.toLocaleString()}</b>
          <span className="sv-total">/ {tiles.length.toLocaleString()}</span>
        </div>
        <ol className="sv-stages" aria-label="소거 단계">
          {Array.from({ length: waves }, (_, i) => (
            <li key={i} className={i < wave ? 'done' : i === wave && phase === 'scan' ? 'now' : ''}>
              <span>{i + 1}</span><small>{i === waves - 1 ? '최종' : `${i + 1}단계`}</small>
            </li>
          ))}
        </ol>
        <div className="sv-goal"><span className="sv-label">당첨</span><b>{winners.length.toLocaleString()}</b><span className="sv-total">명{prize && ` · ${prize}`}</span></div>
      </div>
      <div ref={areaRef} className={`sv-area${phase === 'scan' ? ' scanning' : ''}`}>
        <div className={`sv-grid${textMode ? ' text' : ''}`}
          style={{ gridTemplateColumns: `repeat(${grid.cols}, ${grid.w}px)`, gridAutoRows: `${grid.h}px`, gap, '--tw': `${grid.w}px`, '--th': `${grid.h}px` } as CSSProperties}>
          {visible.map(t => {
            const out = t.wave <= wave;
            const won = (phase === 'survivors' || phase === 'board') && t.wave === Infinity;
            return (
              <div key={t.id} ref={el => { if (el) tileEls.current.set(t.id, el); else tileEls.current.delete(t.id); }}
                className={`sv-tile${out ? ' out' : ''}${won ? ' win' : ''}`} style={{ '--d': t.d, '--d2': t.d2 } as CSSProperties}>
                {textMode ? <><b>{t.name}</b><span className="num4">{t.last4}</span></> : grid.w >= 34 ? <span className="num4">{t.last4}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
      {phase === 'board' && <WinnerBoard winners={winners} prize={prize} sortByNumber />}
    </div>
  );
}
