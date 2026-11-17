import { useMemo, useState } from 'react';
import { LOTTO_MAX, eligiblePool, recommendMethod, useDraw } from '../store';
import type { Method, Round } from '../types';
import { Icon, type IconName } from './Icon';

export const METHODS: { id: Method; icon: IconName; name: string; fit: string; desc: string }[] = [
  { id: 'lotto', icon: 'lotto', name: '로또 볼 추첨기', fit: `최대 ${LOTTO_MAX}명 · 대상 추첨`, desc: '공이 유리 통 안에서 섞이다가 하나씩 굴러 나와요. 오른쪽 명단에 당첨자가 한 줄씩 쌓여요.' },
  { id: 'cards', icon: 'cards', name: '카드 뒤집기', fit: '10~60명', desc: '카드들이 쉬지 않고 자리를 바꾸다가, 한 장이 가운데로 뽑혀 나와 크게 뒤집히며 이름과 추첨번호를 공개해요.' },
  { id: 'survival', icon: 'survival', name: '서바이벌', fit: '수십~수백 명 · 대량 추첨', desc: '참가자 전원이 번호순으로 깔리고 3단계에 걸쳐 탈락자가 꺼져요. 단계마다 살아남은 사람을 번호순으로 다시 모아 크게 보여 줘요.' },
];

