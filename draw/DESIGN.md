# 모두의 추첨 — 설계서

> 동키의 잡동사니 No.01. 이 문서는 구현과 함께 갱신되었습니다.
> - v1: 슬롯머신 → 서바이벌 교체, 기술 스택 단순화
> - v2: 수동/일괄 추첨 선택, 휴대폰은 뒷 4자리만 표시(= 추첨번호), 서바이벌 3단계 고정, 고급스러운 디자인(미드나잇 네이비·샴페인 골드)

## 1. 목표와 범위

| 항목 | 내용 |
|---|---|
| 데이터 소스 | ① CSV · 엑셀(xlsx·xls) 파일 업로드 ② 구글 시트 "웹에 게시" CSV 링크 ③ Apps Script JSON API(마스킹) |
| 추첨 설정 | 차수(1차, 2차…), 경품명(선택), 당첨 인원, 진행 방식 |
| 추첨 연출 | 로또 볼 추첨기 / 카드 뒤집기 / 서바이벌(대량) — 3가지 중 선택 |
| 화면 표시 | 이름 가운데 글자를 `*`로 가리고, 휴대폰은 **뒷 4자리만** 표시(= 추첨번호). 이름과 함께 큰 글씨 |
| 진행 방식 | **수동 추첨**(Space·클릭으로 한 명씩) / **일괄 추첨**(클릭 없이 한 명씩 차례로 자동, Space로 일시정지) |
| 결과 | 전체 차수 당첨자 CSV 다운로드 |
| 운영 | 서버 없음(정적 사이트). 동키의 잡동사니 `draw/` 하위 페이지. 새로고침해도 진행 상태 유지 |
| 규모 | 참가자 수천 명, 한 차수 당첨 수백 명까지 |

범위 밖: 로그인/권한, 참가자 응모 페이지(구글 폼이 담당), 다중 기기 실시간 동기화.

---

## 2. 기술 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| 빌드/프레임워크 | **Vite + React + TypeScript** | 서버 기능이 필요 없어 Next.js보다 가볍고 정적 배포가 단순. 잡동사니 전체가 Vite 멀티 페이지 하나로 빌드됨 |
| 스타일 | 일반 CSS (CSS 변수) | 의존성 최소화, 무대용 큰 글씨 제어 |
| 애니메이션 | CSS transition/keyframes, canvas-confetti | 카드·서바이벌 연출, 당첨 축포 |
| 물리 연출 | 직접 만든 2D canvas 시뮬레이션 | 로또 볼 추첨기의 공 튕김 (공 40개 이하라 충분) |
| CSV | PapaParse | 업로드/게시 CSV 파싱, 인코딩·따옴표 처리 |
| 상태 | Zustand + persist(localStorage) | 차수·당첨자 기록을 새로고침 후에도 유지 |
| 사운드 | Web Audio 합성 (드럼롤, 팡파르) | 음원 파일 없이 동작, 음소거 토글 |

---

## 3. 전체 구조

```
 [구글 폼] ──응답──▶ [구글 시트]
                        │
          ┌─────────────┼──────────────────────┐
          ▼             ▼                      ▼
   (A) CSV 파일     (B) 웹에 게시 CSV      (C) Apps Script doGet
     업로드           fetch(URL)            fetch(URL) → 마스킹 JSON
          └─────────────┼──────────────────────┘
                        ▼
              [DataSource 어댑터] → Participant[] 로 정규화
                        ▼
        정규화·중복 제거·유효성 검사 (전화번호 기준)
                        ▼
     [추첨 엔진] crypto 난수로 당첨자 "먼저" 확정
                        ▼
     [연출 컴포넌트] 확정된 결과에 맞춰 애니메이션 재생
                        ▼
        [기록 저장소] 차수별 당첨자 → CSV 내보내기
```

**핵심 원칙: 결과 확정 → 연출.** 당첨자는 버튼을 누르는 순간 암호학적 난수로 확정되고, 애니메이션은 그 결과에 "착지"하는 연출일 뿐입니다. 애니메이션 프레임 타이밍이 결과에 영향을 주지 않아 공정성이 보장되고, 테스트도 쉽습니다.

---

## 4. 데이터 연동

### 4.1 공통 내부 모델

