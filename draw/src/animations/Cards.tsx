import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { type AnimProps, celebrate, fitGrid, useAutoStep, useLater, useSignal, useSize } from './common';
import * as sfx from '../lib/sound';

const PAGE_SIZE = 40;
const GAP = 16;
const ASPECT = .74;

/**
 * deal 덱에서 날아와 깔림 · shuffle 처음 섞기 · idle 천천히 자리를 바꾸며 대기
 * mix 빠르게 섞기 · pick 한 장이 가운데로 뽑혀 나옴 · flip 뒤집기 · hold 크게 보여 주기 · wave 전체 공개
 */
type Phase = 'deal' | 'shuffle' | 'idle' | 'mix' | 'pick' | 'flip' | 'hold' | 'wave';

interface Model {
  phase: Phase;
  dealt: boolean;
  slot: number[];             // 카드 → 놓인 자리. 뽑힌 카드는 앞자리부터, 남은 카드는 뒷자리에서 서로 자리를 바꾼다
  owner: (number | null)[];   // 카드 → 이 페이지의 몇 번째 당첨자인지 (뽑히기 전엔 null — 뒷면이 모두 같아 어느 카드든 될 수 있다)
  opened: number;             // 이 페이지에서 뽑힌 카드 수
  active: number | null;      // 지금 가운데로 뽑혀 나온 카드
  landing: number | null;     // 공개를 마치고 제자리로 돌아가는 카드
  tilt: number[];             // 섞일 때 기울어지는 각도
  waveFrom: number;           // 전체 공개를 시작한 자리 (뒤집기 물결 지연)
}

const freshModel = (n: number): Model => ({
  phase: 'deal', dealt: false, slot: [...Array(n).keys()], owner: Array(n).fill(null),
  opened: 0, active: null, landing: null, tilt: Array(n).fill(0), waveFrom: n,
});

const rand = (n: number) => Math.floor(Math.random() * n);   // 연출용 (당첨자는 이미 확정되어 있다)

/**
 * 카드 뒤집기: 뒷면이 같은 카드들이 쉬지 않고 자리를 바꾸며 움직이다가,
 * 뽑을 때마다 빠르게 섞이고 한 장이 가운데로 뽑혀 나와 크게 뒤집힌 뒤 제자리(당첨 순번 자리)로 돌아간다.
 * 40장씩 페이지로 나눈다.
 */
