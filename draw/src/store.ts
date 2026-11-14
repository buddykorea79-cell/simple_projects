import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Method, Participant, Progress, RawContact, Round, Settings, SourceInfo, WinnerRecord } from './types';
import { pickWinners } from './lib/random';

function randomId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/** 원본 이름·전화번호 — localStorage에 저장하지 않는다. */
let rawContacts = new Map<string, RawContact>();
export const getRaw = () => rawContacts;

interface DrawState {
  salt: string;
  settings: Settings;
  source: SourceInfo | null;
  participants: Participant[];
  rounds: Round[];
  rawCount: number;            // 메모리에 있는 원본 수 (화면 갱신용)
  setSettings(p: Partial<Settings>): void;
  setData(source: SourceInfo, participants: Participant[], raw?: Map<string, RawContact>): void;
  clearData(): void;
  /** 당첨자를 즉시 확정하고 차수를 기록한다. 연출은 그 다음. */
  drawRound(input: { roundNo: number; label: string; prize: string; winnerCount: number; method: Method; progress: Progress; excludePrevWinners: boolean }): Round;
  /** 불참 당첨자를 취소하고 1명을 다시 뽑는다. */
  redraw(roundId: string, order: number): WinnerRecord;
  deleteRound(roundId: string): void;
  resetAll(): void;
}

export const DEFAULT_SETTINGS: Settings = { dedupe: 'first', sound: true, speed: 'normal', progress: 'manual' };

/** 이 차수에서 뽑을 수 있는 사람들 */
export function eligiblePool(participants: Participant[], rounds: Round[], excludePrev: boolean, currentRoundId?: string): Participant[] {
  const blocked = new Set<string>();
  for (const r of rounds) {
    if (r.id === currentRoundId || excludePrev) r.winners.forEach(w => blocked.add(w.participantId));
  }
  return participants.filter(p => !blocked.has(p.id));
}

const toRecord = (p: Participant, order: number, replacementFor?: number): WinnerRecord => ({
  participantId: p.id, entryNo: p.entryNo, rowNo: p.rowNo, nameMasked: p.nameMasked, last4: p.last4,
  order, status: 'won', ...(replacementFor ? { replacementFor } : {}),
});

export const useDraw = create<DrawState>()(persist((set, get) => ({
  salt: randomId(),
  settings: DEFAULT_SETTINGS,
  source: null,
  participants: [],
  rounds: [],
  rawCount: 0,

  setSettings: p => set(s => ({ settings: { ...s.settings, ...p } })),

  setData: (source, participants, raw) => {
    rawContacts = raw ?? new Map();
    set({ source, participants, rawCount: rawContacts.size });
  },

  clearData: () => { rawContacts = new Map(); set({ source: null, participants: [], rawCount: 0 }); },

  drawRound: input => {
    const { participants, rounds } = get();
    const pool = eligiblePool(participants, rounds, input.excludePrevWinners);
    const winners = pickWinners(pool, input.winnerCount);
    const round: Round = {
      id: randomId(), ...input, poolSize: pool.length, drawnAt: new Date().toISOString(),
      winners: winners.map((p, i) => toRecord(p, i + 1)),
    };
    set({ rounds: [...rounds, round] });
    return round;
  },

  redraw: (roundId, order) => {
    const { participants, rounds } = get();
    const round = rounds.find(r => r.id === roundId);
    if (!round) throw new Error('차수를 찾을 수 없어요.');
    const pool = eligiblePool(participants, rounds, round.excludePrevWinners, round.id);
    if (!pool.length) throw new Error('다시 뽑을 수 있는 참가자가 없어요.');
    const [pick] = pickWinners(pool, 1);
    const nextOrder = Math.max(...round.winners.map(w => w.order)) + 1;
    const rec = toRecord(pick, nextOrder, order);
    set({
      rounds: rounds.map(r => r.id !== roundId ? r : {
        ...r, winners: [...r.winners.map(w => w.order === order ? { ...w, status: 'cancelled' as const } : w), rec],
      }),
    });
    return rec;
  },

  deleteRound: id => set(s => ({ rounds: s.rounds.filter(r => r.id !== id) })),

  resetAll: () => { rawContacts = new Map(); set({ source: null, participants: [], rounds: [], rawCount: 0, salt: randomId() }); },
}), {
  name: 'modu-draw-v2',
  merge: (persisted, current) => {
    const p = (persisted ?? {}) as Partial<DrawState>;
    return { ...current, ...p, settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) } };
  },
  partialize: s => ({ salt: s.salt, settings: s.settings, source: s.source && { ...s.source, hasRaw: false }, participants: s.participants, rounds: s.rounds }),
}));

export function recommendMethod(count: number): Method {
  if (count <= 10) return 'lotto';
  if (count <= 60) return 'cards';
  return 'survival';
}

// 이전 형식(휴대폰 가운데 표시) 저장분은 더 이상 쓰지 않는다.
try { localStorage.removeItem('modu-draw-v1'); } catch { /* 저장소 사용 불가 */ }
