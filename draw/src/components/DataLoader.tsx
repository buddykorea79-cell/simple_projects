import { useRef, useState } from 'react';
import { useDraw } from '../store';
import type { ColumnMapping, SourceType } from '../types';
import { buildParticipants, detectColumns } from '../lib/normalize';
import { fetchAppsScript, fetchPublishedCsv, makeSampleXlsx, parseCsvText, pickSheet, readSpreadsheetFile, type Sheet, type Table } from '../lib/sources';
import { makeSampleCsv } from '../lib/sample';
import { downloadText, formatDateTime } from '../lib/exportCsv';
import { Icon } from './Icon';

// 열 매핑을 다시 고를 수 있도록 마지막으로 읽은 표를 메모리에 둔다 (저장하지 않음).
// 엑셀은 시트가 여러 개일 수 있어 시트 목록도 함께 둔다.
type Loaded = { table: Table; type: SourceType; url?: string; fileName?: string; sheets?: Sheet[]; sheetIndex?: number };
let lastTable: Loaded | null = null;

const SOURCE_LABEL: Record<SourceType, string> = { csv: '파일', published: '게시된 시트', appsScript: 'Apps Script', sample: '샘플 데이터' };
const FILE_ACCEPT = '.csv,.xlsx,.xls,.xlsm,.ods,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

