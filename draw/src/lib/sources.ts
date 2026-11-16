import Papa from 'papaparse';
import type { Participant } from '../types';
import { phoneLast4 } from './mask';
import { detectColumns } from './normalize';

/** firstRow: 첫 데이터 행이 원본 파일에서 몇 번째 줄인지 (당첨자 대조용 "원본 행") */
export interface Table { headers: string[]; rows: string[][]; firstRow: number; }
export interface Sheet { name: string; table: Table; }

const isBlankRow = (r: unknown[]) => r.every(c => String(c ?? '').trim() === '');

/**
 * 2차원 배열을 표로 바꾼다. 맨 위에 "경품 응모자 명단" 같은 제목 줄이 있어도
 * 처음 10줄 안에서 이름·휴대폰 열이 함께 있는 줄을 제목 줄로 고른다.
 */
export function toTable(raw: unknown[][]): Table | null {
  const rows = raw.map(r => r.map(c => String(c ?? '').trim()));
  const firstFilled = rows.findIndex(r => !isBlankRow(r));
  if (firstFilled < 0) return null;
  let h = firstFilled;
  for (let i = firstFilled; i < Math.min(rows.length, firstFilled + 10); i++) {
    const m = detectColumns(rows[i]);
    if (m.name >= 0 && m.phone >= 0) { h = i; break; }
  }
  const data = rows.slice(h + 1);
  while (data.length && isBlankRow(data[data.length - 1])) data.pop();
  return { headers: rows[h], rows: data, firstRow: h + 2 };
}

export function parseCsvText(text: string): Table {
  const res = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: false });
  const table = toTable(res.data);
  if (!table) throw new Error('CSV에 내용이 없어요.');
  return table;
}

/** 엑셀(xlsx·xls·ods) 파일 확장자인가 */
export const isExcelName = (name: string) => /\.(xlsx|xlsm|xls|ods)$/i.test(name);

/** 엑셀 셀 값 → 글자. 날짜는 2026-11-14 09:30, 숫자는 지수 표기 없이 (앞자리 0이 사라진 휴대폰 번호 대비) */
function cellText(v: unknown): string {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    const date = `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    const hasTime = v.getHours() || v.getMinutes() || v.getSeconds();
    return hasTime ? `${date} ${p(v.getHours())}:${p(v.getMinutes())}${v.getSeconds() ? ':' + p(v.getSeconds()) : ''}` : date;
  }
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 }) : String(v);
  return String(v ?? '');
}

/** 엑셀 파일 내용을 시트별 표로 읽는다. */
export async function parseExcelBuffer(buf: ArrayBuffer): Promise<Sheet[]> {
  const XLSX = await import('xlsx');   // 엑셀을 올릴 때만 불러온다
  let wb: import('xlsx').WorkBook;
  try { wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true, dense: true }); }
  catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (/password|encrypt/i.test(msg)) throw new Error('암호가 걸린 엑셀 파일은 읽을 수 없어요. 엑셀에서 암호를 해제한 뒤 다시 올려 주세요.');
    throw new Error('엑셀 파일을 읽지 못했어요. 파일이 손상되지 않았는지 확인하거나 CSV로 저장해 올려 주세요.');
  }
  const sheets: Sheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: true });
    const table = toTable(aoa.map(r => r.map(cellText)));
    if (table && table.rows.length) sheets.push({ name, table });
  }
  if (!sheets.length) throw new Error('엑셀 파일에 내용이 있는 시트가 없어요.');
  return sheets;
}

/** 이름·휴대폰 열을 둘 다 찾은 시트를 먼저 고른다. */
export function pickSheet(sheets: Sheet[]): number {
  const i = sheets.findIndex(s => { const m = detectColumns(s.table.headers); return m.name >= 0 && m.phone >= 0; });
  return i >= 0 ? i : 0;
}

/** CSV 또는 엑셀 파일을 읽어 시트 목록으로 돌려준다 (CSV는 시트 하나). */
export async function readSpreadsheetFile(file: File): Promise<Sheet[]> {
  if (isExcelName(file.name)) return parseExcelBuffer(await file.arrayBuffer());
  if (/\.(csv|txt)$/i.test(file.name)) return [{ name: file.name, table: await readCsvFile(file) }];
  throw new Error('CSV(.csv)나 엑셀(.xlsx, .xls) 파일을 올려 주세요.');
}

/** 샘플 CSV 와 같은 내용의 엑셀 파일 (양식 예시 내려받기용) */
export async function makeSampleXlsx(csvText: string): Promise<Blob> {
  const XLSX = await import('xlsx');
  const rows = Papa.parse<string[]>(csvText, { skipEmptyLines: true }).data;
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '응모자');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** UTF-8로 읽어 보고 글자가 깨지면 엑셀 기본 저장 형식(CP949/EUC-KR)으로 다시 읽는다. */
export async function readCsvFile(file: File): Promise<Table> {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if ((text.match(/�/g) ?? []).length > 0) text = new TextDecoder('euc-kr').decode(buf);
  return parseCsvText(text);
}

/** 구글 시트 링크를 CSV 주소로 바꾼다. 게시(pub) 링크가 가장 확실하다. */
export function toCsvUrl(input: string): string {
  const url = input.trim();
  if (!/^https:\/\//.test(url)) throw new Error('https:// 로 시작하는 주소를 넣어 주세요.');
  const u = new URL(url);
  if (u.pathname.endsWith('/pubhtml')) u.pathname = u.pathname.replace(/\/pubhtml$/, '/pub');
  if (u.pathname.endsWith('/pub')) { u.searchParams.set('output', 'csv'); return u.toString(); }
  const m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)\/(edit|view)/);
  if (m) {
    const gid = url.match(/[#&?]gid=(\d+)/)?.[1] ?? '0';
    return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv&gid=${gid}`;
  }
  return url;
}