```ts
interface Participant {
  id: string;          // 고유키: 전화번호 해시(또는 C방식에선 서버가 준 key)
  rowNo: number;       // 원본 시트/CSV의 행 번호 (당첨자 대조용)
  nameMasked: string;  // 홍*동
  last4: string;       // 5678 (휴대폰 뒷 4자리 = 추첨번호)
  nameRaw?: string;    // A·B 방식에서만 존재 (브라우저 메모리에만)
  phoneRaw?: string;
  submittedAt?: string;
}
```

### 4.2 (A) CSV · 엑셀 업로드
- 파일은 브라우저 밖으로 나가지 않음 (가장 안전, 오프라인 행사에도 적합).
- 엑셀(.xlsx · .xls · .ods)은 SheetJS 로 읽음. 엑셀 파일을 고를 때만 라이브러리를 불러와 첫 화면은 가볍게 유지.
- 셀은 엑셀에 보이는 글자 그대로 읽고(날짜·서식 포함), 시트가 여러 개면 이름·휴대폰 열이 있는 시트를 먼저 고른 뒤 사용자가 바꿀 수 있음.
- 맨 위 10줄 안에서 이름·휴대폰 열이 함께 있는 줄을 제목 줄로 고름(표 제목 줄이 있어도 됨). "원본 행"은 실제 파일의 줄 번호.
- UTF-8 / CP949(엑셀 저장본) 자동 판별: UTF-8로 디코드 후 깨짐 문자(`�`)가 많으면 `TextDecoder('euc-kr')`로 재시도.

### 4.3 (B) 구글 시트 "웹에 게시" CSV
- `https://docs.google.com/spreadsheets/d/e/<ID>/pub?output=csv` 를 `fetch`.
- ⚠️ 원본 이름·전화번호가 공개 URL에 노출됨 → 화면에 경고 배너 표시, "행사 후 게시 중단" 안내. 마스킹 전용 시트를 따로 게시하는 방법도 안내.

### 4.4 (C) Apps Script API — **구글 폼 연동 시 권장**
마스킹과 중복 제거를 서버(Apps Script)에서 끝낸 뒤 JSON만 내려줍니다. 원본 개인정보가 브라우저로 오지 않습니다.

```js
// Code.gs — 시트에 바인딩된 Apps Script
const SHEET_NAME = '설문지 응답 시트1';
const NAME_COL = '이름';
const PHONE_COL = '휴대폰 번호';
const SALT = 'change-me';      // 스크립트 속성에 두는 것을 권장

function doGet(e) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  const [header, ...rows] = sh.getDataRange().getValues();
  const ni = header.indexOf(NAME_COL), pi = header.indexOf(PHONE_COL), ti = 0;
  const seen = new Set();
  const out = [];
  rows.forEach((r, i) => {
    const name = String(r[ni] || '').trim();
    const phone = String(r[pi] || '').replace(/\D/g, '').replace(/^82/, '0');
    if (!name || phone.length < 10) return;
    if (seen.has(phone)) return;          // 중복 응모 제거 (첫 응답만 인정)
    seen.add(phone);
    out.push({
      key: hash(phone),
      rowNo: i + 2,                        // 시트상의 실제 행 번호
      name: maskName(name),
      phone: maskPhone(phone),
      submittedAt: r[ti],
    });
  });
  return ContentService.createTextOutput(JSON.stringify({ count: out.length, items: out }))
    .setMimeType(ContentService.MimeType.JSON);
}

function hash(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s + SALT)
    .map(b => (b & 0xff).toString(16).padStart(2, '0')).join('').slice(0, 16);
}
// maskName / maskPhone 은 5장의 규칙과 동일하게 구현
```

- 배포: [배포] → 새 배포 → 웹 앱, 실행 계정 "나", 액세스 "모든 사용자".
- GET 요청은 CORS 문제 없이 브라우저에서 호출 가능.
- 이 방식에선 원본 연락처가 없으므로, 당첨자 CSV에 **`rowNo`(시트 행 번호)** 를 넣어 담당자가 시트에서 바로 대조하도록 합니다.
- (2단계 옵션) `doPost`로 당첨자 목록을 시트의 "당첨자" 탭에 자동 기록.

