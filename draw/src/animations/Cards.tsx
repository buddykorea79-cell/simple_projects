import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { type AnimProps, celebrate, fitGrid, useAutoStep, useLater, useSignal, useSize } from './common';
import * as sfx from '../lib/sound';

const PAGE_SIZE = 40;
const GAP = 16;

/** 카드 뒤집기: 당첨 인원만큼 카드를 깔고 한 장씩/한꺼번에 공개. 40장씩 페이지로 나눈다. */
export function Cards({ winners, prize, speed, advance, revealAll, auto, onProgress, onDone }: AnimProps) {
  const later = useLater();
  const [areaRef, size] = useSize<HTMLDivElement>();
  const ordered = useMemo(() => [...winners].sort((a, b) => a.order - b.order), [winners]);
  const pages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const [page, setPage] = useState(0);
  const [dealt, setDealt] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [ready, setReady] = useState(false);       // 카드가 다 깔리고 섞인 뒤에만 공개 가능
  const [flipped, setFlipped] = useState<Set<number>>(new Set());   // 전체 인덱스 기준
  const [done, setDone] = useState(false);
  const fast = speed === 'fast';

  const items = ordered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const first = page * PAGE_SIZE;
  const pageFlipped = items.every((_, i) => flipped.has(first + i));
  const totalFlipped = flipped.size;

  const g = fitGrid(size.w, size.h, items.length, .74, GAP, 250);
  const offsetX = (size.w - (g.cols * g.w + (g.cols - 1) * GAP)) / 2;
  const offsetY = (size.h - (g.rows * g.h + (g.rows - 1) * GAP)) / 2;

  // 페이지마다: 덱에서 카드가 날아와 깔리고 → 섞인 뒤 → 공개 대기
  useEffect(() => {
    setDealt(false); setShuffling(false); setReady(false);
    sfx.whoosh();
    later(() => setDealt(true), 60);
    const dealMs = 500 + items.length * (fast ? 15 : 35);
    later(() => { setShuffling(true); sfx.drumroll(fast ? .6 : 1.3); }, dealMs);
    later(() => { setShuffling(false); setReady(true); }, dealMs + (fast ? 700 : 1500));
  }, [page]);

  useEffect(() => {
    const pageInfo = pages > 1 ? ` · ${page + 1}/${pages} 페이지` : '';
    const hint = !ready ? '카드를 섞는 중…'
      : auto ? (totalFlipped < ordered.length ? `일괄 추첨 중 · ${totalFlipped}/${ordered.length}명 공개${pageInfo}` : '모든 당첨자를 공개했어요!')
      : !pageFlipped ? `카드를 누르거나 Space로 한 장씩 · A 전체 공개${pageInfo}`
      : page < pages - 1 ? `Space를 눌러 다음 ${Math.min(PAGE_SIZE, ordered.length - (page + 1) * PAGE_SIZE)}장 펼치기` : '모든 당첨자를 공개했어요!';
    onProgress(totalFlipped, hint);
  }, [ready, pageFlipped, page, totalFlipped, auto]);

  useEffect(() => {
    if (!done && totalFlipped === ordered.length && ordered.length > 0) {
      setDone(true);
      later(() => { sfx.fanfare(); celebrate(); onDone(); }, 450);
    }
  }, [totalFlipped]);

  function flip(globalIndex: number) {
    if (!ready || flipped.has(globalIndex)) return;
    sfx.pop();
    setFlipped(prev => new Set(prev).add(globalIndex));
  }

  function step() {
    if (!ready) return;
    if (!pageFlipped) {
      const next = items.findIndex((_, i) => !flipped.has(first + i));
      if (next >= 0) flip(first + next);
    } else if (page < pages - 1) setPage(page + 1);
  }

  // 일괄 추첨: 한 장씩 차례로 자동으로 뒤집고, 페이지가 끝나면 잠시 보여 준 뒤 다음 페이지로
  const autoDelay = pageFlipped ? (fast ? 1200 : 2600) : totalFlipped === 0 ? 500 : fast ? 380 : 1000;
  useAutoStep(auto && ready && !done, autoDelay, `${page}-${totalFlipped}-${ready}`, step);

  useSignal(advance, step);
  useSignal(revealAll, () => {
    if (!ready) return;
    if (pageFlipped) { if (page < pages - 1) setPage(page + 1); return; }
    items.forEach((_, i) => {
      if (flipped.has(first + i)) return;
      later(() => { sfx.tick(); setFlipped(prev => new Set(prev).add(first + i)); }, i * (fast ? 30 : 70));
    });
  });

  return (
    <div className="cards-stage">
      <div ref={areaRef} className="cards-area">
        {items.map((w, i) => {
          const gi = first + i;
          const col = i % g.cols, row = Math.floor(i / g.cols);
          const x = offsetX + col * (g.w + GAP), y = offsetY + row * (g.h + GAP);
          const deckX = size.w / 2 - g.w / 2, deckY = size.h + 40;
          const style = {
            width: g.w, height: g.h,
            transform: dealt ? `translate(${x}px, ${y}px)` : `translate(${deckX}px, ${deckY}px) rotate(${(i % 7) * 9 - 27}deg)`,
            transitionDelay: dealt ? `${i * (fast ? 15 : 35)}ms` : '0ms',
            '--r': `${((i * 37) % 11) - 5}deg`,
            '--cw': `${g.w}px`,
          } as CSSProperties;
          const isOpen = flipped.has(gi);
          return (
            <button key={w.participantId} className={`card${isOpen ? ' flipped' : ''}${shuffling ? ' shuffling' : ''}`} style={style}
              onClick={() => flip(gi)} aria-label={isOpen ? `${w.order}번 당첨 ${w.nameMasked} ${w.last4}` : `${w.order}번 카드 뒤집기`}>
              <span className="card-inner">
                <span className="card-back">
                  <span className="card-frame" />
                  <span className="card-no">{String(w.order).padStart(2, '0')}</span>
                  <span className="card-mark">◆</span>
                </span>
                <span className="card-front">
                  <span className="card-order">No. {w.order}</span>
                  <b className="card-name">{w.nameMasked}</b>
                  <span className="card-rule" />
                  <span className="card-num num4">{w.last4}</span>
                  {prize && g.h > 170 && <span className="card-prize">{prize}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
