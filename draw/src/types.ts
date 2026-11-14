export type SourceType = 'csv' | 'published' | 'appsScript' | 'sample';
export type DedupeMode = 'first' | 'last';
export type Method = 'lotto' | 'cards' | 'survival';
export type Speed = 'normal' | 'fast';
/** manual: 진행자가 Space/클릭으로 한 명씩 · auto: 일괄 추첨(자동으로 차례차례) */
export type Progress = 'manual' | 'auto';

/** 화면에 쓰는 참가자 정보. 원본 이름·전화번호는 여기에 넣지 않는다. */
export interface Participant {
  id: string;          // 전화번호 기반 고유키 (Apps Script 방식은 서버가 준 key)
  entryNo: number;     // 응모번호 1..N (중복 제거 후 순서)
  rowNo: number;       // 원본 시트/CSV의 행 번호
  nameMasked: string;  // 홍*동
  last4: string;       // 휴대폰 뒷 4자리 = 추첨번호
  submittedAt?: string;
}

/** 원본 정보 — 메모리에만 두고 저장하지 않는다. */
export interface RawContact { name: string; phone: string; }

export interface ColumnMapping { name: number; phone: number; time: number; }

export interface LoadStats { totalRows: number; duplicates: number; invalid: number; valid: number; }

export interface SourceInfo {
  type: SourceType;
  url?: string;
  fileName?: string;
  loadedAt: string;
  stats: LoadStats;
  hasRaw: boolean;
}

export interface WinnerRecord {
  participantId: string;
  entryNo: number;
  rowNo: number;
  nameMasked: string;
  last4: string;
  order: number;
  status: 'won' | 'cancelled';
  replacementFor?: number;   // 재추첨으로 뽑혔다면, 취소된 당첨자의 순번
}

export interface Round {
  id: string;
  roundNo: number;
  label: string;
  prize: string;
  winnerCount: number;
  method: Method;
  progress: Progress;
  excludePrevWinners: boolean;
  poolSize: number;
  drawnAt: string;
  winners: WinnerRecord[];
}

export interface Settings {
  dedupe: DedupeMode;
  sound: boolean;
  speed: Speed;
  progress: Progress;
}
