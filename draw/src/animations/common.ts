import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type { Participant, Speed, WinnerRecord } from '../types';

export interface AnimProps {
  pool: Participant[];
  winners: WinnerRecord[];
  prize: string;
  speed: Speed;
  /** 진행자가 Space/다음을 누를 때마다 1씩 증가 */
  advance: number;
  /** "전체 공개"를 누를 때마다 1씩 증가 */
  revealAll: number;
  /** 일괄 추첨: 클릭 없이 한 명(한 단계)씩 자동으로 진행. 일시정지하면 false */
  auto: boolean;
  onProgress(revealed: number, hint: string): void;
  onDone(): void;
}

/** 컴포넌트가 사라지면 함께 취소되는 setTimeout */
export function useLater() {
  const ids = useRef(new Set<number>());
  useEffect(() => () => { ids.current.forEach(clearTimeout); ids.current.clear(); }, []);
  return useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { ids.current.delete(id); fn(); }, ms);
    ids.current.add(id);
  }, []);
}

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * 일괄 추첨용 자동 진행. enabled 인 동안 key 가 바뀔 때마다(=한 단계가 끝날 때마다)
 * delay 뒤에 fn 을 한 번 실행한다. 일시정지(enabled=false)하면 예약을 취소한다.
 */
export function useAutoStep(enabled: boolean, delay: number, key: unknown, fn: () => void) {
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    if (!enabled) return;
    const id = window.setTimeout(() => cb.current(), delay);
    return () => clearTimeout(id);
  }, [enabled, delay, key]);
}

/** 진행자 입력(advance/revealAll) 카운터가 바뀔 때만 콜백 실행 */
export function useSignal(value: number, fn: () => void) {
  const last = useRef(value);
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    if (value !== last.current) { last.current = value; cb.current(); }
  }, [value]);
}

export function celebrate(big = true) {
  const colors = ['#f3dca4', '#d4af62', '#b8893b', '#fff6df', '#e9e4d6'];
  if (!big) { void confetti({ particleCount: 40, spread: 60, startVelocity: 32, origin: { y: .5 }, colors, zIndex: 300, scalar: .9, ticks: 160 }); return; }
  void confetti({ particleCount: 140, spread: 100, startVelocity: 50, origin: { y: .6 }, colors, zIndex: 300 });
  setTimeout(() => {
    void confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: .7 }, colors, zIndex: 300 });
    void confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: .7 }, colors, zIndex: 300 });
  }, 300);
}

/** 주어진 영역에 n개의 타일을 aspect(가로/세로) 비율로 최대 크기로 배치 */
export function fitGrid(W: number, H: number, n: number, aspect: number, gap: number, maxW = Infinity) {
  if (n <= 0 || W <= 0 || H <= 0) return { cols: 1, rows: 1, w: 0, h: 0 };
  let best = { cols: 1, rows: n, w: 0, h: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    let w = (W - gap * (cols - 1)) / cols;
    let h = w / aspect;
    if (rows * h + gap * (rows - 1) > H) { h = (H - gap * (rows - 1)) / rows; w = h * aspect; }
    w = Math.min(w, maxW); h = w / aspect;
    if (w <= 0) continue;               // 줄 간격만으로 높이를 넘는 경우: 열을 더 늘려 본다
    if (w > best.w) best = { cols, rows, w, h };
    else if (w < best.w * .6) break;
  }
  return { ...best, w: Math.floor(best.w), h: Math.floor(best.h) };
}
