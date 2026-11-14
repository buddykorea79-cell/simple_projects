import { useCallback, useEffect, useState } from 'react';
import { useDraw } from './store';
import type { Round } from './types';
import { DataLoader } from './components/DataLoader';
import { RoundSetup } from './components/RoundSetup';
import { ResultBoard } from './components/ResultBoard';
import { Stage } from './components/Stage';
import { Guide } from './components/Guide';
import { Icon } from './components/Icon';

type Step = 'data' | 'draw' | 'results';
const GUIDE_SEEN = 'modu-draw-guide-seen';

export default function App() {
  const { participants, rounds, settings, setSettings } = useDraw();
  const [step, setStep] = useState<Step>(participants.length ? 'draw' : 'data');
  const [stageRound, setStageRound] = useState<Round | null>(null);
  const [guide, setGuide] = useState<{ section?: string } | null>(null);

  useEffect(() => {
    try { if (!localStorage.getItem(GUIDE_SEEN)) { setGuide({}); localStorage.setItem(GUIDE_SEEN, '1'); } } catch { /* 저장소 사용 불가 */ }
  }, []);

  const closeGuide = useCallback(() => setGuide(null), []);
  const wonCount = rounds.reduce((n, r) => n + r.winners.filter(w => w.status === 'won').length, 0);

  const steps: { id: Step; no: number; label: string; meta: string }[] = [
    { id: 'data', no: 1, label: '참가자 명단', meta: participants.length ? `${participants.length.toLocaleString()}명` : '불러오기' },
    { id: 'draw', no: 2, label: '추첨하기', meta: rounds.length ? `다음 ${rounds.reduce((m, r) => Math.max(m, r.roundNo), 0) + 1}차` : '차수 설정' },
    { id: 'results', no: 3, label: '결과 · 다운로드', meta: rounds.length ? `${rounds.length}개 차수 · ${wonCount.toLocaleString()}명` : '아직 없음' },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <a className="home-link" href="../" title="동키의 잡동사니로 돌아가기"><Icon name="back" size={18} /><span>동키의 잡동사니</span></a>
        <div className="brand"><span className="brand-mark"><Icon name="gift" size={22} /></span><h1>모두의 추첨</h1></div>
        <div className="top-actions">
          <button className="btn ghost sm" onClick={() => setSettings({ sound: !settings.sound })} aria-pressed={settings.sound}>
            <Icon name={settings.sound ? 'volume' : 'muted'} size={17} /><span className="hide-sm">효과음 {settings.sound ? '켜짐' : '꺼짐'}</span>
          </button>
          <button className="btn ghost sm" onClick={() => setGuide({})}><Icon name="help" size={17} /><span className="hide-sm">사용 방법</span></button>
        </div>
      </header>

      <nav className="steps-nav" aria-label="진행 단계">
        {steps.map(s => (
          <button key={s.id} className={step === s.id ? 'on' : ''} aria-current={step === s.id ? 'step' : undefined} onClick={() => setStep(s.id)}>
            <span className="step-no">{s.no}</span>
            <span className="step-text"><b>{s.label}</b><small>{s.meta}</small></span>
          </button>
        ))}
      </nav>

      <main className="content">
        {step === 'data' && <DataLoader onNext={() => setStep('draw')} onOpenGuide={section => setGuide({ section })} />}
        {step === 'draw' && <RoundSetup onStart={setStageRound} />}
        {step === 'results' && <ResultBoard onReplay={setStageRound} />}
      </main>

      <footer className="foot">모두의 추첨 · 명단과 결과는 이 브라우저에만 저장돼요 · <a href="../">동키의 잡동사니</a></footer>

      {stageRound && <Stage round={stageRound} onClose={toResults => { setStageRound(null); if (toResults) setStep('results'); }} />}
      {guide && <Guide section={guide.section} onClose={closeGuide} />}
    </div>
  );
}
