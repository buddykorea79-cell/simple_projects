# 동키의 잡동사니 — 어쩌면 쓸모 있을지도 모르는 것들 (DONKEY’S LITTLE THINGS)

필요할 때 꺼내 쓰는 작은 웹 도구 모음. 서버 없이 브라우저에서만 동작하는 정적 사이트입니다.

| No. | 이름 | 폴더 | 설명 |
|---|---|---|---|
| 01 | 모두의 추첨 | [`draw/`](draw/) | 구글 폼·CSV·엑셀 명단으로 경품 추첨 (로또 볼 / 카드 / 서바이벌, 수동·일괄), 당첨자 CSV 다운로드 |
| 02 | 지금, 타이머 | [`timer/`](timer/) | 큰 글씨 카운트다운 타이머 |
| 03 | EduTalk | 외부 링크 (새 창) | [buddybuddy-sle9.onrender.com](https://buddybuddy-sle9.onrender.com/) — 실시간 교육 소통 플랫폼 |
| 04 | CueNote | [`cuenote/`](cuenote/) | 마크다운 큐시트 앱 소개·다운로드(APK, AI 스킬, 샘플 MD)·설치·사용 방법 |

각 도구의 사용 방법은 앱 안의 **사용 방법** 버튼(처음 열면 자동으로 뜸)과 각 폴더의 README에 있습니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173 — 홈, /draw/, /timer/
npm test           # 모두의 추첨 단위 테스트 + 타이머 테스트
npm run sync:cuenote   # D:/CueNote 의 최신 APK·스킬·샘플 MD 를 cuenote/downloads 로 가져오기
npm run build      # dist/ 에 정적 파일 생성 (Vercel·Netlify·GitHub Pages 어디든 업로드)
```

`base: './'`로 빌드하므로 도메인 루트가 아닌 하위 경로에 올려도 동작합니다.

## 새 잡동사니 추가하기

1. 루트에 폴더를 만들고 `index.html`을 둡니다 (예: `qr/index.html`). 페이지 머리에 `../`로 돌아가는 홈 링크와 사용 방법을 넣어 주세요.
2. `vite.config.ts`의 `build.rollupOptions.input`에 한 줄 추가합니다.
3. `home/home.js`의 `projects` 배열에 카드 정보를 추가합니다.

외부 사이트를 서랍에 넣을 때는 2번 없이 `projects` 배열에 `href`를 전체 주소로 적고 `external: true`를 붙이면 새 창으로 열립니다.

## 구조

```
index.html, home/     홈 화면
draw/                 모두의 추첨 (React + TypeScript)
timer/                지금, 타이머 (순수 HTML/JS)
vite.config.ts        멀티 페이지 빌드 설정
```
