import type { ColumnMapping, DedupeMode, LoadStats, Participant, RawContact } from '../types';
import { maskName, phoneLast4 } from './mask';

/** 숫자만 남기고 +82/82 국가번호를 0으로 바꾼다. 유효하지 않으면 null. */
export function normalizePhone(input: string): string | null {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('82') && (d.length === 11 || d.length === 12)) d = '0' + d.slice(2);
  // 엑셀에서 앞자리 0이 사라진 1012345678 형태 보정
  if (/^1[016789]\d{7,8}$/.test(d)) d = '0' + d;
  return /^0\d{8,10}$/.test(d) ? d : null;
}

const NAME_KEYS = ['이름', '성명', '성함', '참가자', 'name'];
const PHONE_KEYS = ['휴대폰', '핸드폰', '휴대전화', '전화', '연락처', 'phone', 'mobile', 'tel'];
const TIME_KEYS = ['타임스탬프', '제출', '응답', '시간', 'timestamp', 'time', 'date'];

function find(headers: string[], keys: string[]): number {
  const lower = headers.map(h => h.trim().toLowerCase());
  for (const k of keys) {
    const i = lower.findIndex(h => h.includes(k));
    if (i >= 0) return i;
  }
  return -1;
}

export function detectColumns(headers: string[]): ColumnMapping {
  return { name: find(headers, NAME_KEYS), phone: find(headers, PHONE_KEYS), time: find(headers, TIME_KEYS) };
}

/** 53비트 해시 (cyrb53). 같은 번호 → 같은 id 로 차수 간 당첨 기록을 연결한다. */
export function hashId(text: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export interface BuildResult {
  participants: Participant[];
  raw: Map<string, RawContact>;
  stats: LoadStats;
}

export function buildParticipants(
  rows: string[][],
  mapping: ColumnMapping,
  opts: { dedupe: DedupeMode; salt: string },
): BuildResult {
  const byPhone = new Map<string, { name: string; phone: string; rowNo: number; time?: string }>();
  let invalid = 0, duplicates = 0;
  rows.forEach((r, i) => {
    const name = String(r[mapping.name] ?? '').trim();
    const phone = normalizePhone(String(r[mapping.phone] ?? ''));
    if (!name || !phone) { invalid++; return; }
    const entry = { name, phone, rowNo: i + 2, time: mapping.time >= 0 ? String(r[mapping.time] ?? '').trim() || undefined : undefined };
    if (byPhone.has(phone)) {
      duplicates++;
      if (opts.dedupe === 'last') { byPhone.delete(phone); byPhone.set(phone, entry); }
      return;
    }
    byPhone.set(phone, entry);
  });

  const participants: Participant[] = [];
  const raw = new Map<string, RawContact>();
  const ordered = [...byPhone.values()].sort((a, b) => a.rowNo - b.rowNo);
  ordered.forEach((e, idx) => {
    const id = hashId(e.phone + '|' + opts.salt);
    participants.push({
      id, entryNo: idx + 1, rowNo: e.rowNo,
      nameMasked: maskName(e.name), last4: phoneLast4(e.phone), submittedAt: e.time,
    });
    raw.set(id, { name: e.name, phone: e.phone });
  });
  return {
    participants, raw,
    stats: { totalRows: rows.length, duplicates, invalid, valid: participants.length },
  };
}
