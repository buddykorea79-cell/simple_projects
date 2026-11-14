import Papa from 'papaparse';
import type { Participant } from '../types';
import { phoneLast4 } from './mask';

export interface Table { headers: string[]; rows: string[][]; }

export function parseCsvText(text: string): Table {
  const res = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
  const [headers = [], ...rows] = res.data;
  if (!headers.length) throw new Error('CSV에 내용이 없어요.');
  return { headers: headers.map(h => String(h).trim()), rows };
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