export function RoundSetup({ onStart }: { onStart(round: Round): void }) {
  const { participants, rounds, drawRound, settings, setSettings } = useDraw();
  const nextNo = rounds.reduce((m, r) => Math.max(m, r.roundNo), 0) + 1;
  const [roundNo, setRoundNo] = useState(nextNo);
  const [label, setLabel] = useState('');
  const [prize, setPrize] = useState('');
  const [countText, setCountText] = useState('5');
  const [exclude, setExclude] = useState(true);
  const [method, setMethod] = useState<Method | null>(null);
  const [error, setError] = useState('');

  const pool = useMemo(() => eligiblePool(participants, rounds, exclude), [participants, rounds, exclude]);
  const count = Number(countText);
  const countValid = Number.isInteger(count) && count >= 1 && count <= pool.length;
  const recommended = recommendMethod(countValid ? count : 1);
  const lottoLocked = countValid && count > LOTTO_MAX;
  const chosen = method && !(method === 'lotto' && lottoLocked) ? method : recommended;
  const excludedCount = participants.length - pool.length;
  const autoLabel = `${roundNo}차`;
  const dupRound = rounds.some(r => r.roundNo === roundNo);
  const isAuto = settings.progress === 'auto';

  function start() {
    setError('');
    if (!participants.length) return setError('먼저 참가자 명단을 불러와 주세요.');
    if (!Number.isInteger(roundNo) || roundNo < 1) return setError('차수는 1 이상의 숫자로 입력해 주세요.');
    if (dupRound) return setError(`${roundNo}차는 이미 추첨했어요. 다른 차수 번호를 넣거나 결과 화면에서 해당 차수를 삭제해 주세요.`);
    if (!countValid) return setError(pool.length ? `당첨 인원은 1~${pool.length.toLocaleString()}명 사이로 입력해 주세요.` : '추첨할 수 있는 참가자가 남아 있지 않아요.');
    try {
      const round = drawRound({ roundNo, label: label.trim() || autoLabel, prize: prize.trim(), winnerCount: count, method: chosen, progress: settings.progress, excludePrevWinners: exclude });
      setRoundNo(roundNo + 1); setLabel(''); setPrize(''); setMethod(null);
      onStart(round);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  if (!participants.length) {
    return (
      <section className="panel empty">
        <span className="empty-icon"><Icon name="user" size={30} /></span>
        <h2>아직 참가자 명단이 없어요</h2>
        <p className="sub">1단계에서 CSV·구글 시트를 불러오거나 샘플 데이터로 먼저 체험해 보세요.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="kicker">Round</span>
            <h2>이번 차수 설정</h2>
            <p className="sub">추첨 버튼을 누르는 순간 당첨자가 암호학적 난수로 확정되고, 연출은 그 결과를 보여 주기만 해요.</p>
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">차수</span>
            <div className="suffix-input"><input className="input" type="number" min={1} value={roundNo} onChange={e => setRoundNo(Number(e.target.value))} /><span>차</span></div>
            {dupRound && <small className="err">이미 있는 차수예요</small>}
          </label>
          <label className="field">
            <span className="field-label">차수 이름 <small>(선택)</small></span>
            <input className="input" placeholder={autoLabel} value={label} onChange={e => setLabel(e.target.value)} maxLength={30} />
          </label>
          <label className="field wide">
            <span className="field-label">경품 <small>(선택)</small></span>
            <input className="input" placeholder="예) 커피 쿠폰, 무선 이어폰" value={prize} onChange={e => setPrize(e.target.value)} maxLength={40} />
          </label>
          <label className="field">
            <span className="field-label">당첨 인원</span>
            <div className="suffix-input"><input className="input" type="number" min={1} max={pool.length} value={countText} onChange={e => setCountText(e.target.value)} /><span>명</span></div>
            {!countValid && countText !== '' && <small className="err">1~{pool.length.toLocaleString()}명</small>}
          </label>
        </div>

        <div className="pool-line">
          <label className="check">
            <input type="checkbox" checked={exclude} onChange={e => setExclude(e.target.checked)} />
            <span>이전 차수 당첨자(불참 취소 포함) 제외</span>
          </label>
          <span className="pool-count">추첨 대상 <b>{pool.length.toLocaleString()}</b>명{exclude && excludedCount > 0 && <> · {excludedCount}명 제외</>}</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><span className="kicker">Method</span><h2>추첨 방식</h2><p className="sub">당첨 인원에 맞는 방식을 추천해 드려요. 로또 볼은 {LOTTO_MAX}명까지, 카드·서바이벌은 인원 제한이 없어요.</p></div></div>
        <div className="methods" role="radiogroup" aria-label="추첨 방식">
          {METHODS.map(m => (
            <button key={m.id} role="radio" aria-checked={chosen === m.id} className={`method${chosen === m.id ? ' on' : ''}`} onClick={() => setMethod(m.id)}
              disabled={m.id === 'lotto' && lottoLocked} title={m.id === 'lotto' && lottoLocked ? `로또 볼은 ${LOTTO_MAX}명까지 뽑을 수 있어요` : undefined}>
              {recommended === m.id && <span className="badge">추천</span>}
              {m.id === 'lotto' && lottoLocked && <span className="badge off">{LOTTO_MAX}명까지</span>}
              <span className="method-icon"><Icon name={m.icon} size={26} /></span>
              <strong>{m.name}</strong>
              <span className="fit">{m.fit}</span>
              <span className="desc">{m.desc}</span>
            </button>
          ))}
        </div>

        <div className="progress-pick">
          <span className="field-label">진행 방식</span>
          <div className="progress-options" role="radiogroup" aria-label="진행 방식">
            <button role="radio" aria-checked={!isAuto} className={`progress-opt${!isAuto ? ' on' : ''}`} onClick={() => setSettings({ progress: 'manual' })}>
              <Icon name="hand" size={22} />
              <span><b>수동 추첨</b><small>진행자가 Space·클릭으로 한 명(한 단계)씩 공개</small></span>
            </button>
            <button role="radio" aria-checked={isAuto} className={`progress-opt${isAuto ? ' on' : ''}`} onClick={() => setSettings({ progress: 'auto' })}>
              <Icon name="auto" size={22} />
              <span><b>일괄 추첨</b><small>누르지 않아도 한 명씩 차례로 자동 공개 · Space로 일시정지</small></span>
            </button>
          </div>
        </div>

        <div className="start-row">
          <div className="option">
            <span className="field-label">연출 속도</span>
            <div className="chips">
              <button className={settings.speed === 'normal' ? 'chip on' : 'chip'} onClick={() => setSettings({ speed: 'normal' })}>보통 (긴장감)</button>
              <button className={settings.speed === 'fast' ? 'chip on' : 'chip'} onClick={() => setSettings({ speed: 'fast' })}>빠르게</button>
            </div>
          </div>
          <button className="btn primary big" onClick={start} disabled={!countValid || dupRound}>
            <Icon name={isAuto ? 'auto' : 'play'} size={20} />{label.trim() || autoLabel} {countValid ? `${count.toLocaleString()}명 ` : ''}{isAuto ? '일괄 추첨 시작' : '추첨 시작'}
          </button>
        </div>
        {error && <div className="notice error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
      </section>
    </div>
  );
}
