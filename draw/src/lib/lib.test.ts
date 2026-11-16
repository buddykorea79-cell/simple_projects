import { describe, expect, it } from 'vitest';
import { maskName, phoneLast4 } from './mask';
import { buildParticipants, detectColumns, normalizePhone } from './normalize';
import { pickWinners, secureRandomInt } from './random';
import { buildWinnersCsv } from './exportCsv';
import { toCsvUrl } from './sources';
import { eligiblePool } from '../store';
import type { Participant, Round } from '../types';

describe('maskName', () => {
  it('가운데 글자를 가린다', () => {
    expect(maskName('김수')).toBe('김*');
    expect(maskName('홍길동')).toBe('홍*동');
    expect(maskName('남궁민수')).toBe('남**수');
    expect(maskName('이')).toBe('이');
    expect(maskName(' 홍길동 ')).toBe('홍*동');
    expect(maskName('John Smith')).toBe('J********h');
  });
});

describe('phoneLast4', () => {
  it('휴대폰 뒷 4자리만 남긴다', () => {
    expect(phoneLast4('01012345678')).toBe('5678');
    expect(phoneLast4('010-1234-0007')).toBe('0007');
    expect(phoneLast4('***-****-5678')).toBe('5678');
  });
});

describe('normalizePhone', () => {
  it('여러 표기를 하나로', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678');
    expect(normalizePhone('+82 10-1234-5678')).toBe('01012345678');
    expect(normalizePhone('1012345678')).toBe('01012345678');
    expect(normalizePhone('1234')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });
});

describe('buildParticipants', () => {
  const headers = ['타임스탬프', '성명', '연락처(휴대폰)'];
  const rows = [
    ['t1', '홍길동', '010-1111-2222'],
    ['t2', '김철수', '01033334444'],
    ['t3', '홍길동', '010 1111 2222'],
    ['t4', '', '01055556666'],
    ['t5', '이영희', '123'],
  ];
  it('열을 찾고 중복·무효를 거른다', () => {
    const m = detectColumns(headers);
    expect(m).toEqual({ name: 1, phone: 2, time: 0 });
    const r = buildParticipants(rows, m, { dedupe: 'first', salt: 's' });
    expect(r.stats).toEqual({ totalRows: 5, duplicates: 1, invalid: 2, valid: 2 });
    expect(r.participants.map(p => p.nameMasked)).toEqual(['홍*동', '김*수']);
    expect(r.participants.map(p => p.last4)).toEqual(['2222', '4444']);
    expect(r.participants[0].rowNo).toBe(2);
    expect(r.participants[1].entryNo).toBe(2);
    expect(r.raw.get(r.participants[0].id)).toEqual({ name: '홍길동', phone: '01011112222' });
  });
  it('마지막 응답 인정 모드', () => {
    const r = buildParticipants(rows, detectColumns(headers), { dedupe: 'last', salt: 's' });
    expect(r.participants.map(p => p.rowNo)).toEqual([3, 4]);
  });
  it('같은 번호는 같은 id', () => {
    const a = buildParticipants(rows, detectColumns(headers), { dedupe: 'first', salt: 's' });
    const b = buildParticipants([rows[2]], detectColumns(headers), { dedupe: 'first', salt: 's' });
    expect(b.participants[0].id).toBe(a.participants[0].id);
  });
});

describe('random', () => {
  it('범위 안의 정수', () => {
    for (let i = 0; i < 1000; i++) { const v = secureRandomInt(7); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(7); }
  });
  it('중복 없이 n명', () => {
    const pool = Array.from({ length: 500 }, (_, i) => i);
    const w = pickWinners(pool, 300);
    expect(w).toHaveLength(300);
    expect(new Set(w).size).toBe(300);
    expect(pickWinners(pool, 500)).toHaveLength(500);
    expect(() => pickWinners(pool, 501)).toThrow();
  });
  it('당첨 확률이 고르다', () => {
    const counts = new Array(10).fill(0);
    const pool = Array.from({ length: 10 }, (_, i) => i);
    const N = 50_000;
    for (let i = 0; i < N; i++) for (const w of pickWinners(pool, 2)) counts[w]++;
    for (const c of counts) expect(Math.abs(c / N - .2)).toBeLessThan(.01);
  });
});

