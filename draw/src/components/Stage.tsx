import { useEffect, useMemo, useRef, useState } from 'react';
import { eligiblePool, useDraw } from '../store';
import type { Round } from '../types';
import { METHODS } from './RoundSetup';
import { Icon } from './Icon';
import { Lotto } from '../animations/Lotto';
import { Cards } from '../animations/Cards';
import { Survival } from '../animations/Survival';
import { setSoundEnabled, stopAll } from '../lib/sound';

export function Stage({ round, onClose }: { round: Round; onClose(showResults: boolean): void }) {
  const { participants, rounds, settings, setSettings } = useDraw();
  const isAuto = round.progress === 'auto';
  const [advance, setAdvance] = useState(0);
  const [revealAll, setRevealAll] = useState(0);
  const [paused, setPaused] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState({ revealed: 0, hint: '' });
  const ref = useRef<HTMLDivElement>(null);

  // 이 차수를 추첨할 당시의 대상자 (연출용)
  const pool = useMemo(() => {
    const before = rounds.filter(r => r.id !== round.id && r.drawnAt < round.drawnAt);
    return eligiblePool(participants, before, round.excludePrevWinners);
  }, [round.id]);
  const winners = useMemo(() => round.winners.filter(w => w.status === 'won'), [round]);
  const method = METHODS.find(m => m.id === round.method)!;

  useEffect(() => { setSoundEnabled(settings.sound); }, [settings.sound]);
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.body.style.overflow = ''; stopAll(); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); };
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen?.().catch(() => {});
  }

  /** 수동: 다음 단계 · 일괄: 일시정지/계속 */
  function primary() {
    if (done) return;
    if (isAuto) setPaused(p => !p);
    else setAdvance(a => a + 1);
  }

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
    const k = e.key.toLowerCase();
    if (e.code === 'Space' || k === 'enter' || k === 'arrowright' || k === 'pagedown') { e.preventDefault(); primary(); }
    else if (k === 'a') setRevealAll(a => a + 1);
    else if (k === 'f') toggleFullscreen();
    else if (k === 'm') setSettings({ sound: !settings.sound });
    else if (k === 'escape' && !document.fullscreenElement) onClose(done);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const common = { pool, winners, prize: round.prize, speed: settings.speed, advance, revealAll, auto: isAuto && !paused,
    onProgress: (revealed: number, hint: string) => setProgress({ revealed, hint }), onDone: () => setDone(true) };

  return (
    <div ref={ref} className="stage" role="dialog" aria-modal="true" aria-label={`${round.label} 추첨 무대`} tabIndex={-1}>
      <header className="stage-top">
        <div className="stage-title">
          <span className="stage-round">{round.label}</span>
          <div>
            <b>{round.prize || '경품 추첨'}</b>
            <span>{method.name} · {round.winnerCount.toLocaleString()}명 추첨 · 대상 {round.poolSize.toLocaleString()}명</span>
          </div>
        </div>
        <div className="stage-tools">
          <span className={`mode-chip${isAuto ? ' auto' : ''}`}><Icon name={isAuto ? 'auto' : 'hand'} size={15} />{isAuto ? (paused ? '일괄 추첨 · 일시정지' : '일괄 추첨') : '수동 추첨'}</span>
          {!done && <button className="sbtn" onClick={() => setRevealAll(a => a + 1)} title="남은 결과 한 번에 공개 (A)">전체 공개</button>}
          <button className="sbtn icon" onClick={() => setSettings({ sound: !settings.sound })} title={settings.sound ? '소리 끄기 (M)' : '소리 켜기 (M)'} aria-label="소리"><Icon name={settings.sound ? 'volume' : 'muted'} /></button>
          <button className="sbtn icon" onClick={toggleFullscreen} title="전체 화면 (F)" aria-label="전체 화면"><Icon name="expand" /></button>
          <button className="sbtn icon" onClick={() => onClose(done)} title="닫기 (Esc)" aria-label="닫기"><Icon name="x" /></button>
        </div>
      </header>

      <main className="stage-body">
        {round.method === 'lotto' && <Lotto {...common} />}
        {round.method === 'cards' && <Cards {...common} />}
        {round.method === 'survival' && <Survival {...common} />}
      </main>

      <footer className="stage-foot">
        <span className="stage-hint" aria-live="polite">{paused && !done ? '일시정지됨 · Space를 누르면 이어서 진행해요' : progress.hint}</span>
        {done
          ? <button className="sbtn gold" onClick={() => onClose(true)}>결과 보기 · CSV 다운로드 <Icon name="forward" size={18} /></button>
          : isAuto
            ? <button className="sbtn gold" onClick={primary}><Icon name={paused ? 'play' : 'pause'} size={18} />{paused ? '계속' : '일시정지'} <kbd>Space</kbd></button>
            : <button className="sbtn gold" onClick={primary}>다음 <kbd>Space</kbd></button>}
      </footer>
    </div>
  );
}
