# CueNote — 동키의 4번째 잡동사니

CueNote(마크다운 큐시트 앱)의 소개·다운로드·설치·사용 방법을 한 페이지로 모은 곳입니다.
앱 소스는 이 저장소가 아니라 `D:\CueNote` 에 있고, 여기에는 배포 파일만 둡니다.

| 경로 | 내용 |
| --- | --- |
| `index.html` · `cuenote.css` · `cuenote.js` | 소개 페이지 |
| `images/` | 앱 아이콘, 실제 앱 화면 캡처 |
| `downloads/` | APK, AI 스킬(SKILL.md · claude.ai 용 zip), 샘플 MD, 사용 설명서, 자료 묶음 zip, `manifest.json` |

## CueNote 새 버전을 올릴 때

1. `D:\CueNote` 에서 `npm run android:release` 로 `release/CueNote-<버전>-release.apk` 를 만듭니다.
2. 이 저장소 루트에서:

```bash
npm run sync:cuenote
```

APK(이전 버전은 지움)·SKILL.md·샘플 MD 를 가져오고, claude.ai 용 스킬 zip 과 `CueNote-resources.zip`(스킬 + MD 묶음), `manifest.json`(버전·파일 크기)을 다시 만듭니다. 페이지의 버전·크기·링크는 `manifest.json` 에서 자동으로 바뀝니다.
원본 위치가 다르면 `CUENOTE_DIR=E:/work/CueNote npm run sync:cuenote`.

- `downloads/CueNote-guide.md`(사용 설명서)는 이 저장소에서 직접 고칩니다. 고친 뒤 `npm run sync:cuenote` 를 다시 실행해야 묶음 zip 에 반영됩니다.
- 화면 캡처(`images/shot-*.png`)는 자동으로 바뀌지 않습니다. 앱 화면이 크게 바뀌면 다시 캡처해 주세요.
