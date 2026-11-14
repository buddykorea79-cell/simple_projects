/**
 * 모두의 추첨 — 구글 시트용 Apps Script
 * 구글 폼 응답 시트의 참가자를 "가린 이름(홍*동) + 휴대폰 뒷 4자리"로만 내려보냅니다.
 *
 * 사용법
 *  1) 구글 폼 응답이 쌓이는 시트에서 [확장 프로그램] → [Apps Script]
 *  2) 이 코드를 전부 붙여 넣고 아래 설정 4줄을 시트에 맞게 고치기
 *  3) [배포] → [새 배포] → 유형: 웹 앱 / 실행 계정: 나 / 액세스 권한: 모든 사용자 → 배포
 *  4) 나온 웹 앱 URL(…/exec)을 모두의 추첨에 붙여 넣기
 */
const SHEET_NAME = '설문지 응답 시트1';   // 응답이 쌓이는 시트(탭) 이름
const NAME_COL = '이름';                // 이름 질문 제목 (일부만 맞아도 됨)
const PHONE_COL = '휴대폰';             // 휴대폰 질문 제목 (일부만 맞아도 됨)
const DEDUPE = 'first';                 // 같은 번호 중복 응모: 'first' 첫 응답 / 'last' 마지막 응답

function doGet() {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (!sheet) return json({ error: '시트 "' + SHEET_NAME + '"를 찾을 수 없어요.' });
    const values = sheet.getDataRange().getDisplayValues();
    const header = values.shift().map(String);
    const ni = header.findIndex(h => h.indexOf(NAME_COL) >= 0);
    const pi = header.findIndex(h => h.indexOf(PHONE_COL) >= 0);
    if (ni < 0 || pi < 0) return json({ error: '이름/휴대폰 열을 찾지 못했어요. NAME_COL, PHONE_COL을 확인하세요.' });

    const salt = getSalt();
    const byPhone = new Map();
    let invalid = 0, duplicates = 0;
    values.forEach((row, i) => {
      const name = String(row[ni] || '').trim();
      const phone = normalizePhone(row[pi]);
      if (!name || !phone) { invalid++; return; }
      const item = { phone, name, rowNo: i + 2, submittedAt: String(row[0] || '') };
      if (byPhone.has(phone)) {
        duplicates++;
        if (DEDUPE === 'last') { byPhone.delete(phone); byPhone.set(phone, item); }
        return;
      }
      byPhone.set(phone, item);
    });

    const items = Array.from(byPhone.values())
      .sort((a, b) => a.rowNo - b.rowNo)
      .map(it => ({ key: hash(it.phone + '|' + salt), rowNo: it.rowNo, name: maskName(it.name), last4: it.phone.slice(-4), submittedAt: it.submittedAt }));

    return json({ totalRows: values.length, duplicates, invalid, count: items.length, items });
  } catch (e) {
    return json({ error: String(e) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function normalizePhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.indexOf('82') === 0 && (d.length === 11 || d.length === 12)) d = '0' + d.slice(2);
  if (/^1[016789]\d{7,8}$/.test(d)) d = '0' + d;
  return /^0\d{8,10}$/.test(d) ? d : null;
}

function maskName(name) {
  const c = Array.from(name.replace(/\s+/g, ' '));
  if (c.length <= 1) return c.join('');
  if (c.length === 2) return c[0] + '*';
  return c[0] + '*'.repeat(c.length - 2) + c[c.length - 1];
}

/** 번호를 되돌릴 수 없는 고유키로 바꾼다. 솔트는 스크립트 속성에 한 번 만들어 보관. */
function getSalt() {
  const props = PropertiesService.getScriptProperties();
  let salt = props.getProperty('SALT');
  if (!salt) { salt = Utilities.getUuid(); props.setProperty('SALT', salt); }
  return salt;
}

function hash(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('').slice(0, 20);
}