const P = (id: string, n: number): Participant => ({ id, entryNo: n, rowNo: n + 1, nameMasked: '홍*동', last4: '5678' });
const round = (winners: string[], extra: Partial<Round> = {}): Round => ({
  id: 'r' + winners.join(''), roundNo: 1, label: '1차', prize: '커피, 쿠폰', winnerCount: winners.length, method: 'cards', progress: 'auto', excludePrevWinners: true, poolSize: 3, drawnAt: '2026-11-14T06:30:00.000Z',
  winners: winners.map((id, i) => ({ participantId: id, entryNo: i + 1, rowNo: i + 2, nameMasked: '홍*동', last4: '0123', order: i + 1, status: 'won' })), ...extra,
});

describe('eligiblePool', () => {
  const ps = [P('a', 1), P('b', 2), P('c', 3)];
  it('이전 당첨자 제외 여부', () => {
    expect(eligiblePool(ps, [round(['a'])], true).map(p => p.id)).toEqual(['b', 'c']);
    expect(eligiblePool(ps, [round(['a'])], false).map(p => p.id)).toEqual(['a', 'b', 'c']);
    const r = round(['b']);
    expect(eligiblePool(ps, [round(['a']), r], false, r.id).map(p => p.id)).toEqual(['a', 'c']);
  });
});

describe('buildWinnersCsv', () => {
  it('BOM, 쉼표 이스케이프, 원본 포함', () => {
    const csv = buildWinnersCsv([round(['a'])], new Map([['a', { name: '홍길동', phone: '01012345678' }]]));
    expect(csv.startsWith('﻿차수,경품,순번')).toBe(true);
    expect(csv).toContain('"커피, 쿠폰"');
    expect(csv).toContain('홍길동,010-1234-5678');
    expect(csv).toContain('"=""0123""",홍*동');
    expect(csv).toContain(',일괄,');
    expect(buildWinnersCsv([round(['a'])])).not.toContain('원본)');
  });
});

describe('toCsvUrl', () => {
  it('구글 시트 주소를 CSV 주소로', () => {
    expect(toCsvUrl('https://docs.google.com/spreadsheets/d/e/XYZ/pubhtml?gid=1')).toBe('https://docs.google.com/spreadsheets/d/e/XYZ/pub?gid=1&output=csv');
    expect(toCsvUrl('https://docs.google.com/spreadsheets/d/e/XYZ/pub?output=csv')).toBe('https://docs.google.com/spreadsheets/d/e/XYZ/pub?output=csv');
    expect(toCsvUrl('https://docs.google.com/spreadsheets/d/ABC/edit#gid=42')).toBe('https://docs.google.com/spreadsheets/d/ABC/export?format=csv&gid=42');
    expect(() => toCsvUrl('http://x')).toThrow();
  });
});

import { fitGrid } from '../animations/common';
describe('fitGrid', () => {
  it('타일이 많아도 0보다 큰 크기로 배치한다', () => {
    const g = fitGrid(1204, 526, 315, 1, 4, 110);
    expect(g.w).toBeGreaterThan(30);
    expect(g.cols * g.rows).toBeGreaterThanOrEqual(315);
    expect(g.rows * g.h + (g.rows - 1) * 4).toBeLessThanOrEqual(526);
    expect(fitGrid(1920, 900, 3000, 1, 2, 110).w).toBeGreaterThan(10);
    expect(fitGrid(1200, 600, 5, .74, 16, 250).w).toBe(227);
  });
});

import * as XLSX from 'xlsx';
import { parseCsvText as parseCsv, parseExcelBuffer, pickSheet } from './sources';

function workbook(sheets: Record<string, unknown[][]>, bookType: XLSX.BookType = 'xlsx'): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), name);
  const out = XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer;
  return out;
}

