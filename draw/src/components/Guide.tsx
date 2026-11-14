import { useEffect, useRef, useState } from 'react';
import code from '../../apps-script/Code.gs?raw';
import { Icon } from './Icon';
import { METHODS } from './RoundSetup';

export function Guide({ section, onClose }: { section?: string; onClose(): void }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (section) bodyRef.current?.querySelector(`#guide-${section}`)?.scrollIntoView({ block: 'start' });
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [section, onClose]);

  async function copy() {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* 클립보드 권한 없음 */ }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={e => e.stopPropagation()}>
        <header className="guide-head">
          <h2 id="guide-title">모두의 추첨 사용 방법</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기"><Icon name="x" /></button>
        </header>
        <div className="guide-body" ref={bodyRef}>
          <section className="guide-quick">
            <h3>3단계면 끝나요</h3>
            <ol className="steps">
              <li><b>참가자 명단 불러오기</b><span>CSV 파일, 게시된 구글 시트, Apps Script 중 하나로 불러와요. 처음이라면 <em>샘플 데이터로 체험</em>을 눌러 보세요.</span></li>
              <li><b>차수 정하고 추첨</b><span>차수·경품·당첨 인원을 넣고 방식을 고른 뒤 <em>추첨 시작</em>. 무대 화면이 열려요.</span></li>
              <li><b>결과 확인 · CSV 다운로드</b><span>차수가 끝날 때마다 결과가 쌓이고, 모든 차수 당첨자를 CSV 한 파일로 내려받아요.</span></li>
            </ol>
          </section>

          <section id="guide-csv">
            <h3>1. CSV 파일로 불러오기</h3>
            <ul>
              <li>첫 줄은 제목 줄이에요. <code>이름</code>(또는 성명)과 <code>휴대폰</code>(또는 전화, 연락처)이 들어간 열을 자동으로 찾아요. 못 찾으면 직접 골라 주세요.</li>
              <li>휴대폰 번호는 뒷 4자리만 추첨번호로 쓰고, 나머지는 화면에 나오지 않아요.</li>
              <li>엑셀 파일은 <b>[다른 이름으로 저장] → CSV UTF-8</b>로 저장하세요. 일반 CSV(CP949)도 자동으로 읽어요.</li>
              <li>같은 휴대폰 번호로 여러 번 응모하면 한 명으로 쳐요. 빈 이름·잘못된 번호는 빠져요.</li>
              <li>파일은 서버로 올라가지 않고 이 브라우저 안에서만 읽어요.</li>
            </ul>
          </section>

          <section id="guide-google">
            <h3>2. 구글 폼 연동 ① 시트 웹에 게시 (간편)</h3>
            <ol>
              <li>구글 폼 → <b>응답</b> 탭 → <b>스프레드시트에 연결</b>로 응답 시트를 만드세요.</li>
              <li>시트에서 <b>[파일] → [공유] → [웹에 게시]</b> → 응답 시트 선택 → 형식 <b>쉼표로 구분된 값(.csv)</b> → 게시.</li>
              <li>나온 링크를 <em>게시된 구글 시트</em> 탭에 붙여 넣고 불러오기. 마감 직전에 <em>최신 응답 다시 불러오기</em>를 누르면 새 응답이 반영돼요.</li>
            </ol>
            <div className="notice warn"><Icon name="alert" size={18} /><span>게시 링크는 누구나 원본 이름·번호를 볼 수 있어요. 행사 직후 <b>게시 중단</b>하거나 마스킹한 시트만 게시하세요.</span></div>
          </section>

          <section id="guide-apps-script">
            <h3>3. 구글 폼 연동 ② Apps Script (안전 · 권장)</h3>
            <ol>
              <li>응답 시트에서 <b>[확장 프로그램] → [Apps Script]</b>를 여세요.</li>
              <li>아래 코드를 전부 붙여 넣고, 맨 위 설정(<code>SHEET_NAME</code>, <code>NAME_COL</code>, <code>PHONE_COL</code>)을 시트에 맞게 고치세요.</li>
              <li><b>[배포] → [새 배포]</b> → 유형 <b>웹 앱</b>, 실행 계정 <b>나</b>, 액세스 권한 <b>모든 사용자</b> → 배포 → 권한 승인.</li>
              <li>나온 <code>…/exec</code> 주소를 <em>Apps Script</em> 탭에 붙여 넣고 불러오기.</li>
            </ol>
            <p className="sub">이 방식은 가려진 이름·번호만 받기 때문에 결과 CSV에도 원본이 없어요. 대신 <b>원본행</b>(시트 행 번호)으로 시트에서 당첨자를 바로 찾을 수 있어요. 코드를 고친 뒤에는 [배포 관리]에서 새 버전으로 다시 배포해야 반영돼요.</p>
            <div className="code-box">
              <button className="btn ghost sm" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={16} />{copied ? '복사했어요' : '코드 복사'}</button>
              <pre><code>{code}</code></pre>
            </div>
          </section>

          <section id="guide-methods">
            <h3>4. 추첨 방식 고르기</h3>
            <div className="guide-methods">
              {METHODS.map(m => (
                <div key={m.id}><span className="method-icon sm" aria-hidden="true"><Icon name={m.icon} size={20} /></span><b>{m.name}</b><small>{m.fit}</small><p>{m.desc}</p></div>
              ))}
            </div>
            <ul>
              <li>당첨 인원을 넣으면 어울리는 방식에 <em>추천</em> 표시가 붙어요. 수백 명 대량 추첨은 <b>서바이벌</b>(항상 3단계)이 가장 빨라요.</li>
              <li><b>진행 방식</b>: <em>수동 추첨</em>은 진행자가 Space·클릭으로 한 명(한 단계)씩 공개하고, <em>일괄 추첨</em>은 누르지 않아도 한 명씩 차례로 자동 공개돼요. 일괄 추첨 중에는 Space로 일시정지·계속할 수 있어요.</li>
              <li>화면에는 가린 이름(홍*동)과 <b>추첨번호 = 휴대폰 뒷 4자리</b>만 크게 보여요. 로또 볼과 서바이벌 타일에도 이 번호가 적혀 있어 당첨 번호를 바로 알 수 있어요. (뒷자리가 같은 참가자가 있을 수 있으니 이름과 함께 확인하세요.)</li>
              <li><b>이전 차수 당첨자 제외</b>를 켜 두면 한 사람이 여러 번 당첨되지 않아요.</li>
              <li>당첨자는 추첨 버튼을 누르는 순간 확정돼요. 무대를 닫거나 새로고침해도 결과는 바뀌지 않아요.</li>
            </ul>
          </section>

          <section id="guide-stage">
            <h3>5. 무대 조작</h3>
            <div className="keys">
              <span><kbd>Space</kbd> / <kbd>→</kbd> / 클리커 수동: 다음 · 일괄: 일시정지·계속</span>
              <span><kbd>A</kbd> 남은 결과 한 번에 공개</span>
              <span><kbd>F</kbd> 전체 화면</span>
              <span><kbd>M</kbd> 소리 켜기·끄기</span>
              <span><kbd>Esc</kbd> 무대 닫기</span>
            </div>
            <p className="sub">빔프로젝터에 띄울 때는 <kbd>F</kbd>로 전체 화면을 켜고, 연출 속도를 <em>보통</em>으로 두면 긴장감이 살아요.</p>
          </section>

          <section id="guide-results">
            <h3>6. 결과 · 재추첨 · CSV</h3>
            <ul>
              <li>당첨자가 현장에 없으면 <em>불참 · 재추첨</em>으로 취소하고 1명을 새로 뽑아요. 취소 기록도 CSV에 남아요.</li>
              <li><em>당첨자 CSV 다운로드</em>는 모든 차수를 한 파일로 저장해요. 엑셀에서 한글이 깨지지 않게 UTF-8(BOM)로 저장해요.</li>
              <li>CSV·게시 시트로 불러왔다면 <em>원본 이름·번호 포함</em>을 켜서 경품 발송용 파일을 받을 수 있어요. 원본은 브라우저에 저장하지 않아서 새로고침하면 다시 불러와야 해요.</li>
              <li>행사가 끝나면 결과 화면 맨 아래 <em>모든 데이터 지우기</em>로 정리하세요.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
