import type { CSSProperties } from 'react';
import type { WinnerRecord } from '../types';

/** 당첨자 명단 보드 — 이름과 추첨번호(휴대폰 뒷 4자리)를 크게. 수백 명도 스크롤로 볼 수 있다. */
export function WinnerBoard({ winners, prize }: { winners: WinnerRecord[]; prize: string }) {
  const size = winners.length > 120 ? 'xs' : winners.length > 40 ? 'sm' : winners.length > 12 ? 'md' : 'lg';
  return (
    <div className="wb">
      <div className="wb-head">
        <span className="kicker">Congratulations</span>
        <h3>당첨자 <em>{winners.length.toLocaleString()}</em>명{prize && <small>{prize}</small>}</h3>
      </div>
      <ol className={`wb-list ${size}`}>
        {[...winners].sort((a, b) => a.order - b.order).map((w, i) => (
          <li key={w.participantId} style={{ '--i': Math.min(i, 60) } as CSSProperties}>
            <span className="wb-no">{w.order}</span>
            <b className="wb-name">{w.nameMasked}</b>
            <span className="wb-num num4">{w.last4}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
