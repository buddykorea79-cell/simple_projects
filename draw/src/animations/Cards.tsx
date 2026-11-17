import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { type AnimProps, celebrate, fitGrid, useAutoStep, useLater, useSignal, useSize } from './common';
import * as sfx from '../lib/sound';

const PAGE_SIZE = 40;
const GAP = 16;
const ASPECT = .74;

/** deal 덱에서 날아와 깔림 · shuffle 처음 한 번만 섞기 · ready 가지런히 놓인 카드를 한 장씩 뒤집기 */
type Phase = 'deal' | 'shuffle' | 'ready';

interface Model {
  phase: Phase;
  dealt: boolean;
  slot: number[];             // 카드 → 놓인 자리 (섞는 동안 서로 자리를 바꾼다)
  owner: (number | null)[];   // 카드 → 이 페이지의 몇 번째 당첨자인지 (뒤집기 전엔 null — 뒷면이 모두 같다)
  opened: number;             // 이 페이지에서 뒤집은 카드 수
  tilt: number[];             // 섞일 때 기울어지는 각도
  delay: number[];            // 전체 공개 때 물결처럼 차례로 뒤집히는 지연(ms)
}

const freshModel = (n: number): Model => ({
  phase: 'deal', dealt: false, slot: [...Array(n).keys()], owner: Array(n).fill(null),
  opened: 0, tilt: Array(n).fill(0), delay: Array(n).fill(0),
});

const rand = (n: number) => Math.floor(Math.random() * n);   // 연출용 (당첨자는 이미 확정되어 있다)