export function Cards({ winners, prize, speed, advance, revealAll, auto, onProgress, onDone }: AnimProps) {
  const later = useLater();
  const [areaRef, size] = useSize<HTMLDivElement>();
  const ordered = useMemo(() => [...winners].sort((a, b) => a.order - b.order), [winners]);
  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const [, render] = useReducer((x: number) => x + 1, 0);
  const fast = speed === 'fast';
  const T = fast
    ? { deal: 15, shuffle: 600, mix: 450, every: 150, pick: 380, flip: 480, hold: 650, back: 380, idle: 950 }
    : { deal: 35, shuffle: 1300, mix: 1000, every: 230, pick: 620, flip: 760, hold: 1300, back: 560, idle: 1250 };

  const items = ordered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const n = items.length;
  const first = page * PAGE_SIZE;

  // 페이지가 바뀌면 카드 상태를 새로 만든다 (렌더 중에 바로 바꿔야 카드 수가 어긋나지 않는다)
  const model = useRef<Model>(freshModel(n));
  const modelPage = useRef(page);
  if (modelPage.current !== page) { modelPage.current = page; model.current = freshModel(n); }
  const m = model.current;

  const run = useRef(0);              // 진행 중인 뽑기 예약을 취소할 때 올린다
  const hovered = useRef<number | null>(null);
  const pendingAll = useRef(false);
  const doneRef = useRef(false);

  const total = first + m.opened;
  const pageDone = m.opened >= n;
  const finished = total >= ordered.length;

  const g = fitGrid(size.w, size.h, n, ASPECT, GAP, 250);
  const offsetX = (size.w - (g.cols * g.w + (g.cols - 1) * GAP)) / 2;
  const offsetY = (size.h - (g.rows * g.h + (g.rows - 1) * GAP)) / 2;
  const slotXY = (slot: number) => ({ x: offsetX + (slot % g.cols) * (g.w + GAP), y: offsetY + Math.floor(slot / g.cols) * (g.h + GAP) });
  // 뽑힌 카드는 무대 가운데에서 크게
  const bigW = Math.max(g.w * 1.2, Math.min(size.w * .32, size.h * .8 * ASPECT));
  const zoom = g.w ? bigW / g.w : 1;
  const centerX = size.w / 2 - g.w / 2, centerY = size.h / 2 - g.h / 2;

  const free = () => m.slot.map((_, s) => s).filter(s => m.owner[s] === null);

  /** 남은 카드 전부의 자리를 섞는다 */
  function shuffleAll() {
    const cards = free();
    const slots = cards.map(s => m.slot[s]);
    for (let i = slots.length - 1; i > 0; i--) { const j = rand(i + 1); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    cards.forEach((s, i) => { m.slot[s] = slots[i]; m.tilt[s] = rand(19) - 9; });
    render();
  }

  /** 대기 중: 몇 쌍씩 천천히 자리를 바꾼다 (마우스를 올린 카드는 그대로) */
  function swapSome() {
    const cards = free().filter(s => s !== hovered.current);
    if (cards.length < 2) return;
    for (let k = Math.max(1, Math.round(cards.length / 8)); k > 0; k--) {
      const a = cards[rand(cards.length)];
      let b = cards[rand(cards.length)];
      if (a === b) b = cards[(cards.indexOf(a) + 1) % cards.length];
      [m.slot[a], m.slot[b]] = [m.slot[b], m.slot[a]];
    }
    cards.forEach(s => { m.tilt[s] = rand(7) - 3; });
    render();
  }

  // 페이지마다: 덱에서 카드가 날아와 깔리고 → 섞인 뒤 → 대기
  useEffect(() => {
    sfx.whoosh();
    later(() => { model.current.dealt = true; render(); }, 60);
    const dealMs = 500 + n * T.deal;
    later(() => { model.current.phase = 'shuffle'; render(); sfx.drumroll(T.shuffle / 1000); }, dealMs);
    later(() => { const mm = model.current; mm.phase = 'idle'; mm.tilt.fill(0); render(); }, dealMs + T.shuffle);
  }, [page]);

  // 카드가 쉬지 않고 움직인다: 섞는 중엔 빠르게, 대기 중엔 천천히
  useEffect(() => {
    if (m.phase === 'shuffle' || m.phase === 'mix') {
      shuffleAll();
      const id = window.setInterval(shuffleAll, T.every);
      return () => clearInterval(id);
    }
    if (m.phase === 'idle' && !pageDone) {
      const id = window.setInterval(swapSome, T.idle);
      return () => clearInterval(id);
    }
  }, [m.phase, page, pageDone, fast]);

  // "전체 공개"를 누른 뒤 지금 뽑던 카드가 끝나면 나머지를 한꺼번에
  useEffect(() => {
    if (m.phase === 'idle' && pendingAll.current) { pendingAll.current = false; revealRest(); }
  }, [m.phase]);

  useEffect(() => {
    const pageInfo = pages > 1 ? ` · ${page + 1}/${pages} 페이지` : '';
    const current = m.active !== null ? items[m.owner[m.active] ?? 0] : null;
    const hint = m.phase === 'deal' || m.phase === 'shuffle' ? '카드를 섞는 중…'
      : m.phase === 'mix' ? '어떤 카드가 뽑힐까요…'
      : m.phase === 'pick' || m.phase === 'flip' ? '두근두근…'
      : m.phase === 'hold' && current ? `${current.order}번째 당첨!${auto ? '' : ' · Space로 다음 카드'}`
      : m.phase === 'wave' ? '남은 카드를 모두 공개해요'
      : finished ? '모든 당첨자를 공개했어요!'
      : auto ? `일괄 추첨 중 · ${total}/${ordered.length}명 공개${pageInfo}`
      : !pageDone ? `Space를 누르면 카드를 섞어 한 장을 뽑아요 · 카드를 직접 눌러도 돼요 · A 전체 공개${pageInfo}`
      : `Space를 눌러 다음 ${Math.min(PAGE_SIZE, ordered.length - (page + 1) * PAGE_SIZE)}장 펼치기`;
    onProgress(total, hint);
  }, [m.phase, page, total, auto]);

  function finishAll() {
    if (doneRef.current) return;
    doneRef.current = true;
    sfx.fanfare(); celebrate(); onDone();
  }

  /** 섞은 뒤(또는 누른 카드를) 한 장 뽑아 가운데로 → 뒤집기 → 크게 보여 주기 */
  function startDraw(chosen?: number) {
    if (m.phase !== 'idle' || pageDone) return;
    const id = ++run.current;
    if (chosen !== undefined) { pick(chosen, id); return; }
    m.phase = 'mix'; render();
    sfx.drumroll(T.mix / 1000);
    later(() => { if (run.current === id) pick(undefined, id); }, T.mix);
  }

  function pick(chosen: number | undefined, id: number) {
    const cards = free();
    if (!cards.length) return;
    const s = chosen !== undefined && m.owner[chosen] === null ? chosen : cards[rand(cards.length)];
    const target = m.opened;                       // 당첨 순번 자리
    const blocker = cards.find(x => m.slot[x] === target);
    if (blocker !== undefined && blocker !== s) m.slot[blocker] = m.slot[s];
    m.slot[s] = target;
    m.owner[s] = target;
    m.opened += 1;
    m.active = s;
    m.tilt.fill(0);
    m.phase = 'pick'; render();
    sfx.whoosh();
    later(() => {
      if (run.current !== id) return;
      m.phase = 'flip'; render();
      later(() => { if (run.current === id) { sfx.pop(); celebrate(false); } }, T.flip * .35);
      later(() => {
        if (run.current !== id) return;
        if (pendingAll.current) { release(); return; }
        m.phase = 'hold'; render();
        later(() => { if (run.current === id) release(); }, T.hold);
      }, T.flip);
    }, T.pick);
  }

  /** 크게 보여 준 카드를 제자리로 돌려보낸다. 돌아가는 동안 다음 카드를 섞을 수 있다. */
  function release() {
    const s = m.active;
    run.current++;
    m.active = null;
    m.landing = s;
    m.phase = 'idle'; render();
    later(() => { if (model.current.landing === s) { model.current.landing = null; render(); } }, T.back);
    if (first + m.opened >= ordered.length) later(finishAll, T.back + 150);
  }

  /** 전체 공개: 남은 카드는 지금 놓인 자리 순서대로 당첨 순번이 되고, 물결처럼 차례로 뒤집힌다 */
  function revealRest() {
    const cards = free().sort((a, b) => m.slot[a] - m.slot[b]);
    if (!cards.length) return;
    const stagger = fast ? 30 : 70;
    run.current++;
    cards.forEach(s => { m.owner[s] = m.slot[s]; m.tilt[s] = 0; });
    m.waveFrom = m.opened;
    m.opened = n;
    m.phase = 'wave'; render();
    cards.forEach((_, k) => later(() => sfx.tick(), k * stagger));
    later(() => {
      model.current.phase = 'idle'; render();
      if (first + n >= ordered.length) finishAll();
    }, cards.length * stagger + 900);
  }

  function step() {
    if (m.phase === 'hold') { release(); startDraw(); return; }   // 크게 보는 중에 누르면 바로 다음 카드
    if (m.phase !== 'idle') return;
    if (!pageDone) startDraw();
    else if (page < pages - 1) setPage(page + 1);
  }

  function onCardClick(s: number) {
    if (m.phase === 'hold') { step(); return; }
    if (!auto && m.phase === 'idle' && m.owner[s] === null) startDraw(s);
  }

  // 일괄 추첨: 한 장씩 차례로 자동으로 뽑고, 페이지가 끝나면 잠시 보여 준 뒤 다음 페이지로
  const autoDelay = pageDone ? (fast ? 1200 : 2600) : total === 0 ? 500 : fast ? 250 : 500;
  useAutoStep(auto && m.phase === 'idle' && !finished, autoDelay, `${page}-${m.opened}-${m.phase}`, step);

  useSignal(advance, step);
  useSignal(revealAll, () => {
    if (m.phase === 'idle' && pageDone) { if (page < pages - 1) setPage(page + 1); return; }
    if (m.phase === 'hold') release();
    else if (m.phase === 'mix') { run.current++; m.phase = 'idle'; render(); }
    if (m.phase === 'idle') revealRest();
    else pendingAll.current = true;      // 뽑고 있던 카드가 공개되면 바로 이어서
  });

  const spot = m.phase === 'pick' || m.phase === 'flip' || m.phase === 'hold';
  const moveMs = m.phase === 'deal' ? 800 : m.phase === 'shuffle' || m.phase === 'mix' ? T.every * 1.1 : m.phase === 'pick' ? T.pick : m.phase === 'idle' ? 1100 : 600;

  return (
    <div className="cards-stage">
      <div ref={areaRef} className={`cards-area phase-${m.phase}${spot ? ' spot' : ''}`} style={{ '--move': `${moveMs}ms` } as CSSProperties}>
        <div className={`cards-glow${m.phase === 'flip' || m.phase === 'hold' ? ' on' : ''}`} />
        {items.map((_, s) => {
          const own = m.owner[s];
          const w = own === null ? null : items[own];
          const isActive = s === m.active;
          const isOpen = w !== null && !(isActive && m.phase === 'pick');
          const mixing = own === null && (m.phase === 'shuffle' || m.phase === 'mix');
          let transform: string;
          if (!m.dealt) {
            transform = `translate(${size.w / 2 - g.w / 2}px, ${size.h + 40}px) rotate(${(s % 7) * 9 - 27}deg)`;
          } else if (isActive) {
            transform = `translate(${centerX}px, ${centerY}px) scale(${zoom})${m.phase === 'pick' ? ' rotate(-6deg)' : ''}`;
          } else {
            const { x, y } = slotXY(m.slot[s]);
            transform = `translate(${x}px, ${y}px) rotate(${m.tilt[s]}deg)${mixing ? ' scale(1.04)' : ''}`;
          }
          const style = {
            width: g.w, height: g.h, transform,
            transitionDelay: m.phase === 'deal' ? `${s * T.deal}ms` : '0ms',
            ...(s === m.landing ? { transitionDuration: `${T.back}ms` } : {}),
            '--r': `${((s * 37) % 11) - 5}deg`,
            '--d': ((s * 53) % 17) / 17,
            '--cw': `${g.w}px`,
            '--fd': m.phase === 'wave' && w ? `${(m.slot[s] - m.waveFrom) * (fast ? 30 : 70)}ms` : '0ms',
          } as CSSProperties;
          const cls = ['card', isOpen && 'flipped', mixing && 'mixing', own === null && m.phase === 'idle' && 'floating',
            isActive && 'active', s === m.landing && 'landing'].filter(Boolean).join(' ');
          return (
            <button key={`${page}-${s}`} className={cls} style={style} onClick={() => onCardClick(s)}
              onPointerEnter={() => { hovered.current = s; }} onPointerLeave={() => { if (hovered.current === s) hovered.current = null; }}
              aria-label={w && isOpen ? `${w.order}번 당첨 ${w.nameMasked} ${w.last4}` : '카드 뽑기'}>
              <span className="card-float">
                <span className="card-inner">
                  <span className="card-back">
                    <span className="card-frame" />
                    <span className="card-q">?</span>
                    <span className="card-mark">◆</span>
                  </span>
                  <span className="card-front">
                    {w && <>
                      <span className="card-order">No. {w.order}</span>
                      <b className="card-name">{w.nameMasked}</b>
                      <span className="card-rule" />
                      <span className="card-num num4">{w.last4}</span>
                      {prize && (g.h > 170 || isActive) && <span className="card-prize">{prize}</span>}
                    </>}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