### 4.5 열 자동 매핑
헤더에서 키워드로 자동 감지, 실패 시 드롭다운으로 직접 선택:
- 이름: `이름`, `성명`, `name`
- 전화: `전화`, `휴대폰`, `핸드폰`, `연락처`, `phone`, `mobile`

### 4.6 정규화·검증 (A·B 방식)
1. 전화번호: 숫자만 남김, `+82`/`82` → `0`, 10~11자리만 유효.
2. 이름: 앞뒤 공백 제거, 빈 값 제외.
3. 중복: 같은 전화번호는 1명으로 (첫 응답 인정, 옵션으로 "마지막 응답 인정").
4. 불러오기 결과 요약 표시: `총 312행 · 중복 7 · 무효 3 · 추첨 대상 302명`.

---

## 5. 화면 표시 규칙 (v2)

| 원본 | 이름 표시 | 추첨번호 |
|---|---|---|
| 김수 / 010-1234-5678 | 김* | 5678 |
| 홍길동 / 01098760042 | 홍*동 | 0042 |
| 남궁민수 / +82 10-5555-1234 | 남**수 | 1234 |

- 휴대폰은 **뒷 4자리만** 보여 주고 나머지는 화면·저장소 어디에도 남기지 않음. 이 4자리가 곧 **추첨번호**.
- 로또 볼과 서바이벌 타일에 추첨번호가 적혀 있어 당첨 번호를 바로 알 수 있음.
- 뒷자리가 같은 참가자가 있을 수 있으므로 화면에는 항상 이름과 함께 표시.
- CSV의 추첨번호 열은 엑셀에서 앞자리 0이 사라지지 않게 `="0042"` 형태로 저장.

```ts
export const maskName = (name: string) => { /* 첫 글자 + * + 마지막 글자 */ };
export const phoneLast4 = (phone: string) => phone.replace(/\D/g, '').slice(-4);
```

## 6. 추첨 로직

### 6.1 차수(Round) 모델

```ts
interface Round {
  id: string;
  roundNo: number;         // 1, 2, 3 …
  label: string;           // "1차" (자동) 또는 사용자 입력
  prize?: string;          // "스타벅스 기프티콘"
  winnerCount: number;
  method: 'lotto' | 'cards' | 'survival';
  excludePrevWinners: boolean;   // 기본 true
  winners: Winner[];
  drawnAt?: string;
  poolSize: number;        // 추첨 당시 대상자 수 (기록용)
}

interface Winner {
  participantId: string;
  order: number;           // 차수 내 순번
  status: 'won' | 'cancelled';   // 불참 시 취소 → 재추첨
  replacedBy?: string;
}
```

### 6.2 추첨 알고리즘
```ts
function pickWinners(pool: Participant[], n: number): Participant[] {
  const a = [...pool];
  for (let i = a.length - 1; i > a.length - 1 - n; i--) {     // 부분 Fisher–Yates
    const j = secureRandomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(a.length - n).reverse();
}

function secureRandomInt(max: number) {        // 편향 없는 정수 난수
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % max;
}
```

- 대상자 풀 = 전체 참가자 − (excludePrevWinners ? 이전 차수 당첨자 : ∅).
- 검증: `winnerCount > pool.length` 이면 추첨 버튼 비활성화 + 안내.
- **재추첨**: 당첨자가 현장에 없으면 해당 당첨자를 `cancelled`로 바꾸고 1명을 추가로 뽑음(취소된 사람은 그 차수 풀에서도 제외).
- 확정된 차수는 잠금. "차수 초기화"는 확인 대화상자를 거침.

---

## 7. 추첨 연출 3종

모든 연출은 같은 인터페이스를 따릅니다.

```ts
interface DrawAnimationProps {
  pool: Participant[];          // 화면을 채울 후보(마스킹 값만 사용)
  winners: Participant[];       // 이미 확정된 결과
  speed: 'normal' | 'fast';
  mode: 'oneByOne' | 'all';     // 한 명씩 / 한번에
  onReveal(index: number): void;
  onComplete(): void;
}
```

