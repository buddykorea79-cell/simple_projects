// 다운로드 링크·버전·파일 크기는 sync 스크립트가 만든 manifest.json 에서 채운다.
import manifest from './downloads/manifest.json';

const NICE_NAME = {
  apk: f => f,
  bundle: () => 'CueNote_자료모음.zip',
  skillZip: f => f,
  skillMd: f => f,
  ceremony: () => '샘플_창립30주년_기념식.md',
  showcase: () => '샘플_신제품_쇼케이스.md',
  guide: () => 'CueNote_사용설명서.md',
};

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

for (const a of document.querySelectorAll('[data-file]')) {
  const info = manifest.files[a.dataset.file];
  if (!info) continue;
  a.href = `./downloads/${info.file}`;
  a.setAttribute('download', (NICE_NAME[a.dataset.file] ?? (f => f))(info.file));
}
for (const el of document.querySelectorAll('[data-size]')) {
  const info = manifest.files[el.dataset.size];
  if (info) el.textContent = fmtSize(info.size);
}
document.querySelectorAll('[data-version]').forEach(el => { el.textContent = manifest.version; });
document.querySelectorAll('[data-minandroid]').forEach(el => { el.textContent = manifest.minAndroid; });
document.querySelectorAll('[data-updated]').forEach(el => { el.textContent = manifest.updatedAt; });
document.querySelectorAll('[data-apkname]').forEach(el => { el.textContent = manifest.files.apk.file; });

// SKILL.md 내용 복사 (ChatGPT·Gemini 지침에 붙여 넣기용)
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
}
document.querySelector('.copy-skill')?.addEventListener('click', async () => {
  try {
    const text = await (await fetch(`./downloads/${manifest.files.skillMd.file}`)).text();
    await navigator.clipboard.writeText(text);
    toast('SKILL.md 내용을 복사했어요. AI 의 지침 칸에 붙여 넣으세요.');
  } catch {
    toast('복사하지 못했어요. SKILL.md 를 내려받아 열어 주세요.');
  }
});

// 현재 보고 있는 구역을 상단 메뉴에 표시
const links = [...document.querySelectorAll('.nav a')];
const observer = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    links.forEach(l => l.classList.toggle('on', l.getAttribute('href') === `#${e.target.id}`));
  }
}, { rootMargin: '-45% 0px -50% 0px' });
['intro', 'download', 'install', 'usage', 'faq'].forEach(id => { const s = document.getElementById(id); if (s) observer.observe(s); });
