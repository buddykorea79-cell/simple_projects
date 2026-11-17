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

import { addBall, averageSpeed, createSim, resizeSim, stepSim, takeTopBall } from '../animations/lottoSim';
describe('로또 볼 물리', () => {
  const seeded = (seed = 7) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const run = (mix: number, seconds = 8) => {
    const rnd = seeded();
    const s = createSim(200, 80, rnd);
    s.mix = s.mixTarget = mix;
    for (let i = 0; i < seconds * 60; i++) stepSim(s, 1 / 60, rnd);
    return s;
  };

  it('공이 유리 통 밖으로 나가지 않는다', () => {
    const s = run(1);
    for (const b of s.balls) expect(Math.hypot(b.x, b.y)).toBeLessThanOrEqual(s.R - s.br + .5);
  });

  it('평소에도 쉬지 않고 통 전체를 날아다닌다', () => {
    const s = run(0);
    expect(averageSpeed(s)).toBeGreaterThan(s.R * .5);                 // 초당 반지름의 절반 이상
    const upper = s.balls.filter(b => b.y < 0).length / s.balls.length;
    expect(upper).toBeGreaterThan(.2);                                   // 바닥에 가라앉지 않음
  });

  it('추첨 중에는 더 빠르게 섞인다', () => {
    expect(averageSpeed(run(1))).toBeGreaterThan(averageSpeed(run(0)) * 1.15);
  });

  it('맨 위의 공을 꺼내고, 공을 다시 채운다', () => {
    const s = run(0, 1);
    const topY = Math.min(...s.balls.map(b => b.y));
    const n = s.balls.length;
    expect(takeTopBall(s)?.y).toBe(topY);
    expect(s.balls).toHaveLength(n - 1);
    addBall(s);
    expect(s.balls).toHaveLength(n);
    resizeSim(s, 100);
    expect(s.R).toBe(100);
    for (const b of s.balls) expect(Math.hypot(b.x, b.y)).toBeLessThan(100);
  });
});

import { byNumber } from '../animations/Survival';
describe('서바이벌 번호순 정렬', () => {
  it('추첨번호 오름차순, 같은 번호는 이름순', () => {
    const list = [
      { last4: '5678', name: '홍*동' }, { last4: '0042', name: '김*수' },
      { last4: '5678', name: '가*나' }, { last4: '1000', name: '이*희' },
    ].sort(byNumber);
    expect(list.map(t => `${t.last4} ${t.name}`)).toEqual(['0042 김*수', '1000 이*희', '5678 가*나', '5678 홍*동']);
  });
});

import { LOTTO_MAX, recommendMethod, useDraw } from '../store';
describe('로또 볼 인원 제한', () => {
  const input = { roundNo: 1, label: '1차', prize: '', method: 'lotto' as const, progress: 'manual' as const, excludePrevWinners: true };
  it(`최대 ${LOTTO_MAX}명까지만 뽑는다`, () => {
    const ps = Array.from({ length: 30 }, (_, i) => P('p' + i, i + 1));
    useDraw.getState().setData({ type: 'sample', loadedAt: '', stats: { totalRows: 30, duplicates: 0, invalid: 0, valid: 30 }, hasRaw: false }, ps);
    expect(() => useDraw.getState().drawRound({ ...input, winnerCount: LOTTO_MAX + 1 })).toThrow(/최대 10명/);
    expect(useDraw.getState().rounds).toHaveLength(0);
    expect(useDraw.getState().drawRound({ ...input, winnerCount: LOTTO_MAX }).winners).toHaveLength(LOTTO_MAX);
    useDraw.getState().resetAll();
  });
  it('11명부터는 로또를 추천하지 않는다', () => {
    expect(recommendMethod(LOTTO_MAX)).toBe('lotto');
    expect(recommendMethod(LOTTO_MAX + 1)).toBe('cards');
  });
});

import { boardLayout } from '../animations/WinnerBoard';
describe('당첨자 보드 배치', () => {
  const fits = (W: number, H: number, n: number) => {
    const L = boardLayout(W, H, n, 3);
    expect(L.cols * L.rows).toBeGreaterThanOrEqual(n);
    expect(L.cols * L.w + (L.cols - 1) * L.gap).toBeLessThanOrEqual(W);
    expect(L.rows * L.h + (L.rows - 1) * L.gap).toBeLessThanOrEqual(H);   // 스크롤이 생기지 않는다
    expect(L.font).toBeGreaterThan(0);
    return L;
  };
  it('몇 명이든 스크롤 없이 한 화면에 들어간다', () => {
    for (const [W, H] of [[1460, 560], [1100, 420], [358, 520]]) for (const n of [1, 3, 10, 37, 60, 150, 300, 800, 2000]) fits(W, H, n);
  });
  it('적으면 이름·번호 한 줄로 크게, 아주 많으면 번호만', () => {
    const few = fits(1460, 560, 8);
    expect(few.mode).toBe('row');
    expect(few.font).toBeGreaterThanOrEqual(36);
    expect(fits(1460, 560, 150).mode).toBe('stack');
    expect(fits(1100, 420, 2000).mode).toBe('num');
  });
});
