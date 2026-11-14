import { useEffect, useMemo, useState } from 'react';
import { getRaw, useDraw } from '../store';
import type { Round, WinnerRecord } from '../types';
import { buildWinnersCsv, csvFileName, downloadText, formatDateTime } from '../lib/exportCsv';
import { METHODS } from './RoundSetup';
import { Icon } from './Icon';
import * as sfx from '../lib/sound';
import { celebrate } from '../animations/common';

export function ResultBoard({ onReplay }: { onReplay(round: Round): void }) {
  const { rounds, deleteRound, redraw, rawCount, resetAll, settings, source } = useDraw();
  const [includeRaw, setIncludeRaw] = useState(false);
  const [query, setQuery] = useState('');
  const [redrawFor, setRedrawFor] = useState<{ round: Round; winner: WinnerRecord } | null>(null);
  const [result, setResult] = useState<{ round: Round; rec: WinnerRecord } | null>(null);
  const [error, setError] = useState('');

  const sorted = useMemo(() => [...rounds].sort((a, b) => b.roundNo - a.roundNo), [rounds]);
  const totalWon = rounds.reduce((n, r) => n + r.winners.filter(w => w.status === 'won').length, 0);
  const q = query.trim();
  const match = (w: WinnerRecord) => !q || w.nameMasked.includes(q) || w.last4.includes(q);

  function download() {
    const csv = buildWinnersCsv(rounds, includeRaw && rawCount ? getRaw() : undefined);
    downloadText(csvFileName(), csv);
  }

  function confirmRedraw() {
    if (!redrawFor) return;
    try {
      setError('');
      const rec = redraw(redrawFor.round.id, redrawFor.winner.order);
      setResult({ round: redrawFor.round, rec });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setRedrawFor(null);
  }

  if (!rounds.length) {
    return (
      <section className="panel empty">
        <span className="empty-icon"><Icon name="gift" size={30} /></span>
        <h2>아직 추첨한 차수가 없어요</h2>
        <p className="sub">2단계에서 차수·인원·방식을 정하고 추첨을 시작하면 여기에 결과가 쌓여요.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="kicker">Results</span>
            <h2>추첨 결과 <span className="big-num">{totalWon.toLocaleString()}</span>명</h2>
            <p className="sub">{rounds.length}개 차수 · 화면에는 가린 이름과 추첨번호(휴대폰 뒷 4자리)만 보여요.</p>
          </div>
          <div className="head-actions">
            <label className={`check${rawCount ? '' : ' disabled'}`} title={rawCount ? '' : '원본 정보가 메모리에 없어요'}>
              <input type="checkbox" checked={includeRaw && !!rawCount} disabled={!rawCount} onChange={e => setIncludeRaw(e.target.checked)} />
              <span>원본 이름·번호 포함</span>
            </label>
            <button className="btn primary" onClick={download}><Icon name="download" size={18} />당첨자 CSV 다운로드</button>
          </div>
        </div>
        {includeRaw && !!rawCount && <div className="notice warn"><Icon name="alert" size={18} /><span>원본 개인정보가 들어간 파일이에요. 경품 발송이 끝나면 파일을 지워 주세요.</span></div>}
        {!rawCount && <p className="hint">{source?.type === 'appsScript'
          ? 'Apps Script 방식은 원본을 받지 않아요. CSV의 "원본행"으로 구글 시트에서 당첨자를 찾아 주세요.'
          : '원본 포함 CSV가 필요하면 1단계에서 같은 명단을 다시 불러오세요. (원본은 저장하지 않아요)'}</p>}
        {error && <div className="notice error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
        <div className="search">
          <input className="input" placeholder="이름 일부나 추첨번호(뒷 4자리)로 찾기" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </section>

      {sorted.map(r => {
        const list = [...r.winners].sort((a, b) => a.order - b.order).filter(match);
        const m = METHODS.find(x => x.id === r.method)!;
        return (
          <details key={r.id} className="panel round" open={r === sorted[0] || !!q}>
            <summary>
              <span className="round-tag">{r.label}</span>
              <span className="round-title"><b>{r.prize || '경품'}</b><small>{m.name} · {r.progress === 'auto' ? '일괄' : '수동'} · 대상 {r.poolSize.toLocaleString()}명 · {formatDateTime(r.drawnAt)}</small></span>
              <span className="round-count">{r.winners.filter(w => w.status === 'won').length}명</span>
            </summary>
            <div className="round-actions">
              <button className="btn ghost sm" onClick={() => onReplay(r)}><Icon name="eye" size={16} />무대에서 다시 보기</button>
              <button className="btn ghost sm danger" onClick={() => { if (confirm(`${r.label} 결과를 지울까요? 지운 차수는 되돌릴 수 없어요.`)) deleteRound(r.id); }}><Icon name="trash" size={16} />차수 삭제</button>
            </div>
            <div className="table-wrap tall">
              <table className="table">
                <thead><tr><th>순번</th><th>추첨번호</th><th>이름</th><th>원본 행</th><th>상태</th><th></th></tr></thead>
                <tbody>
                  {list.map(w => (
                    <tr key={w.participantId + w.order} className={w.status === 'cancelled' ? 'cancelled' : ''}>
                      <td className="num">{w.order}</td>
                      <td className="num4 strong">{w.last4}</td>
                      <td className="strong">{w.nameMasked}</td>
                      <td className="num">{w.rowNo}</td>
                      <td>{w.status === 'cancelled' ? <span className="pill gray">취소(불참)</span> : w.replacementFor ? <span className="pill gold">재추첨 ({w.replacementFor}번 대신)</span> : <span className="pill green">당첨</span>}</td>
                      <td className="right">{w.status === 'won' && <button className="link-btn" onClick={() => setRedrawFor({ round: r, winner: w })}>불참 · 재추첨</button>}</td>
                    </tr>
                  ))}
                  {!list.length && <tr><td colSpan={6} className="muted center">찾는 당첨자가 없어요</td></tr>}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}

      <div className="danger-zone">
        <span>행사가 끝났다면 이 브라우저에 남은 명단과 결과를 모두 지우세요.</span>
        <button className="btn ghost sm danger" onClick={() => { if (confirm('명단과 모든 차수 결과를 지울까요? CSV를 먼저 내려받았는지 확인해 주세요. 되돌릴 수 없어요.')) resetAll(); }}><Icon name="trash" size={16} />모든 데이터 지우기</button>
      </div>

      {redrawFor && (
        <div className="modal-back" onClick={() => setRedrawFor(null)}>
          <div className="modal small" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <h3>{redrawFor.round.label} {redrawFor.winner.order}번 당첨자를 취소하고 다시 뽑을까요?</h3>
            <p className="sub"><b>{redrawFor.winner.nameMasked}</b> ({redrawFor.winner.last4}) 님은 "취소(불참)"로 기록되고, 이 차수 당첨자와 {redrawFor.round.excludePrevWinners ? '이전 당첨자를 ' : ''}제외한 사람 중에서 1명을 새로 뽑아요.</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setRedrawFor(null)}>그만두기</button>
              <button className="btn primary" onClick={confirmRedraw}>취소하고 재추첨</button>
            </div>
          </div>
        </div>
      )}
      {result && <RedrawReveal result={result} sound={settings.sound} onClose={() => setResult(null)} />}
    </div>
  );
}

/** 재추첨 결과를 짧은 룰렛으로 보여 준다 (결과는 이미 확정). */
function RedrawReveal({ result, sound, onClose }: { result: { round: Round; rec: WinnerRecord }; sound: boolean; onClose(): void }) {
  const { participants } = useDraw();
  const [name, setName] = useState('');
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    sfx.setSoundEnabled(sound);
    sfx.drumroll(1.8);
    const t0 = performance.now();
    let id = 0;
    const spin = () => {
      const p = (performance.now() - t0) / 1800;
      if (p >= 1) { setName(result.rec.nameMasked); setLanded(true); sfx.pop(); celebrate(false); return; }
      setName(participants[Math.floor(Math.random() * participants.length)]?.nameMasked ?? '');
      id = window.setTimeout(spin, 40 + p * p * 220);
    };
    spin();
    return () => clearTimeout(id);
  }, [result, participants, sound]);
  return (
    <div className="modal-back dark" onClick={landed ? onClose : undefined}>
      <div className="redraw" role="dialog" aria-modal="true" aria-live="polite">
        <span className="redraw-kicker">{result.round.label} 재추첨 · {result.rec.order}번</span>
        <b className={landed ? 'landed' : ''}>{name}</b>
        <span className="redraw-num num4">{landed ? result.rec.last4 : '····'}</span>
        {landed && <button className="sbtn gold" onClick={onClose}>확인</button>}
      </div>
    </div>
  );
}
