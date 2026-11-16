import type { CSSProperties } from 'react';
import type { WinnerRecord } from '../types';

/**
 * 당첨자 명단 보드 — 이름과 추첨번호(휴대폰 뒷 4자리)를 크게. 수백 명도 스크롤로 볼 수 있다.
 * sortByNumber: 추첨번호 오름차순으로 늘어놓아 자기 번호를 찾기 쉽게 (순번 배지는 숨김)
 */
export function WinnerBoard({ winners, prize, sortByNumber = false }: { winners: WinnerRecord[]; prize: string; sortByNumber?: boolean }) {
  const size = winners.length > 120 ? 'xs' : winners.length > 40 ? 'sm' : winners.length > 12 ? 'md' : 'lg';
  const list = [...winners].sort(sortByNumber
    ? (a, b) => a.last4.localeCompare(b.last4) || a.nameMasked.localeCompare(b.nameMasked, 'ko')
    : (a, b) => a.order - b.order);
  return (
    <div className="wb">
      <div className="wb-head">
        <span className="kicker">Congratulations</span>
        <h3>당첨자 <em>{winners.length.toLocaleString()}</em>명{prize && <small>{prize}</small>}</h3>
        {sortByNumber && <p className="wb-note">추첨번호(휴대폰 뒷 4자리) 순서</p>}
      </div>
      <ol className={`wb-list ${size}${sortByNumber ? ' by-number' : ''}`}>
        {list.map((w, i) => (
          <li key={w.participantId} style={{ '--i': Math.min(i, 60) } as CSSProperties}>
            {!sortByNumber && <span className="wb-no">{w.order}</span>}
            <b className="wb-name">{w.nameMasked}</b>
            <span className="wb-num num4">{w.last4}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