export function DataLoader({ onNext, onOpenGuide }: { onNext(): void; onOpenGuide(section: string): void }) {
  const { settings, setSettings, source, participants, rounds, salt, setData, rawCount } = useDraw();
  const [tab, setTab] = useState<'csv' | 'published' | 'appsScript'>(source?.type === 'published' || source?.type === 'appsScript' ? source.type : 'csv');
  const [pubUrl, setPubUrl] = useState(source?.type === 'published' ? source.url ?? '' : '');
  const [gasUrl, setGasUrl] = useState(source?.type === 'appsScript' ? source.url ?? '' : '');
  const [mapping, setMapping] = useState<ColumnMapping | null>(lastTable ? detectColumns(lastTable.table.headers) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function applyTable(t: NonNullable<typeof lastTable>, m: ColumnMapping, opts = settings) {
    if (m.name < 0 || m.phone < 0) {
      setError('이름 열과 휴대폰 열을 아래에서 골라 주세요.');
      return;
    }
    const res = buildParticipants(t.table.rows, m, { dedupe: opts.dedupe, salt, firstRow: t.table.firstRow });
    if (!res.participants.length) { setError('유효한 참가자가 한 명도 없어요. 열 선택을 확인해 주세요.'); }
    setData({ type: t.type, url: t.url, fileName: t.fileName, loadedAt: new Date().toISOString(), stats: res.stats, hasRaw: true }, res.participants, res.raw);
  }

  function loadTable(t: NonNullable<typeof lastTable>) {
    lastTable = t;
    const m = detectColumns(t.table.headers);
    setMapping(m);
    setError('');
    applyTable(t, m);
  }

  async function run(job: () => Promise<void>) {
    setBusy(true); setError('');
    try { await job(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  const onFile = (file?: File) => file && run(async () => {
    const sheets = await readSpreadsheetFile(file);
    const i = pickSheet(sheets);
    loadTable(fromSheet(file.name, sheets, i));
  });

  function fromSheet(fileName: string, sheets: Sheet[], i: number): Loaded {
    const many = sheets.length > 1;
    return { table: sheets[i].table, type: 'csv', fileName: many ? `${fileName} · ${sheets[i].name}` : fileName, sheets, sheetIndex: i };
  }

  function changeSheet(i: number) {
    if (!lastTable?.sheets) return;
    const base = lastTable.fileName?.split(' · ')[0] ?? '';
    loadTable(fromSheet(base, lastTable.sheets, i));
  }

  const onSampleXlsx = () => run(async () => downloadText('모두의추첨_샘플.xlsx', await makeSampleXlsx(makeSampleCsv(30))));

  const onPublished = () => run(async () => loadTable({ table: await fetchPublishedCsv(pubUrl), type: 'published', url: pubUrl.trim() }));

  const onAppsScript = () => run(async () => {
    const r = await fetchAppsScript(gasUrl);
    lastTable = null; setMapping(null);
    const valid = r.participants.length;
    setData({
      type: 'appsScript', url: gasUrl.trim(), loadedAt: new Date().toISOString(), hasRaw: false,
      stats: { totalRows: r.totalRows ?? valid, duplicates: r.duplicates ?? 0, invalid: r.invalid ?? 0, valid },
    }, r.participants);
  });

  const onSample = () => run(async () => loadTable({ table: parseCsvText(makeSampleCsv()), type: 'sample' }));

  function changeOption(p: Partial<typeof settings>) {
    setSettings(p);
    if (lastTable && mapping) applyTable(lastTable, mapping, { ...settings, ...p });
  }

  function changeMapping(key: keyof ColumnMapping, value: number) {
    if (!lastTable || !mapping) return;
    const m = { ...mapping, [key]: value };
    setMapping(m); setError('');
    applyTable(lastTable, m);
  }

  const preview = participants.slice(0, 10);
  const canRefresh = source && (source.type === 'published' || source.type === 'appsScript') && source.url;

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <span className="kicker">Participants</span>
            <h2>참가자 명단 불러오기</h2>
            <p className="sub">명단은 이 브라우저 안에서만 처리돼요. 화면에는 가린 이름(홍*동)과 휴대폰 뒷 4자리만 보여요.</p>
          </div>
          <button className="btn ghost" onClick={onSample} disabled={busy}><Icon name="sparkle" size={18} />샘플 데이터로 체험</button>
        </div>

        <div className="segmented" role="tablist" aria-label="데이터 불러오는 방법">
          {([['csv', 'CSV · 엑셀 파일', 'upload'], ['published', '게시된 구글 시트', 'link'], ['appsScript', 'Apps Script (권장)', 'code']] as const).map(([id, label, icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); setError(''); }}>
              <Icon name={icon} size={17} />{label}
            </button>
          ))}
        </div>

        {tab === 'csv' && (
          <div className="source-body">
            <button
              className={`dropzone${drag ? ' drag' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
              disabled={busy}
            >
              <Icon name="upload" size={30} />
              <strong>CSV·엑셀 파일을 끌어다 놓거나 눌러서 고르세요</strong>
              <span>.csv · .xlsx · .xls 지원 · 이름, 휴대폰 번호 열이 있는 제목 줄이 필요해요</span>
            </button>
            <input ref={fileRef} type="file" accept={FILE_ACCEPT} hidden onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            <div className="sample-links">
              <span>양식 예시 내려받기</span>
              <button className="link-btn" onClick={() => downloadText('모두의추첨_샘플.csv', '\uFEFF' + makeSampleCsv(30))}><Icon name="download" size={15} />CSV</button>
              <button className="link-btn" onClick={onSampleXlsx} disabled={busy}><Icon name="download" size={15} />엑셀</button>
            </div>
          </div>
        )}

        {tab === 'published' && (
          <div className="source-body">
            <div className="notice warn"><Icon name="alert" size={18} /><span>웹에 게시한 시트는 링크만 알면 누구나 원본 이름·전화번호를 볼 수 있어요. 행사가 끝나면 꼭 <b>게시를 중단</b>하거나, 마스킹한 시트만 따로 게시하세요.</span></div>
            <label className="field-label" htmlFor="pub-url">구글 시트 게시 링크 (CSV)</label>
            <div className="input-row">
              <input id="pub-url" className="input" placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv" value={pubUrl} onChange={e => setPubUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && pubUrl && onPublished()} />
              <button className="btn primary" onClick={onPublished} disabled={busy || !pubUrl.trim()}>{busy ? '불러오는 중…' : '불러오기'}</button>
            </div>
            <button className="link-btn" onClick={() => onOpenGuide('google')}><Icon name="help" size={15} />게시 링크 만드는 방법</button>
          </div>
        )}

        {tab === 'appsScript' && (
          <div className="source-body">
            <div className="notice ok"><Icon name="check" size={18} /><span>Apps Script가 <b>가려진 이름·번호만</b> 내려보내서 원본 개인정보가 브라우저로 오지 않아요. 중복 제거도 시트 쪽에서 끝나요.</span></div>
            <label className="field-label" htmlFor="gas-url">Apps Script 웹 앱 주소</label>
            <div className="input-row">
              <input id="gas-url" className="input" placeholder="https://script.google.com/macros/s/…/exec" value={gasUrl} onChange={e => setGasUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && gasUrl && onAppsScript()} />
              <button className="btn primary" onClick={onAppsScript} disabled={busy || !gasUrl.trim()}>{busy ? '불러오는 중…' : '불러오기'}</button>
            </div>
            <button className="link-btn" onClick={() => onOpenGuide('apps-script')}><Icon name="code" size={15} />Code.gs 붙여 넣고 배포하는 방법</button>
          </div>
        )}

        {tab !== 'appsScript' && (
          <div className="options">
            <div className="option">
              <span className="field-label">같은 번호로 여러 번 응모하면</span>
              <div className="chips">
                <button className={settings.dedupe === 'first' ? 'chip on' : 'chip'} onClick={() => changeOption({ dedupe: 'first' })}>첫 응답만 인정</button>
                <button className={settings.dedupe === 'last' ? 'chip on' : 'chip'} onClick={() => changeOption({ dedupe: 'last' })}>마지막 응답만 인정</button>
              </div>
            </div>
          </div>
        )}

        {error && <div className="notice error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}

        {lastTable && mapping && (
          <div className="mapping">
            {lastTable.sheets && lastTable.sheets.length > 1 && (
              <label className="select-wrap sheet-pick">
                <span>시트 <small>(내용이 있는 시트 {lastTable.sheets.length}개)</small></span>
                <select value={lastTable.sheetIndex ?? 0} onChange={e => changeSheet(Number(e.target.value))}>
                  {lastTable.sheets.map((sh, i) => <option key={i} value={i}>{sh.name} · {sh.table.rows.length.toLocaleString()}행</option>)}
                </select>
              </label>
            )}
            <span className="field-label">열 연결 <small>(자동으로 찾았어요. 다르면 바꿔 주세요)</small></span>
            <div className="mapping-row">
              {([['name', '이름 열'], ['phone', '휴대폰 열'], ['time', '응답 시각 열 (선택)']] as const).map(([k, label]) => (
                <label key={k} className="select-wrap">
                  <span>{label}</span>
                  <select value={mapping[k]} onChange={e => changeMapping(k, Number(e.target.value))}>
                    <option value={-1}>{k === 'time' ? '사용 안 함' : '골라 주세요'}</option>
                    {lastTable!.table.headers.map((h, i) => <option key={i} value={i}>{h || `(${i + 1}번째 열)`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
      </section>

      {source && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>불러온 명단 <span className="big-num">{participants.length.toLocaleString()}</span>명</h2>
              <p className="sub">{SOURCE_LABEL[source.type]}{source.fileName ? ` · ${source.fileName}` : ''} · {formatDateTime(source.loadedAt)} 불러옴</p>
            </div>
            <div className="head-actions">
              {canRefresh && <button className="btn ghost" disabled={busy} onClick={source.type === 'published' ? onPublished : onAppsScript}><Icon name="refresh" size={17} />최신 응답 다시 불러오기</button>}
              <button className="btn primary" onClick={onNext} disabled={!participants.length}>다음: 추첨하기<Icon name="forward" size={18} /></button>
            </div>
          </div>
          <div className="stats">
            <div><span>전체 행</span><b>{source.stats.totalRows.toLocaleString()}</b></div>
            <div><span>중복 응모 제외</span><b>{source.stats.duplicates.toLocaleString()}</b></div>
            <div><span>빈 값·잘못된 번호</span><b>{source.stats.invalid.toLocaleString()}</b></div>
            <div className="hl"><span>추첨 대상</span><b>{source.stats.valid.toLocaleString()}</b></div>
          </div>
          {rounds.length > 0 && <p className="hint">이미 진행한 {rounds.length}개 차수의 당첨 기록은 그대로 유지돼요. 같은 휴대폰 번호면 같은 사람으로 인식해요.</p>}
          {source.type !== 'appsScript' && rawCount === 0 && <p className="hint">새로고침해서 원본 정보는 지워졌어요(저장하지 않아요). 원본 이름·번호가 들어간 CSV가 필요하면 명단 파일을 다시 불러오세요.</p>}
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>추첨번호</th><th>이름</th><th>응모순서</th><th>원본 행</th><th>응답 시각</th></tr></thead>
              <tbody>
                {preview.map(p => <tr key={p.id}><td className="num4 strong">{p.last4}</td><td className="strong">{p.nameMasked}</td><td className="num">{p.entryNo}</td><td className="num">{p.rowNo}</td><td className="muted">{p.submittedAt ?? '-'}</td></tr>)}
              </tbody>
            </table>
            {participants.length > preview.length && <p className="table-more">외 {(participants.length - preview.length).toLocaleString()}명</p>}
          </div>
        </section>
      )}
    </div>
  );
}