### ① 🏟️ 서바이벌 — "수백 명 대량 추첨" (슬롯머신 대체)
슬롯머신은 한 명씩 멈추는 방식이라 당첨자가 수백 명이면 진행이 불가능해서 대량 추첨용 방식으로 바꿨습니다.
- 대상자 **전원**이 화면에 타일로 깔림 (화면에 맞춰 크기 자동 조절: 크면 이름+추첨번호, 작으면 추첨번호 4자리, 수천 명이면 점).
- 수동 추첨은 Space를 누를 때마다, 일괄 추첨은 자동으로 단계 진행: 남은 타일이 무작위로 깜빡이며 드럼롤 → "쿵" 소리와 함께 탈락자 타일이 꺼짐. 남은 인원 카운터가 줄어듦.
- **항상 3단계**로 진행: 1단계 탈락자의 약 50%, 2단계 남은 탈락자의 약 60%, 3단계(최종)에서 나머지 전부. 최종 단계는 스캔을 길게 끌어 긴장감.
- 마지막까지 남은 타일이 금색으로 빛나고 → 당첨자 명단 보드(스크롤)로 전환.
- 적합: 당첨 수십~수백 명.

### ② 🎱 로또 볼 추첨기 — "보는 재미, 현장감" (1~10명)
- 투명한 원형 통 안에서 공(응모번호 표시)이 canvas 물리로 튀어다님. 공은 최대 40개만 렌더링(시각 효과용).
- 공 하나가 배출구로 굴러 나와 확대 → 공이 열리며 마스킹된 이름·번호 공개.
- 공개된 당첨자는 화면 하단 레일에 차례로 쌓임.
- 적합: 당첨 인원 3~20명.

### ③ 🃏 카드 뒤집기 — "진행자 인터랙션" (10~60명)
- 당첨 인원 수만큼 카드가 덱에서 날아와 격자로 배치되며 셔플.
- 진행자가 카드를 클릭하면 3D 뒤집기로 공개, 또는 "전체 공개"로 물결처럼 순차 플립.
- 40장 넘으면 페이지로 나눠 진행.
- 적합: 당첨 인원 10~60명.

### 진행 방식: 수동 / 일괄
- **수동 추첨**: 진행자가 Space·→·클리커·클릭으로 한 명(서바이벌은 한 단계)씩 공개.
- **일괄 추첨**: 버튼을 누르지 않아도 한 명씩 차례로 자동 공개. 로또는 공개 후 약 2.8초, 카드는 1초 간격, 서바이벌은 단계 사이 1.6초(빠르게 모드는 더 짧게). Space로 일시정지·계속.
- 어느 방식이든 `A`(전체 공개)로 남은 결과를 한 번에 공개 가능.

### 공통 무대 기능
- 전체 화면(F 키), 스페이스바/클리커(→ 키)로 진행, 음소거(M).
- 상단 고정: `2차 · 스타벅스 기프티콘 · 5명 추첨 · 대상 295명`.
- 연출 속도: 보통 / 빠르게. 인원이 많으면 "한번에" 모드 자동 추천.
- `prefers-reduced-motion` 환경에서는 짧은 페이드로 대체.

---

## 8. 화면 구성

```
┌ ① 데이터 불러오기 ──────────────────────────┐
│ [CSV 업로드] [게시된 시트 URL] [Apps Script URL] │
│ 열 매핑 · 불러오기 요약 · 마스킹 미리보기(상위 10명) │
│ (B·C) [새로고침] 버튼 — 마감 직전 응답 재수집      │
└──────────────────────────────────────────┘
┌ ② 추첨 설정 ────────────────────────────────┐
│ 차수 [2] (자동 증가)   경품명 [__________]       │
│ 당첨 인원 [5]          □ 이전 당첨자 제외 (기본 ✔) │
│ 방식  (🎱 로또 볼) (🃏 카드) (🏟️ 서바이벌)     │
│                          [ 추첨 시작 ▶ ]       │
└──────────────────────────────────────────┘
┌ ③ 추첨 무대 (전체 화면) ─────────────────────┐
│               연출 애니메이션                   │
└──────────────────────────────────────────┘
┌ ④ 결과 · 기록 ─────────────────────────────┐
│ 차수별 당첨자 카드 목록, [재추첨] [차수 삭제]      │
│ [ 당첨자 CSV 다운로드 ]   [ 전체 초기화 ]          │
└──────────────────────────────────────────┘
```

