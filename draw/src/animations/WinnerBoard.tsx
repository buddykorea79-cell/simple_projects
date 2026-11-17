import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { WinnerRecord } from '../types';
import { useSize } from './common';

export type BoardMode = 'row' | 'stack' | 'num';
export interface BoardLayout { mode: BoardMode; cols: number; rows: number; w: number; h: number; gap: number; font: number; }

const MAX_FONT = 46;
const MIN_FONT = 11;

/** 열 수를 하나씩 늘려 보며 W×H를 꽉 채우는 칸 중 글자가 가장 커지는 배치를 찾는다 */
function search(W: number, H: number, n: number, gap: number, maxW: number, maxH: number, fontOf: (w: number, h: number) => number) {
  let best = { cols: 1, rows: n, w: 0, h: 0, font: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const w = Math.min(maxW, (W - gap * (cols - 1)) / cols);
    const h = Math.min(maxH, (H - gap * (rows - 1)) / rows);
    if (w <= 0) break;
    if (h <= 0) continue;
    const font = fontOf(w, h);
    if (font > best.font) best = { cols, rows, w: Math.floor(w), h: Math.floor(h), font };
  }
  return best;
}

/**
 * 당첨자 n명을 W×H 안에 스크롤 없이 배치한다.
 * 이름·번호 한 줄(row)과 두 줄(stack) 가운데 글자가 더 커지는 쪽을 고르고 (비슷하면 한 줄),
 * 너무 많아 이름이 읽히지 않을 크기면 추첨번호만(num) 보여 준다.
 */
export function boardLayout(W: number, H: number, n: number, nameLen = 3, numbered = false): BoardLayout {
  if (n <= 0 || W <= 0 || H <= 0) return { mode: 'row', cols: 1, rows: 1, w: 0, h: 0, gap: 10, font: MIN_FONT };
  const nameEm = Math.max(3, nameLen) * .95;
  const rowEm = nameEm + (numbered ? 1.8 : 0) + 4 * .62 + .9;   // 이름 + 순번 + 번호 4자리 + 사이 간격
  const row = search(W, H, n, 10, 440, 112, (w, h) => Math.min(h * .42, (w - 26) / rowEm));
  const stack = search(W, H, n, 8, 240, 140, (w, h) => Math.min(h * .34, (w - 12) / (nameEm + .2)));
  const useRow = row.font >= stack.font * .88;
  const pick = useRow ? row : stack;
  if (pick.font >= MIN_FONT) return { mode: useRow ? 'row' : 'stack', ...pick, gap: useRow ? 10 : 8, font: Math.floor(Math.min(MAX_FONT, pick.font)) };
  const num = search(W, H, n, 4, 130, 80, (w, h) => Math.min(h * .5, (w - 6) / 2.7));
  return { mode: 'num', ...num, gap: 4, font: Math.max(6, Math.floor(num.font)) };
}

/**
 * 당첨자 명단 보드 — 이름과 추첨번호(휴대폰 뒷 4자리)를 크게. 인원이 많아도 스크롤 없이 한 화면에 모두 보여 준다.
 * sortByNumber: 추첨번호 오름차순으로 늘어놓아 자기 번호를 찾기 쉽게 (순번 배지는 숨김)
 */
export function WinnerBoard({ winners, prize, sortByNumber = false }: { winners: WinnerRecord[]; prize: string; sortByNumber?: boolean }) {
  const [fitRef, size] = useSize<HTMLDivElement>();
  const list = useMemo(() => [...winners].sort(sortByNumber
    ? (a, b) => a.last4.localeCompare(b.last4) || a.nameMasked.localeCompare(b.nameMasked, 'ko')
    : (a, b) => a.order - b.order), [winners, sortByNumber]);
  const nameLen = useMemo(() => list.reduce((mx, w) => Math.max(mx, [...w.nameMasked].length), 3), [list]);
  const L = boardLayout(size.w, size.h, list.length, nameLen, !sortByNumber);
  const note = [sortByNumber && '추첨번호(휴대폰 뒷 4자리) 순서', L.mode === 'num' && '인원이 많아 추첨번호만 표시'].filter(Boolean).join(' · ');

  return (
    <div className={`wb${list.length > 24 ? ' compact' : ''}`}>
      <div className="wb-head">
        <span className="kicker">Congratulations</span>
        <h3>당첨자 <em>{winners.length.toLocaleString()}</em>명{prize && <small>{prize}</small>}</h3>
        {note && <p className="wb-note">{note}</p>}
      </div>
      <div ref={fitRef} className="wb-fit">
        {size.w > 0 && (
          <ol className={`wb-list ${L.mode}`}
            style={{ gridTemplateColumns: `repeat(${L.cols}, ${L.w}px)`, gridAutoRows: `${L.h}px`, gap: L.gap, '--fs': `${L.font}px` } as CSSProperties}>
            {list.map((w, i) => (
              <li key={w.participantId} style={{ '--i': Math.min(i, 60) } as CSSProperties} title={L.mode === 'num' ? w.nameMasked : undefined}>
                {!sortByNumber && L.mode === 'row' && <span className="wb-no">{w.order}</span>}
                {L.mode !== 'num' && <b className="wb-name">{w.nameMasked}</b>}
                <span className="wb-num num4">{w.last4}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
