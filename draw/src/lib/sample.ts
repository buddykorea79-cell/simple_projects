// 체험용 가짜 참가자 명단. 실제 인물과 무관한 무작위 조합입니다.
const SURNAMES = '김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허남심노하곽성차주우구민유나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용'.split('');
const SYL = '민서준지윤하은도현수아예린우진태연시후가온다인채원주원하준소율유나재민건우서연지호나래보람한결새봄이안로운'.match(/.{1}/g)!;

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

export function makeSampleCsv(count = 320): string {
  const rows = ['타임스탬프,이름,휴대폰 번호,소속'];
  const teams = ['기획팀', '개발팀', '디자인팀', '영업팀', '인사팀', '고객지원팀'];
  const used: string[] = [];
  const start = new Date(2026, 10, 14, 9, 0, 0).getTime();
  for (let i = 0; i < count; i++) {
    const name = pick(SURNAMES) + pick(SYL) + pick(SYL);
    const phone = `010-${String(1000 + Math.floor(Math.random() * 9000))}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    used.push(phone);
    const t = new Date(start + i * 47_000).toLocaleString('ko-KR');
    rows.push(`"${t}",${name},${phone},${pick(teams)}`);
  }
  // 중복 응모 몇 건과 잘못된 번호 몇 건 (불러오기 요약을 확인해 보라는 뜻)
  for (let i = 0; i < 6; i++) rows.push(`"${new Date(start + (count + i) * 47_000).toLocaleString('ko-KR')}",${pick(SURNAMES)}${pick(SYL)}${pick(SYL)},${used[(i * 7) % used.length].replace(/-/g, '')},${pick(teams)}`);
  rows.push(`"${new Date().toLocaleString('ko-KR')}",테스트,1234,기획팀`);
  rows.push(`"${new Date().toLocaleString('ko-KR')}",,010-0000-0000,개발팀`);
  return rows.join('\n');
}