export async function fetchPublishedCsv(input: string): Promise<Table> {
  const url = toCsvUrl(input);
  let res: Response;
  try { res = await fetch(url, { cache: 'no-store' }); }
  catch { throw new Error('시트를 불러오지 못했어요. [파일] → [공유] → [웹에 게시]에서 CSV로 게시한 링크인지 확인해 주세요.'); }
  if (!res.ok) throw new Error(`시트를 불러오지 못했어요 (HTTP ${res.status}). 게시 상태를 확인해 주세요.`);
  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('CSV가 아니라 웹페이지가 돌아왔어요. 게시 형식을 "쉼표로 구분된 값(.csv)"으로 골라 주세요.');
  return parseCsvText(text);
}

interface AppsScriptItem { key: string; rowNo: number; name: string; last4?: string; phone?: string; submittedAt?: string; }

export async function fetchAppsScript(input: string): Promise<{ participants: Participant[]; totalRows?: number; duplicates?: number; invalid?: number; }> {
  const url = input.trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) throw new Error('https://script.google.com/macros/s/…/exec 형태의 웹 앱 주소를 넣어 주세요.');
  let res: Response;
  try { res = await fetch(url, { cache: 'no-store', redirect: 'follow' }); }
  catch { throw new Error('Apps Script에 연결하지 못했어요. 웹 앱 액세스 권한이 "모든 사용자"인지 확인해 주세요.'); }
  if (!res.ok) throw new Error(`Apps Script 응답 오류 (HTTP ${res.status})`);
  let data: { items?: AppsScriptItem[]; error?: string; totalRows?: number; duplicates?: number; invalid?: number };
  try { data = await res.json(); } catch { throw new Error('JSON 응답이 아니에요. 배포 주소(…/exec)가 맞는지 확인해 주세요.'); }
  if (data.error) throw new Error(`Apps Script 오류: ${data.error}`);
  if (!Array.isArray(data.items)) throw new Error('응답에 items 목록이 없어요. 안내된 Code.gs를 사용했는지 확인해 주세요.');
  const participants = data.items.map((it, i) => ({
    id: String(it.key), entryNo: i + 1, rowNo: Number(it.rowNo) || 0,
    nameMasked: String(it.name), last4: phoneLast4(String(it.last4 ?? it.phone ?? '')), submittedAt: it.submittedAt ? String(it.submittedAt) : undefined,
  }));
  return { participants, totalRows: data.totalRows, duplicates: data.duplicates, invalid: data.invalid };
}

