import './seal-stars.js';

// 서랍에 새 잡동사니를 넣으려면 이 배열에 항목을 하나 추가하면 됩니다.
// external: true 이면 새 창(탭)으로 열립니다.
const projects = [
  {
    href: './draw/',
    name: '모두의 추첨',
    desc: '구글 폼·CSV·엑셀 참가자 명단으로 경품을 추첨해요. 로또 볼, 카드, 서바이벌 연출과 수동·일괄 진행.',
    tags: ['경품 추첨', '구글 폼', 'CSV·엑셀'],
    accent: '#d9b45f',
    icon: '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
    steps: ['참가자 명단 불러오기', '차수·인원·방식 정하기', '추첨하고 CSV 받기'],
  },
  {
    href: './timer/',
    name: '지금, 타이머',
    desc: '멀리서도 잘 보이는 큰 글씨 타이머. 발표·회의·수업의 시간을 또렷하게 지켜 줘요.',
    tags: ['타이머', '전체 화면', '보색 테마'],
    accent: '#f2a76b',
    icon: '<circle cx="12" cy="14" r="8"/><path d="M12 10v4l3 2M9 2h6M12 2v4M19 6l2-2"/>',
    steps: ['빠른 시작(1~10분) 누르기', '또는 분·초 직접 입력', 'F 키로 전체 화면'],
  },
  {
    href: 'https://buddybuddy-sle9.onrender.com/',
    external: true,
    name: 'EduTalk',
    desc: '강사가 강의실을 열고 학생은 방 코드로 들어와, 강의 중에 실시간으로 소통하는 교육 플랫폼.',
    tags: ['교육', '실시간 소통', '외부 서비스'],
    accent: '#8fb0d8',
    icon: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.5-4.3A8.4 8.4 0 1 1 21 11.5z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/>',
    steps: ['강사는 강의실 열기', '학생은 방 코드로 입장', '강의 중 실시간 소통'],
  },
  {
    href: './cuenote/',
    name: 'CueNote',
    desc: '마크다운 한 장으로 무대를 진행하는 행사 큐시트 앱. 안드로이드 앱과 AI 스킬·샘플 MD를 내려받아요.',
    tags: ['안드로이드 앱', '큐시트', 'AI 스킬'],
    accent: '#c9a7ec',
    icon: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M10 12.5v5l4.5-2.5z"/>',
    steps: ['APK 내려받아 설치', '행사 MD 불러오기', '단계별 원고·타이머로 진행'],
  },
  {
    href: './studio-mini/',
    name: 'Donkey-Studio Mini',
    desc: '드론·액션캠 원본에서 AI가 좋은 장면을 골라 주고, 다듬고 보정해 MP4로 저장하는 내 PC 전용 영상 앱.',
    tags: ['Windows 앱', '영상 편집', '로컬 AI'],
    accent: '#ff9a5c',
    icon: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3.5v11L16 14"/><path d="m8 9.5.9 2.1 2.1.9-2.1.9L8 15.5l-.9-2.1-2.1-.9 2.1-.9z"/>',
    steps: ['ZIP 내려받아 압축 풀기', '영상 넣고 AI 추천 받기', '다듬고 보정해 MP4 저장'],
  },
];

const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
const outArrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const grid = document.getElementById('projects');
const total = String(projects.length).padStart(2, '0');
document.getElementById('count').textContent = `${total} items`;
document.getElementById('nav-count').textContent = `도구 ${projects.length}개`;

projects.forEach((p, i) => {
  const a = document.createElement('a');
  a.className = `card${p.external ? ' external' : ''}`;
  a.href = p.href;
  if (p.external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  a.style.setProperty('--accent', p.accent);
  a.style.setProperty('--i', i);
  a.innerHTML = `
    <div class="card-top">
      <span class="card-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${p.icon}</svg></span>
      <span class="card-no">No. ${String(i + 1).padStart(2, '0')}</span>
    </div>
    <h3>${p.name}${p.external ? '<span class="ext-badge">외부 링크</span>' : ''}</h3>
    <p class="card-desc">${p.desc}</p>
    <ol class="card-steps">${p.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <div class="card-foot">
      <span class="tags">${p.tags.join('<i aria-hidden="true">·</i>')}</span>
      <span class="open">${p.external ? `새 창에서 열기${outArrow}` : `열기${arrow}`}</span>
    </div>
    ${p.external ? '<span class="sr-only">(새 창에서 열림)</span>' : ''}`;
  grid.append(a);
});

const soon = document.createElement('div');
soon.className = `soon r${projects.length % 3}`;   // 3열에서 마지막 줄의 남은 칸을 채운다
soon.innerHTML = `<span class="soon-no">No. ${String(projects.length + 1).padStart(2, '0')}</span><span class="soon-text">다음 잡동사니를 서랍에 넣는 중이에요.</span><span class="soon-plus" aria-hidden="true">+</span>`;
grid.append(soon);