describe('엑셀 읽기', () => {
  it('xlsx: 숫자로 저장된 번호·날짜 셀도 읽는다', async () => {
    const buf = workbook({ 응답: [
      ['타임스탬프', '성명', '연락처'],
      [new Date(2026, 10, 14, 9, 30), '홍길동', '010-1111-2222'],
      [new Date(2026, 10, 14, 9, 31), '김철수', 1033334444],   // 앞자리 0이 사라진 숫자
    ] });
    const [sheet] = await parseExcelBuffer(buf);
    expect(sheet.name).toBe('응답');
    expect(sheet.table.headers).toEqual(['타임스탬프', '성명', '연락처']);
    expect(sheet.table.firstRow).toBe(2);
    expect(sheet.table.rows[0][0]).toMatch(/^2026-11-14 09:30/);
    const r = buildParticipants(sheet.table.rows, detectColumns(sheet.table.headers), { dedupe: 'first', salt: 's', firstRow: sheet.table.firstRow });
    expect(r.participants.map(p => [p.nameMasked, p.last4, p.rowNo])).toEqual([['홍*동', '2222', 2], ['김*수', '4444', 3]]);
    expect(r.raw.get(r.participants[1].id)?.phone).toBe('01033334444');
  });

  it('맨 위 제목 줄을 건너뛰고 실제 행 번호를 지킨다', async () => {
    const buf = workbook({ 명단: [['2026 송년회 경품 응모자'], [], ['번호', '이름', '휴대폰'], [1, '이영희', '010-5555-6666'], [], []] });
    const [sheet] = await parseExcelBuffer(buf);
    expect(sheet.table.headers).toEqual(['번호', '이름', '휴대폰']);
    expect(sheet.table.firstRow).toBe(4);
    expect(sheet.table.rows).toHaveLength(1);   // 끝의 빈 줄은 버림
    const r = buildParticipants(sheet.table.rows, detectColumns(sheet.table.headers), { dedupe: 'first', salt: 's', firstRow: sheet.table.firstRow });
    expect(r.participants[0].rowNo).toBe(4);
  });

  it('시트가 여러 개면 이름·휴대폰 열이 있는 시트를 고른다', async () => {
    const sheets = await parseExcelBuffer(workbook({ 안내: [['이 파일은 응모자 명단입니다'], ['담당: 총무팀']], 응답: [['이름', '전화번호'], ['박민수', '01077778888']], 빈시트: [] }));
    expect(sheets.map(s => s.name)).toEqual(['안내', '응답']);   // 빈 시트는 뺌
    expect(pickSheet(sheets)).toBe(1);
  });

  it('예전 형식 .xls 도 읽는다', async () => {
    const [sheet] = await parseExcelBuffer(workbook({ Sheet1: [['이름', '휴대폰'], ['최지우', '010-1234-5678']] }, 'biff8'));
    expect(sheet.table.rows[0]).toEqual(['최지우', '010-1234-5678']);
  });

  it('엑셀이 아닌 파일은 알아듣기 쉬운 오류', async () => {
    await expect(parseExcelBuffer(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]).buffer)).rejects.toThrow(/엑셀 파일을 읽지 못했어요/);
  });

  it('CSV 도 제목 줄 위의 안내 줄을 건너뛴다', () => {
    const t = parseCsv('행사 응모 명단,,\n이름,휴대폰,소속\n홍길동,010-1111-2222,개발팀\n');
    expect(t.headers).toEqual(['이름', '휴대폰', '소속']);
    expect(t.firstRow).toBe(3);
  });
});

import { makeSampleXlsx } from './sources';
import { makeSampleCsv } from './sample';
describe('엑셀 양식 예시', () => {
  it('내려받은 예시 엑셀을 다시 올리면 그대로 읽힌다', async () => {
    const blob = await makeSampleXlsx(makeSampleCsv(30));
    const [sheet] = await parseExcelBuffer(await blob.arrayBuffer());
    expect(sheet.name).toBe('응모자');
    expect(sheet.table.headers).toEqual(['타임스탬프', '이름', '휴대폰 번호', '소속']);
    expect(sheet.table.rows).toHaveLength(38);   // 30명 + 중복 6 + 잘못된 행 2
  });
});