/**
 * 카드 뒤집기: 덱에서 카드가 날아와 깔리면 처음에 한 번(약 3초) 이리저리 섞이고,
 * 가지런히 정렬된 뒤에는 한 장씩(약 1초) 뒤집으며 이름과 추첨번호를 공개한다. 40장씩 페이지로 나눈다.
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
    ? { deal: 15, shuffle: 1500, every: 160, flip: 550, gap: 450, wave: 30 }
    : { deal: 35, shuffle: 3000, every: 230, flip: 900, gap: 1000, wave: 70 };

  const items = ordered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const n = items.length;
  const first = page * PAGE_SIZE;

  // 페이지가 바뀌면 카드 상태를 새로 만든다 (렌더 중에 바로 바꿔야 카드 수가 어긋나지 않는다)
  const model = useRef<Model>(freshModel(n));
  const modelPage = useRef(page);
  if (modelPage.current !== page) { modelPage.current = page; model.current = freshModel(n); }
  const m = model.current;

  const pendingAll = useRef(false);
  const doneRef = useRef(false);

  const total = first + m.opened;
  const ready = m.phase === 'ready';
  const pageDone = m.opened >= n;
  const finished = total >= ordered.length;

  const g = fitGrid(size.w, size.h, n, ASPECT, GAP, 250);
  const offsetX = (size.w - (g.cols * g.w + (g.cols - 1) * GAP)) / 2;
  const offsetY = (size.h - (g.rows * g.h + (g.rows - 1) * GAP)) / 2;
  const slotXY = (slot: number) => ({ x: offsetX + (slot % g.cols) * (g.w + GAP), y: offsetY + Math.floor(slot / g.cols) * (g.h + GAP) });

  /** 아직 뒤집지 않은 카드 (놓인 자리 순서) */
  const closed = () => m.slot.map((_, s) => s).filter(s => m.owner[s] === null).sort((a, b) => m.slot[a] - m.slot[b]);

  function shuffleAll() {
    if (m.phase !== 'shuffle') return;     // 정렬로 넘어간 뒤 남은 타이머가 다시 흐트러뜨리지 않게
    const cards = closed();
    const slots = cards.map(s => m.slot[s]);
    for (let i = slots.length - 1; i > 0; i--) { const j = rand(i + 1); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    cards.forEach((s, i) => { m.slot[s] = slots[i]; m.tilt[s] = rand(19) - 9; });
    render();
  }

  // 페이지마다: 덱에서 카드가 날아와 깔리고 → 한 번 섞인 뒤 → 가지런히 정렬
  useEffect(() => {
    sfx.whoosh();
    later(() => { model.current.dealt = true; render(); }, 60);
    const dealMs = 500 + n * T.deal;
    later(() => { model.current.phase = 'shuffle'; render(); sfx.drumroll(T.shuffle / 1000); }, dealMs);
    later(() => { const mm = model.current; mm.phase = 'ready'; mm.tilt.fill(0); render(); }, dealMs + T.shuffle);
  }, [page]);

  // 섞는 동안에만 카드들이 빠르게 자리를 바꾼다
  useEffect(() => {
    if (m.phase !== 'shuffle') return;
    shuffleAll();
    const id = window.setInterval(shuffleAll, T.every);
    return () => clearInterval(id);
  }, [m.phase, page]);

  // 섞는 중에 "전체 공개"를 눌렀다면 정렬이 끝나자마자 공개
  useEffect(() => {
    if (ready && pendingAll.current) { pendingAll.current = false; revealRest(); }
  }, [m.phase]);

  useEffect(() => {
    const pageInfo = pages > 1 ? ` · ${page + 1}/${pages} 페이지` : '';
    const hint = !ready ? '카드를 섞는 중…'
      : finished ? '모든 당첨자를 공개했어요!'
      : auto ? `일괄 추첨 중 · ${total}/${ordered.length}명 공개${pageInfo}`
      : !pageDone ? `Space를 누르면 한 장씩 뒤집어요 · 카드를 직접 눌러도 돼요 · A 전체 공개${pageInfo}`
      : `Space를 눌러 다음 ${Math.min(PAGE_SIZE, ordered.length - (page + 1) * PAGE_SIZE)}장 펼치기`;
    onProgress(total, hint);
  }, [m.phase, page, total, auto]);

  function finishAll() {
    if (doneRef.current) return;
    doneRef.current = true;
    sfx.fanfare(); celebrate(); onDone();
  }

  /** 카드 한 장을 뒤집어 다음 순번의 당첨자를 공개 */
  function flip(s: number) {
    if (m.phase !== 'ready' || m.owner[s] !== null) return;
    m.owner[s] = m.opened;
    m.opened += 1;
    render();
    sfx.pop();
    if (first + m.opened >= ordered.length) later(finishAll, T.flip * .6);
  }

  /** 전체 공개: 남은 카드를 놓인 자리 순서대로 물결처럼 차례로 뒤집는다 */
  function revealRest() {
    if (m.phase !== 'ready') { pendingAll.current = true; return; }
    const cards = closed();
    if (!cards.length) return;
    cards.forEach((s, k) => { m.owner[s] = m.opened + k; m.delay[s] = k * T.wave; });
    m.opened = n;
    render();
    cards.forEach((_, k) => later(() => sfx.tick(), k * T.wave));
    const end = cards.length * T.wave + T.flip;
    later(() => { model.current.delay.fill(0); render(); }, end);
    if (first + n >= ordered.length) later(finishAll, end);
  }

  function step() {
    if (m.phase !== 'ready') return;
    const next = closed()[0];
    if (next !== undefined) flip(next);
    else if (page < pages - 1) setPage(page + 1);
  }

  // 일괄 추첨: 약 1초 간격으로 한 장씩 뒤집고, 페이지가 끝나면 잠시 보여 준 뒤 다음 페이지로
  const autoDelay = pageDone ? (fast ? 1200 : 2600) : total === 0 ? 500 : T.gap;
  useAutoStep(auto && ready && !finished, autoDelay, `${page}-${m.opened}-${m.phase}`, step);

  useSignal(advance, step);
  useSignal(revealAll, () => {
    if (ready && pageDone) { if (page < pages - 1) setPage(page + 1); return; }
    revealRest();
  });

  const shuffling = m.phase === 'shuffle';
  const moveMs = m.phase === 'deal' ? 800 : shuffling ? T.every * 1.1 : 700;

  return (
    <div className="cards-stage">
      <div ref={areaRef} className={`cards-area phase-${m.phase}`} style={{ '--move': `${moveMs}ms`, '--flip': `${T.flip}ms` } as CSSProperties}>
        {items.map((_, s) => {
          const own = m.owner[s];
          const w = own === null ? null : items[own];
          let transform: string;
          if (!m.dealt) transform = `translate(${size.w / 2 - g.w / 2}px, ${size.h + 40}px) rotate(${(s % 7) * 9 - 27}deg)`;
          else {
            const { x, y } = slotXY(m.slot[s]);
            transform = `translate(${x}px, ${y}px) rotate(${m.tilt[s]}deg)${shuffling ? ' scale(1.04)' : ''}`;
          }
          const style = {
            width: g.w, height: g.h, transform,
            transitionDelay: m.phase === 'deal' ? `${s * T.deal}ms` : '0ms',
            '--r': `${((s * 37) % 11) - 5}deg`,
            '--d': ((s * 53) % 17) / 17,
            '--cw': `${g.w}px`,
            '--fd': `${m.delay[s]}ms`,
          } as CSSProperties;
          return (
            <button key={`${page}-${s}`} className={`card${w ? ' flipped' : ''}${shuffling ? ' mixing' : ''}`} style={style}
              onClick={() => flip(s)} aria-label={w ? `${w.order}번 당첨 ${w.nameMasked} ${w.last4}` : '카드 뒤집기'}>
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
                      {prize && g.h > 170 && <span className="card-prize">{prize}</span>}
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