라우팅 없이 단일 페이지 + 단계 탭(데이터 → 설정 → 무대 → 결과)으로 구성. 무대는 오버레이 전체 화면.

---

## 9. 당첨자 CSV 내보내기

- 인코딩: **UTF-8 + BOM** (엑셀에서 한글 깨짐 방지).
- 파일명: `당첨자_20261114_1530.csv`
- 열:

| 차수 | 경품 | 순번 | 추첨번호 | 이름 | 원본행 | 상태 | 추첨시각 |
|---|---|---|---|---|---|---|---|
| 1차 | 커피 쿠폰 | 1 | 5678 | 홍*동 | 15 | 당첨 | 2026-11-14 15:30:12 |
| 1차 | 커피 쿠폰 | 2 | 0042 | 김*수 | 88 | 취소(불참) | 2026-11-14 15:30:12 |

- A·B 방식(원본 보유)일 때는 내보내기 옵션 "원본 이름·전화 포함" 체크박스 제공(경품 발송용). 기본값은 해제, 체크 시 개인정보 경고 표시.
- C 방식은 마스킹 값 + `원본행`만 내보내고, 담당자가 시트에서 대조.
- 화면 하단에 추첨 기록(차수별 대상자 수, 시각)도 같이 내보내 감사 근거로 활용 가능.

---

## 10. 상태 저장과 안전장치

- Zustand persist로 `rounds`, 설정, 데이터 소스 URL을 localStorage에 저장 → 브라우저가 꺼져도 이어서 진행.
- 원본 개인정보(`nameRaw`, `phoneRaw`)는 **저장하지 않음**(메모리에만). 새로고침 후엔 데이터를 다시 불러오고, 기존 당첨 기록은 `id`로 다시 연결.
- 데이터가 바뀌어도(응답 추가) 기존 당첨자 `id`는 유지되므로 기록이 깨지지 않음.
- 행사 종료 후 "모든 데이터 지우기" 버튼.

---

## 11. 폴더 구조 (구현)

```
simple_projects/            # 동키의 잡동사니 (Vite 멀티 페이지)
├─ index.html, home/        # 잡동사니 홈
├─ draw/                    # 모두의 추첨
│  ├─ index.html
│  ├─ apps-script/Code.gs   # 구글 시트용 Apps Script (사용 방법 화면에서 복사 가능)
│  └─ src/
│     ├─ App.tsx, main.tsx, store.ts, types.ts, styles.css
│     ├─ lib/               # mask, normalize, random, sources, exportCsv, sound, sample (+ lib.test.ts)
│     ├─ components/        # DataLoader, RoundSetup, Stage, ResultBoard, Guide, Icon
│     └─ animations/        # Lotto, Cards, Survival, WinnerBoard, common
└─ timer/                   # 지금, 타이머
```

## 12. 구현 순서

1. **기반** — Vite 프로젝트, 타입, `mask` / `normalize` / `random` + 단위 테스트.
2. **데이터** — CSV 업로드 → 열 매핑 → 요약/미리보기. 이어서 게시 URL, Apps Script 어댑터.
3. **추첨 흐름** — 차수 설정, 추첨 엔진, 결과 보드, CSV 내보내기(연출 없이 즉시 결과로 먼저 완성).
4. **연출** — 카드 뒤집기 → 서바이벌 → 로또 볼 순(난이도 순).
5. **무대 다듬기** — 전체 화면, 단축키, 사운드, 축포, 재추첨.
6. **배포** — Vercel 정적 배포, Apps Script 배포 가이드 정리.

## 13. 테스트 포인트
- 마스킹: 1·2·3·4글자 이름, 영문, 10/11자리·하이픈·+82 번호.
- 중복 제거: 같은 번호 다른 표기(`010-1234-5678` vs `01012345678`).
- 추첨: 당첨 인원 = 대상자 수, 대상자 수 초과, 이전 당첨자 제외 시 풀 감소, 재추첨 시 취소자 제외.
- 공정성: 10만 회 시뮬레이션으로 각 참가자 당첨 빈도가 균등한지 확인.
- CSV: 엑셀에서 한글·쉼표 포함 경품명이 정상 표시되는지.
