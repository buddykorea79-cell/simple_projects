// Donkey-Studio Mini 소개 페이지 — 다운로드 링크, 명령 복사, 메뉴 표시
const REPO = 'https://github.com/buddykorea79-cell/Donkey-Studio-mini';
const ZIP = `${REPO}/archive/refs/heads/main.zip`;

document.querySelectorAll('[data-zip]').forEach(a => { a.href = ZIP; });
document.querySelectorAll('[data-repo]').forEach(a => { a.href = REPO; });

// 명령 복사 (설치 명령·git clone)
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
}
document.querySelectorAll('[data-copy-wrap]').forEach(wrap => {
  const btn = wrap.querySelector('.copy');
  const code = wrap.querySelector('[data-copy]');
  btn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent.trim());
      wrap.classList.add('copied');
      setTimeout(() => wrap.classList.remove('copied'), 1600);
      toast('복사했어요. 터미널에 붙여 넣으세요.');
    } catch {
      // 클립보드를 쓸 수 없으면 글자를 선택해 두어 Ctrl+C 로 복사하게 한다
      const range = document.createRange();
      range.selectNodeContents(code);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast('Ctrl+C 로 복사해 주세요.');
    }
  });
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
