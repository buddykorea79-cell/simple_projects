import type { RawContact, Round } from '../types';

const METHOD_LABEL = { lotto: '로또 볼', cards: '카드 뒤집기', survival: '서바이벌' } as const;

function cell(v: string | number | undefined): string {
  const s = v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 당첨자 CSV (UTF-8 BOM 포함 — 엑셀에서 한글이 깨지지 않게) */
export function buildWinnersCsv(rounds: Round[], raw?: Map<string, RawContact>): string {
  const includeRaw = !!raw;
  const header = ['차수', '경품', '순번', '추첨번호(휴대폰 뒷4자리)', '이름',
    ...(includeRaw ? ['이름(원본)', '휴대폰(원본)'] : []),
    '응모번호', '원본행', '상태', '추첨방식', '진행방식', '추첨대상수', '추첨시각'];
  const lines = [header.map(cell).join(',')];
  const sorted = [...rounds].sort((a, b) => a.roundNo - b.roundNo);
  for (const r of sorted) {
    for (const w of [...r.winners].sort((a, b) => a.order - b.order)) {
      const rc = raw?.get(w.participantId);
      const status = w.status === 'cancelled' ? '취소(불참)' : w.replacementFor ? `당첨(${w.replacementFor}번 재추첨)` : '당첨';
      lines.push([
        r.label, r.prize, w.order, `="${w.last4}"`, w.nameMasked,
        ...(includeRaw ? [rc?.name ?? '', rc ? formatPhone(rc.phone) : ''] : []),
        w.entryNo, w.rowNo, status, METHOD_LABEL[r.method], r.progress === 'auto' ? '일괄' : '수동', r.poolSize, formatDateTime(r.drawnAt),
      ].map(cell).join(','));
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function formatPhone(d: string): string {
  const head = d.startsWith('02') ? 2 : 3;
  return `${d.slice(0, head)}-${d.slice(head, d.length - 4)}-${d.slice(-4)}`;
}

export function csvFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `당첨자_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}.csv`;
}

export function downloadText(filename: string, text: string | Blob, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(typeof text === 'string' ? new Blob([text], { type }) : text);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
