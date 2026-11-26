/* ══════════════════════════════════════════════════════════════════════
   Agent Collab Studio
   피클(Lead) · 제미나이 태스크(실행) · 코덱스(검증)
   - API 키 없이 브라우저에서만 동작하는 결정론적 협업 엔진
   - 입력 문장에서 키워드·의도·제약을 분석해 과제별 협업 내용을 생성
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────── 1. 유틸 ─────────────────────────── */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const nowTime = () => {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  const dateLabel = (d) => {
    const x = d || new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  };
  const dateTimeLabel = (d) => {
    const x = d || new Date();
    return dateLabel(x) + ' ' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0');
  };
  function hash(str) {
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function josa(word, pair) {
    const s = String(word || '').trim().replace(/["'”’)\]]+$/, '');
    const last = s.charAt(s.length - 1);
    if (!last) return pair === '을' ? '를' : '';
    const code = last.charCodeAt(0);
    let jong = true;
    if (code >= 0xac00 && code <= 0xd7a3) jong = (code - 0xac00) % 28 !== 0;
    else if (/[0-9]/.test(last)) jong = ['0', '1', '3', '6', '7', '8'].indexOf(last) >= 0;
    else if (/[a-z]/i.test(last)) jong = ['a', 'e', 'i', 'o', 'u', 'w', 'y'].indexOf(last.toLowerCase()) < 0;
    switch (pair) {
      case '은': return jong ? '은' : '는';
      case '이': return jong ? '이' : '가';
      case '을': return jong ? '을' : '를';
      case '과': return jong ? '과' : '와';
      case '으로': return !jong || (code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8) ? '로' : '으로';
      default: return '';
    }
  }
  const cut = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  };
  const download = (filename, text, mime) => {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  /* ─────────────────────── 2. 도메인 지식 팩 ─────────────────────── */
  const PACKS = {
    dev: {
      label: '소프트웨어 개발',
      keys: ['앱', '웹', '사이트', '개발', '코드', 'api', '서버', '배포', '프로그램', '자동화', '봇', '크롤링', '깃허브', 'github', '리팩토링', '버그', '기능', '데이터베이스', 'db', '스크립트', '프론트', '백엔드', 'pwa', '랜딩', '페이지', '서비스'],
      deliverable: '직접 열어서 써 볼 수 있는 1차 버전',
      steps: [
        { name: '입력·화면·결과 3단 고정', detail: '"{kw}"에서 사용자가 넣는 값과 돌려받는 결과를 종이 한 장에 적고, 화면을 입력·진행·결과 세 덩어리로 나눕니다.', output: '입출력 정의표' },
        { name: '가장 얇은 핵심 경로 구현', detail: '로그인·결제·알림은 뒤로 미루고 "{kw}"의 한 줄기가 처음부터 끝까지 실제로 돌아가게 만듭니다.', output: '동작하는 한 줄기' },
        { name: '실패 경로 4종 재현', detail: '빈 입력, 중복 클릭, 네트워크 끊김, 권한 없음 — 네 가지를 직접 재현하고 오류 문구까지 정합니다.', output: '실패 경로 기록' },
        { name: '배포와 되돌리기 준비', detail: '한 번에 배포되는 상태로 만들고, 문제가 생기면 30분 안에 이전 버전으로 돌아가는 절차를 적어 둡니다.', output: '배포·롤백 절차' },
        { name: '첫 사용자 3명 시연', detail: '{audience}에게 3분 안에 무엇을 하는 도구인지 보이는지 확인하고, 막힌 지점을 그날 고칩니다.', output: '시연 피드백 3건' }
      ],
      risks: [
        { r: '무료 한도 소진(API 호출·빌드 시간)', i: '배포 직후 핵심 기능이 멈춤', m: '첫날 사용량을 실측하고 한도 80%에서 대체 경로로 전환', s: '429 응답·빌드 실패 알림' },
        { r: '부가 기능으로 범위 확장', i: '핵심 경로가 미완성인 채 시간 소진', m: '이번 판에서 만들지 않을 목록을 먼저 못 박기', s: '계획 밖 새 할 일이 추가됨' },
        { r: '실패 경로 미처리', i: '시연·첫 사용에서 오류로 신뢰 상실', m: '빈 입력·중복 클릭·오프라인을 테스트 항목으로 고정', s: '콘솔 에러가 남은 채 배포' }
      ],
      checks: ['핵심 경로를 처음부터 끝까지 직접 실행하고 화면을 캡처한다', '빈 입력·중복 클릭·오프라인에서 사용자 말로 된 안내가 나온다', '390px 화면에서 가로 스크롤이 생기지 않는다', '배포 주소와 되돌리기 절차를 README에 적는다', '다음 판으로 미룬 기능 목록을 남긴다'],
      kpis: ['핵심 경로 완주율', '첫 화면에서 첫 행동까지 걸린 시간', '오류 없이 끝난 실행 비율'],
      resources: ['무료 정적 호스팅(Cloudflare Pages 등)', '에디터 + Git 저장소 1개', '테스트용 샘플 데이터 3세트'],
      research: ['같은 문제를 푼 오픈소스 2개의 화면 구조만 비교한다', '무료 티어의 실제 한도(요청 수·빌드 시간)를 표로 정리한다', '타깃이 지금 쓰는 대체 도구 1개와 불편 지점 3개를 적는다'],
      critique: ['"만든다"만으로는 끝이 없습니다. "{kw}"에서 숫자로 확인할 지표를 하나 정해야 합니다.', '무료 도구를 3개 이상 엮으면 실패 지점도 3개가 됩니다. 연결 고리를 하나로 줄이세요.', '혼자 개발하면 리뷰가 없습니다. 배포 전 10분 셀프 리뷰를 일정에 넣으세요.'],
      quality: ['핵심 경로가 새로고침 뒤에도 유지된다', '오류 3종에 사용자 언어의 안내가 있다', '390px에서 가로 스크롤이 0이다']
    },
    content: {
      label: '콘텐츠·글쓰기',
      keys: ['블로그', '글', '포스팅', '원고', '뉴스레터', '콘텐츠', '작성', '쓰기', '발행', '구독자', '이웃', '카드뉴스', '유튜브', '스토리', '기사', '리뷰', '에세이'],
      deliverable: '발행 가능한 원고 1편과 재현 가능한 작성 순서',
      steps: [
        { name: '독자 한 명 정하기', detail: '"{kw}"{을} 읽을 사람을 한 명 정하고, 그가 지금 겪는 문제를 한 문장으로 적습니다. 기준은 {audience}입니다.', output: '독자 정의 1문장' },
        { name: '목차 5블록 고정', detail: '문제 제기 → 근거 → 방법 → 예시 → 오늘 할 행동. 블록마다 3문장 한도를 둡니다.', output: '목차 5블록' },
        { name: '초안 1편 완주', detail: '문장을 고치지 않고 분량을 먼저 채웁니다. 수치와 인용은 옆에 출처 링크를 붙입니다.', output: '초안 1편' },
        { name: '편집 2패스', detail: '1차 사실 확인, 2차 문장 다듬기. 제목은 마지막에 3안을 만들어 하나 고릅니다.', output: '편집본·제목 3안' },
        { name: '발행과 확산 경로', detail: '발행 후 요약 1개를 다른 채널에 올리고, 첫 댓글에 목차 링크를 답니다.', output: '발행 글·요약 1개' }
      ],
      risks: [
        { r: '주제를 넓히며 마감 초과', i: '한 편도 완성되지 않음', m: '이번 글에서 다루지 않을 질문 3개를 먼저 적어 제외', s: '목차가 6블록을 넘김' },
        { r: '근거 없는 수치·인용', i: '글 전체의 신뢰 손상', m: '모든 숫자에 출처 링크를 붙이고 없으면 문장 삭제', s: '출처 없는 숫자가 눈에 띔' },
        { r: '발행만 하고 확산 없음', i: '써도 읽히지 않음', m: '발행 당일 요약 1개를 다른 채널에 올리는 일을 일정에 고정', s: '발행 후 48시간 유입 0' }
      ],
      checks: ['독자를 한 문장으로 적었다', '목차 5블록이 있고 블록마다 3문장을 넘지 않는다', '출처 없는 수치·인용이 0개다', '제목 3안 중 하나를 골라 첫 3줄에 약속을 넣었다', '발행 후 요약 1개를 다른 채널에 올렸다', '다음 글 주제 1개를 메모했다'],
      kpis: ['끝까지 읽은 비율(스크롤 90%)', '첫 3줄 이탈률', '저장·공유 수'],
      resources: ['메모 도구 1개', '참고 자료 3개(경쟁 글 2 + 1차 자료 1)', '표·이미지 편집 도구'],
      research: ['같은 주제 상위 글 3개의 목차를 비교해 빈틈을 찾는다', '독자가 실제로 검색하는 질문 5개를 모은다', '인용할 1차 자료 2개를 확보한다'],
      critique: ['독자가 두 명 이상이면 문장이 흐려집니다. 한 명으로 좁히세요.', '근거 없는 단정이 한 곳만 있어도 글 전체의 신뢰가 깎입니다.', '분량 목표가 없으면 초안이 끝나지 않습니다. 편당 글자 수를 정하세요.'],
      quality: ['첫 3줄에 문제와 약속이 있다', '모든 수치·인용에 출처가 있다', '목차만 읽어도 주장이 이해된다']
    },
    marketing: {
      label: '마케팅·판매',
      keys: ['마케팅', '홍보', '판매', '광고', '구독', '유입', '전환', '노출', '고객', '상세페이지', '브랜딩', '캠페인', '인스타', 'sns', '매출', '수익화'],
      deliverable: '측정 가능한 실험 1개와 판정 기준',
      steps: [
        { name: '타깃과 제안을 한 문장으로', detail: '"누구의 어떤 문제를, 무엇으로, 얼마에" 순서로 "{kw}" 제안을 한 문장에 담습니다.', output: '제안 1문장' },
        { name: '채널 1개만 고르기', detail: '지금 이미 사람이 있는 채널 하나를 고르고 나머지는 이번 주에 열지 않습니다.', output: '채널 결정표' },
        { name: '첫 실험 설계', detail: '가설 → 실행 → 측정을 한 줄로 적습니다. 이번 실험에서 바꿀 것은 하나뿐입니다.', output: '실험 1건' },
        { name: '결과 판정', detail: '기준선 수치와 비교해 성공·실패를 먼저 정한 규칙으로 판정합니다.', output: '판정 기록' },
        { name: '확장 또는 중단', detail: '성공이면 예산·시간을 2배로, 실패면 채널을 바꿉니다. 두 길만 남깁니다.', output: '다음 2주 결정' }
      ],
      risks: [
        { r: '채널을 여러 개 동시에 여는 것', i: '측정이 불가능해 무엇이 효과 있었는지 모름', m: '이번 주 채널 1개, 나머지는 대기 목록에 적어 두기', s: '한 주에 새 채널 2개 이상 시작' },
        { r: '감으로 판단', i: '돈과 시간을 효과 없는 곳에 씀', m: '실험 전에 기준선과 성공 기준을 숫자로 적기', s: '판정 회의에서 기준선이 없음' },
        { r: '과장 카피', i: '환불·신뢰 문제로 되돌아옴', m: '숫자와 조건을 카피에 함께 표기', s: '클릭은 높은데 환불·이탈 증가' }
      ],
      checks: ['타깃·문제·제안이 한 문장에 있다', '이번 주 채널은 1개다', '가설과 성공 기준이 숫자로 적혀 있다', '기준선 수치를 실험 전에 기록했다', '판정 날짜와 판정자가 정해져 있다', '중단 기준을 미리 정했다'],
      kpis: ['클릭률', '전환율', '획득 비용'],
      resources: ['기존 채널 계정 1개', '랜딩 페이지 1장', '무료 측정 도구'],
      research: ['경쟁 제안 3개의 첫 문장과 가격 표기를 비교한다', '타깃이 실제로 쓰는 표현 10개를 모은다', '채널별 도달·비용을 표로 비교한다'],
      critique: ['타깃이 "모두"면 아무에게도 닿지 않습니다. 한 문장으로 좁히세요.', '실험을 두 개 이상 동시에 하면 결과를 해석할 수 없습니다.', '"전환"을 무엇으로 셀지 먼저 정하지 않으면 숫자가 거짓말을 합니다.'],
      quality: ['제안이 한 문장으로 설명된다', '성공·실패 기준이 실험 전에 정해져 있다', '카피의 숫자에 조건이 붙어 있다']
    },
    product: {
      label: '제품·서비스 기획',
      keys: ['기획', '제품', '서비스', 'mvp', '프로토타입', '사용자', '니즈', '요구사항', '출시', '런칭', '기능정의', '와이어'],
      deliverable: '검증 가능한 범위의 1차 버전과 판단 근거',
      steps: [
        { name: '문제를 한 문장으로', detail: '"{kw}"가 없애려는 불편을 사용자의 말로 적고, 해결책은 아직 쓰지 않습니다.', output: '문제 정의문' },
        { name: '사용자 시나리오 3개', detail: '처음·자주·실패 상황에서 사용자가 하는 행동을 순서대로 적습니다.', output: '시나리오 3개' },
        { name: 'MVP 범위 자르기', detail: '이번 판에 넣을 것 3개, 뺄 것 3개를 표로 확정합니다.', output: '범위표' },
        { name: '프로토타입 검증', detail: '클릭 가능한 수준으로 만들어 3명에게 보여주고 막힌 지점만 기록합니다.', output: '검증 기록' },
        { name: '출시 후 지표', detail: '첫 주에 볼 숫자 2개와 그 숫자가 나쁠 때의 조치를 정합니다.', output: '지표·조치표' }
      ],
      risks: [
        { r: '해결책부터 정하고 문제를 끼워 맞춤', i: '만들어도 쓰이지 않음', m: '문제 문장을 사용자 인터뷰 3건으로 확인한 뒤 진행', s: '문제 문장에 기능 이름이 들어감' },
        { r: '범위 미확정', i: '일정 지연과 품질 저하', m: '넣을 것/뺄 것 표를 문서로 고정', s: '회의마다 기능이 추가됨' },
        { r: '검증 없이 출시', i: '첫 주 이탈', m: '3명 프로토타입 테스트를 출시 조건으로', s: '테스트 인원 0명' }
      ],
      checks: ['문제 정의문에 기능 이름이 없다', '사용자 시나리오 3개가 있다', '넣을 것 3 / 뺄 것 3이 표로 고정됐다', '3명에게 프로토타입을 보여줬다', '출시 후 볼 지표 2개와 조치가 정해졌다'],
      kpis: ['과업 완료율', '첫 가치 도달까지 걸린 시간', '재방문율'],
      resources: ['프로토타입 도구 1개', '인터뷰 대상 3명', '기존 데이터·지원 문의 기록'],
      research: ['비슷한 서비스 3개의 첫 화면과 가격을 비교한다', '사용자 불편을 말한 실제 문의·후기 10건을 모은다', '경쟁사가 포기한 기능을 찾아 이유를 추정한다'],
      critique: ['문제 문장에 이미 해결책이 들어가 있으면 검증이 아니라 확신입니다.', '이번 판에 넣을 기능이 5개를 넘으면 1차 버전이 아닙니다.', '지표가 없으면 출시는 끝이 아니라 시작을 못 한 것입니다.'],
      quality: ['문제가 사용자 언어로 적혀 있다', '범위표가 한 장으로 설명된다', '출시 후 판단 기준이 숫자로 있다']
    },
    learn: {
      label: '학습·자기계발',
      keys: ['공부', '학습', '배우', '익히', '자격증', '시험', '독학', '강의', '연습', '영어', '코딩', '스터디', '커리큘럼'],
      deliverable: '매일 반복 가능한 학습 루틴과 진단 결과',
      steps: [
        { name: '현재 수준 진단', detail: '"{kw}"에서 지금 할 수 있는 것과 없는 것을 10분짜리 문제로 확인합니다.', output: '진단 결과 1장' },
        { name: '범위 자르기', detail: '시험·프로젝트처럼 끝이 보이는 목표 하나를 정하고 교재는 1권으로 줄입니다.', output: '학습 범위표' },
        { name: '매일 반복 블록', detail: '{audience} 기준으로 30~60분 블록을 같은 시간에 고정합니다. 새 내용 60%, 복습 40%.', output: '일일 루틴' },
        { name: '중간 검증', detail: '일주일에 한 번, 실제 문제나 발표로 실력을 확인하고 오답만 따로 모읍니다.', output: '오답 노트' },
        { name: '최종 확인과 다음 단계', detail: '목표 시험·산출물로 확인하고, 부족한 영역 2개를 다음 사이클로 넘깁니다.', output: '결과·다음 계획' }
      ],
      risks: [
        { r: '교재·강의를 계속 바꾸는 것', i: '진도가 쌓이지 않음', m: '한 사이클 동안 교재 1권 고정, 다른 자료는 메모만', s: '새 강의 결제·북마크 증가' },
        { r: '입력만 하고 출력이 없음', i: '시험·실전에서 꺼내지 못함', m: '배운 것을 매주 문제·발표로 출력', s: '복습 기록 0회' },
        { r: '의욕에 기대는 계획', i: '3일 만에 중단', m: '최소 블록을 10분으로 낮추고 시간·장소를 고정', s: '2일 연속 미실행' }
      ],
      checks: ['현재 수준을 문제로 확인했다', '교재는 1권, 목표는 1개다', '매일 같은 시간·같은 장소 블록이 정해졌다', '주 1회 출력(문제·발표)이 있다', '오답·부족 영역을 따로 모았다', '다음 사이클 목표 2개를 정했다'],
      kpis: ['주간 실천 일수', '모의 점수·정답률', '출력물 개수'],
      resources: ['교재 1권', '타이머·기록 앱', '주 1회 점검할 사람 또는 스터디'],
      research: ['목표 시험·직무의 실제 요구 수준을 기출·공고로 확인한다', '선행 학습자 2명의 루틴을 찾아 공통점만 뽑는다', '무료 강의·기출 자료의 우선순위를 정한다'],
      critique: ['자료를 모으는 시간이 공부 시간을 넘으면 준비가 아니라 회피입니다.', '진단 없이 시작하면 아는 것부터 다시 하게 됩니다.', '하루 블록이 2시간을 넘으면 첫 주에 무너집니다. 최소 블록을 먼저 정하세요.'],
      quality: ['매일 10분이라도 실행된다', '주 1회 출력 기록이 있다', '오답·부족 영역이 문서로 남는다']
    },
    career: {
      label: '커리어·이직',
      keys: ['이직', '취업', '면접', '포트폴리오', '이력서', '자소서', '커리어', '채용', '지원', '직무', '연봉'],
      deliverable: '지원 가능한 포트폴리오와 면접 답변 세트',
      steps: [
        { name: '목표 직무 3개 추리기', detail: '"{kw}"에서 실제로 지원할 직무 3개를 정하고, 공고 10개에서 공통 요구역량을 뽑습니다.', output: '직무·역량 표' },
        { name: '프로젝트 3개 재정리', detail: '문제 → 내 역할 → 결과 숫자 순서로 다시 씁니다. 결과가 없는 프로젝트는 뺍니다.', output: '포트폴리오 3건' },
        { name: '지원 묶음 만들기', detail: '이력서 1장 + 링크 1개 + 3문장 소개로 묶어 매주 같은 요일에 지원합니다.', output: '지원 패키지' },
        { name: '면접 답변 5개 고정', detail: '자기소개, 실패 경험, 갈등, 강점, 지원 동기를 90초 분량으로 말해 봅니다.', output: '답변 스크립트' },
        { name: '피드백 루프', detail: '탈락 사유를 3개로 분류해 다음 주 지원에 하나씩 반영합니다.', output: '피드백 기록' }
      ],
      risks: [
        { r: '결과 없는 서술', i: '서류 통과율 저하', m: '모든 프로젝트에 숫자 1개를 붙이고 없으면 역할·규모로 대체', s: '성과 문장에 숫자가 없음' },
        { r: '무한 준비', i: '지원 시점이 계속 밀림', m: '매주 정해진 요일에 지원하는 규칙', s: '2주 연속 지원 0건' },
        { r: '탈락 사유 미기록', i: '같은 실수 반복', m: '지원·면접마다 한 줄 회고', s: '지원 기록이 표로 남지 않음' }
      ],
      checks: ['목표 직무 3개와 공통 역량이 표로 정리됐다', '프로젝트 3개에 내 역할과 결과 숫자가 있다', '이력서 1장·링크 1개가 준비됐다', '면접 답변 5개를 90초로 말해 봤다', '지원 기록표에 결과와 사유가 쌓인다'],
      kpis: ['지원 건수', '서류 통과율', '면접 전환율'],
      resources: ['이력서·포트폴리오 1벌', '공고 10개', '모의 면접 1회'],
      research: ['목표 직무 공고 10개의 요구역량 빈도를 센다', '합격 후기 3개에서 공통 준비물을 뽑는다', '내 프로젝트와 요구역량의 간격을 표로 표시한다'],
      critique: ['지원할 직무가 3개를 넘으면 이력서 한 장으로 설명할 수 없습니다.', '"열심히 했다"는 성과가 아닙니다. 숫자나 규모로 바꾸세요.', '준비만 하다 시장이 닫힙니다. 지원을 먼저 시작하고 다듬으세요.'],
      quality: ['한 장으로 내 강점이 보인다', '모든 프로젝트에 숫자 또는 규모가 있다', '지원 기록이 매주 갱신된다']
    },
    finance: {
      label: '재무·생활관리',
      keys: ['예산', '절약', '지출', '수입', '저축', '재테크', '투자', '돈', '비용', '가계부', '구독료', '고정비'],
      deliverable: '현금 흐름표와 4주 실행 규칙',
      steps: [
        { name: '수입·지출 표 만들기', detail: '최근 1개월 계좌·카드 내역을 항목 8개 이하로 묶어 표로 만듭니다.', output: '현금 흐름표' },
        { name: '새는 항목 3개 찾기', detail: '금액이 아니라 반복성으로 봅니다. 구독·배달·충동 지출 중 3개만 고릅니다.', output: '누수 목록' },
        { name: '배분 비율 정하기', detail: '저축·고정비·변동비 비율을 정하고, 월급일 다음 날 자동이체를 겁니다.', output: '배분 규칙' },
        { name: '4주 실행', detail: '현금·체크카드 중심으로 쓰고 주 1회 10분 점검합니다.', output: '주간 점검 기록' },
        { name: '4주 후 재측정', detail: '줄어든 금액과 지킨 비율을 확인하고 규칙을 하나만 조정합니다.', output: '4주 결과표' }
      ],
      risks: [
        { r: '의지에 의존한 절약', i: '2주 만에 원상복구', m: '자동이체·한도 알림처럼 시스템으로 고정', s: '한도 알림 무시·현금 인출 증가' },
        { r: '고정비를 놓침', i: '작아 보이는 구독료가 누적', m: '정기결제 목록을 만들어 3개만 남기고 해지', s: '구독 항목이 5개 이상' },
        { r: '수입 변동 무시', i: '계획이 첫 달부터 어긋남', m: '최저 수입 기준으로 배분하고 초과분은 저축', s: '월말 마이너스' }
      ],
      checks: ['최근 1개월 내역이 항목 8개 이하로 정리됐다', '반복 지출 3개를 골라 줄이거나 해지했다', '저축 비율과 자동이체일이 정해졌다', '주 1회 10분 점검을 4번 했다', '4주 뒤 줄어든 금액을 숫자로 확인했다'],
      kpis: ['저축률', '변동지출 비중', '반복 결제 항목 수'],
      resources: ['최근 1개월 거래 내역', '가계부 앱 또는 스프레드시트', '자동이체·한도 알림'],
      research: ['내 고정비 상위 5개와 해지 조건을 확인한다', '비슷한 소득의 실제 지출 비율 사례 3개를 찾는다', '수수료·금리 조건을 비교해 1개만 남긴다'],
      critique: ['목표 금액 없이 "아끼자"는 계획은 판정이 불가능합니다.', '줄일 항목이 3개를 넘으면 지키지 못합니다. 가장 큰 3개만.', '수입이 변동적이면 평균이 아니라 최저 수입으로 계획하세요.'],
      quality: ['모든 지출이 항목에 들어간다', '자동이체로 저축이 먼저 빠진다', '4주 뒤 수치로 비교할 수 있다']
    },
    health: {
      label: '건강·운동',
      keys: ['운동', '헬스', '러닝', '달리기', '건강', '식단', '체중', '다이어트', '수면', '스트레칭', '근력', '요가'],
      deliverable: '4주 지속 가능한 최소 루틴',
      steps: [
        { name: '현재 상태 기록', detail: '1주 동안 수면·활동·몸 상태를 하루 1줄로 적어 기준선을 만듭니다.', output: '기준선 기록' },
        { name: '최소 루틴 정하기', detail: '"{kw}"에서 가장 작은 단위(예: 15분, 주 2회)를 정합니다. 의욕이 아니라 시간표에 맞춥니다.', output: '주간 루틴표' },
        { name: '고정 시간 3회', detail: '요일·시간·장소를 정해 3회를 달력에 먼저 넣습니다.', output: '캘린더 블록' },
        { name: '몸 신호 점검', detail: '통증·피로·수면을 보고 강도를 올릴지 유지할지 판단합니다.', output: '주간 점검' },
        { name: '4주 후 측정', detail: '같은 조건에서 기록을 다시 재고, 루틴을 유지·증량·교체합니다.', output: '4주 비교표' }
      ],
      risks: [
        { r: '첫 주에 과하게 시작', i: '부상·중단', m: '첫 2주는 최소 강도로 고정, 증량은 3주째부터', s: '통증 2일 이상 지속' },
        { r: '시간표 없는 계획', i: '"내일"이 반복', m: '요일·시간·장소를 캘린더에 고정', s: '주 1회도 못 지킴' },
        { r: '기록 없는 진행', i: '효과 판단 불가', m: '하루 1줄 기록을 루틴의 일부로', s: '기록이 3일 비어 있음' }
      ],
      checks: ['1주 기준선 기록이 있다', '최소 루틴이 30분 이내다', '요일·시간·장소가 캘린더에 들어갔다', '주 3회를 실제로 했다', '통증·피로 신호를 확인했다', '4주 뒤 같은 조건에서 비교했다'],
      kpis: ['주간 실천 횟수', '연속 주수', '수면·컨디션 점수'],
      resources: ['운동화·복장', '기록 앱 또는 종이', '동네 코스·헬스장 정보'],
      research: ['내 수준에 맞는 초보 루틴 3개를 비교한다', '동네 시설의 운영 시간·요금을 확인한다', '부상 예방을 위한 준비운동 5개를 정리한다'],
      critique: ['의욕으로 시작한 계획은 2주를 못 넘깁니다. 시간표가 먼저입니다.', '강도를 빨리 올리면 부상으로 한 달을 잃습니다.', '기록이 없으면 좋아지는지 알 수 없습니다.'],
      quality: ['주 3회를 4주간 지킬 수 있다', '통증 신호를 확인한다', '같은 조건으로 비교할 기록이 있다']
    },
    travel: {
      label: '여행·일정',
      keys: ['여행', '출장', '숙소', '항공', '비행기', '일정', '코스', '관광', '예약', '숙박'],
      deliverable: '예약이 끝난 동선표와 예비 계획',
      steps: [
        { name: '날짜·예산 고정', detail: '가는 날·오는 날·총예산을 먼저 못 박습니다. 이후 결정은 이 두 값 안에서 합니다.', output: '일정·예산표' },
        { name: '동선 3구간 나누기', detail: '도착·중심·출발 세 구간으로 나눠 하루 이동을 1회 이하로 줄입니다.', output: '동선 초안' },
        { name: '예약 우선순위', detail: '숙소 → 이동 → 필요한 예약 순으로 확정하고 취소 조건을 기록합니다.', output: '예약 목록' },
        { name: '예비 계획', detail: '비·지연·휴무에 대비한 대체 1곳과 연락처를 적습니다.', output: '플랜B' },
        { name: '출발 전 체크', detail: '서류·결제·짐을 전날 한 번에 확인합니다.', output: '출발 체크리스트' }
      ],
      risks: [
        { r: '예약 조건 미확인', i: '취소·변경 수수료', m: '취소 기한과 결제 통화를 예약 직후 캡처', s: '확인 메일을 안 읽음' },
        { r: '과밀 일정', i: '이동에 시간 소진', m: '하루 주요 일정 2개로 제한', s: '하루 이동 3회 이상' },
        { r: '현지 휴무·날씨', i: '계획한 곳에 못 감', m: '대체 1곳과 운영 시간을 미리 확인', s: '방문 전날 확인 안 함' }
      ],
      checks: ['날짜·예산이 숫자로 정해졌다', '숙소·이동 예약과 취소 조건을 확인했다', '하루 주요 일정이 2개 이하다', '대체 계획 1곳과 연락처가 있다', '서류·결제 수단을 전날 확인했다'],
      kpis: ['예약 완료율', '하루 이동 시간', '예산 대비 지출'],
      resources: ['예약 확인 메일', '지도·교통 앱', '여권/신분증 사본'],
      research: ['숙소 3곳의 위치·취소 조건을 비교한다', '이동 구간의 소요 시간과 막차를 확인한다', '방문지 운영 시간·휴무일을 확인한다'],
      critique: ['일정이 촘촘할수록 여행 만족도는 떨어집니다. 하루 2개로 줄이세요.', '취소 조건을 안 읽으면 예약이 비용이 됩니다.', '이동 시간을 빼고 계획하면 첫날부터 어긋납니다.'],
      quality: ['예약이 모두 확정됐다', '하루 이동이 1시간 안쪽이다', '대체 계획이 있다']
    },
    event: {
      label: '행사·모임',
      keys: ['행사', '모임', '파티', '클럽', '워크숍', '세미나', '축제', '동아리', '정기모임', '참석', '멤버', '회원', '참여자', '운영진'],
      deliverable: '진행표와 역할 분담이 끝난 운영 계획',
      steps: [
        { name: '목적·인원 확정', detail: '"{kw}"의 목적을 한 문장으로, 인원을 최소·최대로 정합니다.', output: '목적·인원표' },
        { name: '장소·시간 고정', detail: '인원이 바뀌어도 견디는 장소를 고르고 취소 조건을 확인합니다.', output: '장소 확정' },
        { name: '진행표 만들기', detail: '시작·본론·마무리 3구간으로 나누고 각 20분 단위로 적습니다.', output: '타임테이블' },
        { name: '초대·안내', detail: '초대 메시지에 무엇을·언제·어디서·무엇을 준비할지 4가지를 넣습니다.', output: '안내 메시지' },
        { name: '당일 역할 분담', detail: '접수·진행·정리 3개 역할을 정하고 연락 방법을 공유합니다.', output: '역할표' }
      ],
      risks: [
        { r: '인원 미확정', i: '장소·준비물이 어긋남', m: '최소 인원 기준으로 준비하고 신청 마감일을 정함', s: '마감일 없이 계속 모집' },
        { r: '진행표 없이 시작', i: '시간 초과·분위기 이탈', m: '20분 단위 진행표와 진행자 1명', s: '당일 순서를 즉석에서 정함' },
        { r: '역할 미분담', i: '한 사람에게 일이 몰림', m: '접수·진행·정리 3역할을 사전 지정', s: '당일 "누가 해요?" 발생' }
      ],
      checks: ['목적이 한 문장으로 정리됐다', '장소·시간과 취소 조건이 확정됐다', '20분 단위 진행표가 있다', '안내 메시지에 4가지가 들어 있다', '역할 3개가 정해졌다'],
      kpis: ['참석률', '재참여 의향', '준비 소요 시간'],
      resources: ['장소 예약 정보', '참석자 명단', '준비물·정리 담당'],
      research: ['비슷한 모임 2개의 진행 방식을 참고한다', '장소의 수용 인원·취소 규정을 확인한다', '참석자에게 한 번에 물을 질문 2개를 정한다'],
      critique: ['목적이 없으면 모임은 사람이 모이는 것으로 끝납니다.', '진행표가 없으면 30분이 90분이 됩니다.', '역할을 정하지 않으면 운영자가 지칩니다.'],
      quality: ['목적과 인원이 한 장에 있다', '진행표대로 시간이 지켜진다', '역할이 문서로 공유됐다']
    },
    general: {
      label: '일반 과제',
      keys: [],
      deliverable: '다시 실행할 수 있는 결과물 1개',
      steps: [
        { name: '원하는 결과를 한 문장으로', detail: '"{kw}"에서 무엇이 어떻게 달라지면 끝인지 한 문장으로 적고, 하지 않을 일 2개를 함께 적습니다.', output: '결과 정의문' },
        { name: '지금 상태 측정', detail: '출발점을 숫자나 사례 3개로 기록합니다. 없으면 오늘 기준으로 만듭니다.', output: '기준선 기록' },
        { name: '가장 작은 첫 실행', detail: '한 번에 끝낼 수 있는 크기로 잘라 오늘 안에 하나를 끝냅니다.', output: '첫 실행 결과' },
        { name: '결과 보고 조정', detail: '한 번 해 본 뒤 남길 것·버릴 것을 정해 계획을 한 번만 고칩니다.', output: '조정 기록' },
        { name: '재현 가능하게 정리', detail: '다른 사람이 따라 할 수 있게 순서·도구·주의점을 한 장으로 남깁니다.', output: '실행 문서 1장' }
      ],
      risks: [
        { r: '범위가 문장으로 고정되지 않음', i: '끝없이 늘어남', m: '하지 않을 일 2개를 함께 적기', s: '새 요구가 계속 추가됨' },
        { r: '기준선 없이 시작', i: '나아졌는지 판단 불가', m: '시작 전 숫자·사례 3개 기록', s: '결과를 말로만 설명' },
        { r: '큰 단위로 시작', i: '첫날 손을 못 댐', m: '30분 안에 끝나는 첫 실행으로 자르기', s: '시작 전 준비만 반복' }
      ],
      checks: ['끝났을 때의 상태를 한 문장으로 적었다', '하지 않을 일 2개를 정했다', '시작 전 기준선을 기록했다', '오늘 안에 끝낼 첫 실행을 하나 완료했다', '결과를 보고 계획을 한 번만 조정했다', '다른 사람이 따라 할 수 있는 문서가 있다'],
      kpis: ['첫 실행까지 걸린 시간', '끝까지 완료한 비율', '재작업 횟수'],
      resources: ['기록 도구 1개', '참고 사례 2개', '점검할 사람 1명'],
      research: ['비슷한 과제를 해 본 사례 2개를 찾아 순서만 비교한다', '필요한 도구·비용을 먼저 확인한다', '실패한 사례에서 공통 원인 1개를 뽑는다'],
      critique: ['"잘 하고 싶다"는 목표가 아닙니다. 끝났을 때 무엇이 보일지 적으세요.', '범위를 정하지 않으면 준비만 하다 끝납니다.', '혼자 판단하면 같은 실수를 반복합니다. 점검할 사람을 한 명 정하세요.'],
      quality: ['결과를 한 문장으로 설명할 수 있다', '시작 전 기준선과 비교할 수 있다', '다른 사람이 같은 순서로 재현할 수 있다']
    }
  };

  const INTENTS = [
    { id: 'career', label: '커리어', re: /이직|취업|면접|포트폴리오|이력서|자소서|채용|직무/ },
    { id: 'learn', label: '학습', re: /배우|공부|학습|익히|자격증|독학|시험|연습/ },
    { id: 'research', label: '조사·분석', re: /조사|분석|리서치|알아보|비교|벤치마크|탐색|검토/ },
    { id: 'promote', label: '확산·판매', re: /홍보|마케팅|판매|구독|유입|노출|광고|수익|매출|전환/ },
    { id: 'write', label: '집필·발행', re: /글|포스팅|원고|콘텐츠|작성|쓰기|뉴스레터|블로그|발행/ },
    { id: 'improve', label: '개선', re: /개선|최적화|고도화|리팩토링|보완|고치|강화|줄이|늘리|정리/ },
    { id: 'build', label: '구축', re: /만들|제작|구축|개발|출시|런칭|세팅|구현|자동화|운영/ },
    { id: 'decide', label: '비교·결정', re: /선택|결정|고르|어디|무엇을|어떤/ },
    { id: 'plan', label: '계획·실행', re: /계획|일정|로드맵|준비|관리|점검/ }
  ];

  /* ───────────────────────── 3. 과제 분석 ───────────────────────── */
  const STOP = new Set(('그리고 그러나 하지만 그래서 그러면 위해 위한 관한 대한 통해 통한 하는 하고 해서 한다 했다 합니다 입니다 입니다 해주세요 해줘 주세요 싶다 싶어요 있는 없는 같은 것이 것을 수 등 및 더 좀 정말 아주 매우 우리 저희 나의 제가 내가 이것 저것 그것 때 경우 때문에 또한 또는 그리고 또 이나 에서 에게 으로 부터 까지 보다 처럼 만큼 이라는 라는 이라고 라고 들을 들이 들은 들도 있다 없다 되다 된다 됩니다 입니다 이다 아니다 그리고 혹은 및 등등 약 정도 그냥 바로 모두 각각 서로 다시 먼저 나중 지금 오늘 내일 어제 이번 다음 지난 매일 하루 일주 한달 일년 첫번째 두번째 세번째 하나 둘 셋 넷 위한 위하여 통해 대하어 관한 관해 정도쯤 안에 이내 이후 이전 동안 기준 관련 예정 목표치').split(/\s+/));
  const PART_LONG = ['으로서', '으로써', '에서는', '에게서', '이라고', '이라고는', '에서도', '에게도', '으로는', '로부터', '까지는', '부터는', '처럼은'];
  const PART_MID = ['에서', '에게', '으로', '부터', '까지', '보다', '처럼', '만큼', '이나', '한테', '께서', '라고', '라는', '하며', '이며', '지만', '면서', '하고', '들의', '들을', '들이', '들은', '이다', '라고'];
  const PART_ONE = ['이', '가', '은', '는', '을', '를', '의', '에', '와', '과', '도', '로', '만'];
  const NOUN_KEEP = new Set(['결과', '평가', '시도', '정도', '속도', '태도', '제도', '각도', '온도', '밀도', '농도', '강도', '빈도', '한도', '기도', '구도', '년도', '연도', '용도', '국가', '물가', '사과', '효과', '피해', '이해', '자세', '관계', '차이']);

  function stripParticle(tok) {
    let t = tok;
    for (const p of PART_LONG) if (t.length > p.length + 1 && t.endsWith(p)) return t.slice(0, -p.length);
    for (const p of PART_MID) if (t.length > p.length + 1 && t.endsWith(p)) return t.slice(0, -p.length);
    if (t.length >= 3 && !NOUN_KEEP.has(t) && t.charAt(t.length - 1) !== '이' && PART_ONE.indexOf(t.charAt(t.length - 1)) >= 0) {
      const cut1 = t.slice(0, -1);
      if (cut1.length >= 1) return cut1;
    }
    return t;
  }

  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^0-9a-z가-힣+#_\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function keywordsOf(input, limit) {
    const counts = new Map();
    const bump = (text, weight) => {
      tokenize(text).forEach((raw) => {
        const t = stripParticle(raw);
        if (!t || t.length < 2 || t.length > 14) return;
        if (STOP.has(t)) return;
        if (/^[0-9]/.test(t) && t.length <= 4) return;
        if (/(하다|한다|했다|하는|하여|되다|된다|되는|있는|없는|같은|싶은|해야|합니다|입니다|해요|이며|하며|지만|면서|라고|라는)$/.test(t) && t.length > 3) return;
        if (/[가-힣]하$/.test(t) && t.length >= 3) return;
        if (/다$/.test(t) && t.length >= 3) return;
        counts.set(t, (counts.get(t) || 0) + weight + Math.min(t.length, 7) * 0.08);
      });
    };
    bump(input.title, 3);
    bump(input.goal, 2.1);
    bump(input.context, 1.4);
    const PLATFORM = ['네이버', '구글', '유튜브', '인스타', '인스타그램', '카카오', '페이스북', '트위터', '틱톡', '쿠팡', '당근', '스레드', '링크드인', '깃허브', 'github', 'notion', '노션'];
    counts.forEach((v, k) => { if (PLATFORM.indexOf(k) >= 0) counts.set(k, v * 0.5); });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .map((e) => e[0])
      .slice(0, limit || 6);
  }

  function detectDomain(input) {
    const t = String(input.title || '').toLowerCase();
    const g = String(input.goal || '').toLowerCase();
    const c = String(input.context || '').toLowerCase();
    let best = { id: 'general', score: 0 };
    Object.keys(PACKS).forEach((id) => {
      const pack = PACKS[id];
      if (!pack.keys.length) return;
      let score = 0;
      pack.keys.forEach((k) => {
        if (t.indexOf(k) >= 0) score += 3;
        if (g.indexOf(k) >= 0) score += 2;
        if (c.indexOf(k) >= 0) score += 1;
      });
      if (score > best.score) best = { id, score };
    });
    return best.score >= 2.5 ? best.id : 'general';
  }

  function detectIntent(input) {
    const t = String(input.title || '');
    const g = String(input.goal || '');
    let best = { id: 'plan', label: '계획·실행', score: 0 };
    INTENTS.forEach((it) => {
      let score = 0;
      if (it.re.test(t)) score += 2;
      if (it.re.test(g)) score += 1;
      if (score > best.score) best = { id: it.id, label: it.label, score };
    });
    return best;
  }

  const KO_NUM = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 십: 10 };
  function detectDeadline(text) {
    const s = String(text || '');
    let m = s.match(/(\d+|한|두|세|네|다섯|여섯|일|이|삼|사|오)\s*(일|주일|주|개월|달|년)\s*(안|이내|내|뒤|후|까지)?/);
    if (m) {
      const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : (KO_NUM[m[1]] || 1);
      const unit = m[2];
      let days = unit === '일' ? n : unit === '주' || unit === '주일' ? n * 7 : unit === '개월' || unit === '달' ? n * 30 : n * 365;
      const label = String(n) + unit.replace('주일', '주');
      return { days: clamp(days, 1, 365), label: label.trim(), n: n, unit: unit };
    }
    if (/이번\s*주|이번주/.test(s)) return { days: Math.max(1, 7 - new Date().getDay()), label: '이번 주', n: 1, unit: '주' };
    if (/다음\s*주|다음주/.test(s)) return { days: 14, label: '다음 주', n: 1, unit: '주' };
    if (/이번\s*달|이번달/.test(s)) return { days: 30, label: '이번 달', n: 1, unit: '달' };
    if (/내일/.test(s)) return { days: 1, label: '내일', n: 1, unit: '일' };
    if (/주말/.test(s)) return { days: 3, label: '이번 주말', n: 1, unit: '주' };
    return null;
  }

  function detectConstraints(input) {
    const s = (String(input.goal || '') + ' ' + String(input.context || '') + ' ' + String(input.title || '')).toLowerCase();
    const out = [];
    const add = (type, label) => { if (!out.some((x) => x.type === type && x.label === label)) out.push({ type, label }); };

    const dl = detectDeadline(s);
    if (dl) add('time', dl.label);

    if (/(무료|0\s*원|제로|예산\s*(이)?\s*(없|0)|비용\s*없|돈\s*안|저예산)/.test(s)) add('budget', '예산 0원');
    else {
      const b = s.match(/([0-9,]+(?:\.[0-9]+)?)\s*만?\s*원/);
      if (b) add('budget', '예산 ' + b[1].replace(/,/g, '') + (b[0].indexOf('만') >= 0 ? '만원' : '원'));
    }
    if (/혼자|1인|개인\s*프로젝트|싱글/.test(s)) add('people', '혼자 진행');
    else {
      const people = [];
      const re = /([0-9]+)\s*명/g;
      let m2;
      while ((m2 = re.exec(s)) !== null) {
        const before = s.slice(Math.max(0, m2.index - 10), m2.index);
        if (/유입|방문|조회|구독|팔로|하루|매일|일일|누적|목표|전체/.test(before)) continue;
        people.push(m2[1] + '명');
      }
      people.slice(0, 2).forEach((v) => add('people', v));
    }
    if (/api\s*키\s*없|키\s*없|노코드|서버\s*없|오프라인|무료\s*도구|api\s*없/.test(s)) add('tool', '무료 도구·API 키 없이');
    if (/초보|입문|처음|왕초보/.test(s)) add('level', '초보자 대상');
    if (/직장인|회사원|퇴근/.test(s)) add('level', '직장인');
    if (/학생|대학생/.test(s)) add('level', '학생');
    if (/평일|주말|저녁|아침|하루\s*[0-9한두세]\s*시간/.test(s)) {
      const h = s.match(/하루\s*([0-9]+)\s*시간/);
      add('timeuse', h ? '하루 ' + h[1] + '시간' : (/주말/.test(s) ? '주말 활용' : '평일 저녁'));
    }
    if (/금지|하지\s*말|안\s*되|없이\s*만|무조건\s*피/.test(s)) add('rule', '금지 조건 있음');
    if (/초안|빠르게|먼저|우선/.test(s)) add('pace', '속도 우선');
    return out;
  }

  function detectAudience(input) {
    const s = String(input.goal || '') + ' ' + String(input.context || '') + ' ' + String(input.title || '');
    const m = s.match(/(초보자|입문자|왕초보|1인\s*개발자|개발자|직장인|학생|대학생|주부|구독자|고객|채용\s*담당자|투자자|동네\s*주민|부모|소상공인|크리에이터)/);
    if (m) return m[1].replace(/\s+/g, ' ');
    return '처음 접하는 사용자';
  }

  function buildSteps(pack, p) {
    const days = p.deadline ? p.deadline.days : 14;
    const weights = [0.15, 0.2, 0.3, 0.2, 0.15];
    let acc = 0;
    const owners = ['피클', '제미나이 태스크', '제미나이 태스크', '코덱스', '사용자 + 피클'];
    return pack.steps.map((s, i) => {
      const start = Math.round(acc * days) + 1;
      acc += weights[i];
      const end = Math.max(start, Math.min(days, Math.round(acc * days)));
      return {
        name: s.name,
        detail: fill(s.detail, p),
        output: s.output,
        owner: owners[i],
        when: rangeLabel(start, end, days),
        dayStart: start,
        dayEnd: end
      };
    });
  }

  function rangeLabel(s, e, days) {
    if (days <= 10) return s === e ? s + '일차' : s + '~' + e + '일차';
    const w1 = Math.ceil(s / 7);
    const w2 = Math.max(w1, Math.ceil(e / 7));
    return w1 === w2 ? w1 + '주차' : w1 + '~' + w2 + '주차';
  }

  function fill(tpl, p) {
    return String(tpl)
      .replace(/\{kw3\}/g, esc(p.keywords[2] || p.keywords[0] || '과제'))
      .replace(/\{kw2\}/g, esc(p.keywords[1] || p.keywords[0] || '목표'))
      .replace(/\{kw\}/g, esc(p.keywords[0] || '핵심 결과'))
      .replace(/\{audience\}/g, esc(p.audience))
      .replace(/\{deadline\}/g, esc(p.deadline ? p.deadline.label : '정한 기간'))
      .replace(/\{title\}/g, esc(p.title));
  }

  /* 제목 뒤에 목표 문장이 그대로 붙어 들어온 경우 제목만 남긴다.
     (예: "포모도로 집중 타이머 & 오늘 할 일25분 집중 / 5분 휴식…" → "포모도로 집중 타이머 & 오늘 할 일") */
  function cleanTitleText(title, goal) {
    let t = String(title || '').replace(/\s+/g, ' ').trim();
    const g = String(goal || '').replace(/\s+/g, ' ').trim();
    if (!t || !g) return t;
    if (t.length > g.length && t.endsWith(g)) t = t.slice(0, t.length - g.length).trim();
    if (g.length >= 12) {
      const head = g.slice(0, Math.min(28, g.length));
      if (t.length > head.length && t.endsWith(head)) t = t.slice(0, t.length - head.length).replace(/[\s:·\-–—,]+$/, '').trim();
    }
    return t || String(title || '').trim();
  }

  function analyzeMission(input) {
    const raw = {
      title: cleanTitleText(String((input && input.title) || '').trim() || '새 과제', String((input && input.goal) || '').trim()) || '새 과제',
      goal: String((input && input.goal) || '').trim(),
      context: String((input && input.context) || '').trim()
    };
    const domainId = detectDomain(raw);
    const pack = PACKS[domainId] || PACKS.general;
    const intent = detectIntent(raw);
    const keywords = keywordsOf(raw, 6);
    const constraints = detectConstraints(raw);
    const deadline = detectDeadline(raw.goal + ' ' + raw.context + ' ' + raw.title);
    const hasNumber = /[0-9]/.test(raw.goal) || /[0-9]+\s*(명|건|개|편|%|배|회|원|시간|일|주)/.test(raw.goal + ' ' + raw.context);
    const audience = detectAudience(raw);

    const p = {
      title: raw.title,
      goal: raw.goal || (raw.title + '의 목표를 정하고 실행 계획을 세운다'),
      context: raw.context,
      keywords: keywords.length ? keywords : ['핵심 결과', '실행', '검증'],
      domain: domainId,
      domainLabel: pack.label,
      intent: intent.id,
      intentLabel: intent.label,
      audience,
      deadline,
      constraints,
      measurable: hasNumber,
      deliverable: pack.deliverable,
      extraChecks: [],
      extraRisks: [],
      hoursPerDay: (function () {
        const m = (raw.goal + ' ' + raw.context).match(/하루\s*([0-9]+(?:\.[0-9]+)?)\s*시간/);
        if (m) return clamp(parseFloat(m[1]), 0.3, 8);
        if (/주말/.test(raw.context + raw.goal)) return 1.2;
        if (/평일|저녁|퇴근/.test(raw.context + raw.goal)) return 1;
        return 1.5;
      })()
    };
    p.kw = p.keywords;
    p.plan = p.deadline && p.deadline.days > 14 ? 'B' : 'A';
    p.goalShort = cut(p.goal, 96);
    p.steps = buildSteps(pack, p);
    p.criteria = successCriteria(p, pack);
    p.risks = buildRisks(p, pack);
    p.checks = buildChecks(p, pack);
    p.kpis = pack.kpis.slice();
    p.resources = pack.resources.slice();
    p.research = pack.research.map((r) => fill(r, p));
    p.critique = buildCritique(p, pack);
    p.quality = pack.quality.slice();
    p.pack = pack;
    return p;
  }

  function successCriteria(p, pack) {
    const k = p.keywords;
    const when = p.deadline ? p.deadline.label : '정한 기간';
    const c1 = p.deliverable + josa(p.deliverable, '이') + ' ' + when + ' 안에 손에 남는다';
    const c2 = p.measurable
      ? '목표에 적은 숫자를 결과물에서 확인한다 (' + cut(p.goal, 46) + ')'
      : '숫자로 확인할 1차 지표를 정하고 결과물에서 측정한다 — "' + (k[0] || '핵심') + '" 기준';
    const c3 = p.constraints.length
      ? '제약을 하나도 깨지 않는다 (' + p.constraints.slice(0, 2).map((c) => c.label).join(', ') + ')'
      : '결과물을 다른 사람이 설명 없이 다시 만들 수 있다';
    return [c1, c2, c3];
  }

  function buildRisks(p, pack) {
    const list = pack.risks.map((r) => ({ r: fill(r.r, p), i: r.i, m: r.m, s: r.s }));
    if (p.deadline && p.deadline.days <= 10) {
      list.unshift({
        r: p.deadline.label + ' 안에 5단계는 과밀',
        i: '핵심 경로를 끝내지 못한 채 마감',
        m: '4단계를 이번 판에서 빼고 1·2·3단계만 완주',
        s: '1주차에 2단계를 넘지 못함'
      });
    }
    if (p.constraints.some((c) => c.type === 'budget')) {
      list.push({
        r: '0원 조건의 숨은 비용',
        i: '무료 한도에서 막혀 중간에 멈춤',
        m: '첫날 무료 한도를 실측하고 80%에서 대체 수단으로 전환',
        s: '한도 안내 메일·429 오류'
      });
    }
    if (!p.measurable) {
      list.push({
        r: '성과 판정 기준 없음',
        i: '끝나도 잘된 것인지 판단 불가',
        m: '"' + (p.keywords[0] || '핵심') + '" 기준 지표 1개를 오늘 정함',
        s: '결과 보고가 "잘 된 것 같다"로 끝남'
      });
    }
    p.constraints.filter((c) => c.type === 'rule').forEach((c) => {
      list.push({ r: '금지 조건 위반', i: '결과물 사용 불가', m: '체크리스트 맨 위에 금지 조건을 고정', s: '검토 때 금지 조건이 처음 언급됨' });
    });
    return list.slice(0, 5);
  }

  function buildChecks(p, pack) {
    const list = pack.checks.map((c) => fill(c, p));
    list.unshift('범위표에 "' + (p.keywords[0] || '핵심') + '"의 완료 조건을 한 문장으로 적었다');
    if (p.deadline) list.push(p.deadline.label + ' 안에 끝낼 수 있도록 이번 주 할 일을 3개로 줄였다');
    if (p.constraints.some((c) => c.type === 'budget')) list.push('무료 한도(요청 수·저장 공간·발송 수)를 숫자로 확인했다');
    p.extraChecks.forEach((c) => list.push(c));
    return Array.from(new Set(list)).slice(0, 9);
  }

  function buildCritique(p, pack) {
    const out = [];
    const k = p.keywords;
    if (!p.measurable) {
      out.push({ t: '성공이 숫자로 정의되지 않았습니다', d: '목표 문장에 측정값이 없습니다. "' + (k[0] || '핵심') + '" 기준으로 무엇이 얼마나 바뀌어야 하는지 1개만 정하세요. 이게 없으면 마지막에 "잘 된 것 같다"로 끝납니다.' });
    } else {
      out.push({ t: '숫자는 있지만 기준선이 없습니다', d: '목표의 숫자를 지금 값과 비교할 수 있게 오늘 기준선을 적어 두세요. 기준선 없는 목표는 달성 여부를 말할 수 없습니다.' });
    }
    if (p.deadline && p.deadline.days <= 10) {
      out.push({ t: '기간 대비 단계가 많습니다', d: p.deadline.label + ' 안에 5단계는 과밀합니다. 4단계("' + p.steps[3].name + '")를 이번 판에서 빼고 1·2·3단계만 완주하는 A안을 권합니다.' });
    } else {
      out.push({ t: '단계 간 의존성이 검증되지 않았습니다', d: '2단계 결과가 3단계 입력으로 그대로 쓰입니다. 2단계 산출물("' + p.steps[1].output + '")을 먼저 만들고 3단계를 시작하세요.' });
    }
    if (p.constraints.length) {
      out.push({ t: '제약이 계획에 숫자로 반영되지 않았습니다', d: '제약은 "' + p.constraints.map((c) => c.label).slice(0, 2).join(', ') + '"입니다. 이 조건에서 하루에 실제로 쓸 수 있는 시간을 계산해 단계별 시간 상자를 다시 잡아야 합니다.' });
    }
    pack.critique.forEach((c) => out.push({ t: '도메인 점검', d: fill(c, p) }));
    return out.slice(0, 4);
  }

  /* ─────────────────────── 4. 협업 턴 생성 ─────────────────────── */
  const TURN_TOTAL = 10;
  const STAGE_NAMES = ['미션 브리핑', '과제 분해', '심층 검증', '중간 조율', '수정 실행안', '품질 게이트', '산출물 작성', '실행 체크리스트', '최종 검증', '최종 종합'];

  /* ─────────── 4-0. 에이전트 카탈로그 (agents-catalog.json 원본) ───────────
     가이드 26개 항목과 팀 투입 역할 정의는 agents-catalog.json 이 원본이고,
     브라우저에서 파일 하나로도 열리도록 scripts/catalog.mjs 가 agents-catalog.js 사본을 만든다. */
  const CATALOG = (window.ACS_CATALOG && typeof window.ACS_CATALOG === 'object') ? window.ACS_CATALOG : { tools: [], roles: [], core: [] };
  const ROLES = (CATALOG.roles || []).slice();
  const TOOLS = (CATALOG.tools || []).slice();
  const roleById = (id) => ROLES.find((r) => r.id === id) || null;
  const toolById = (id) => TOOLS.find((t) => t.id === id || t.agentId === id) || null;
  const GUIDE = TOOLS;
  const INJECTABLE = TOOLS.filter((t) => t.injectable);

  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return 'rgba(96,165,250,' + a + ')';
    const n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  const CORE_AGENTS = [
    { id: 'pickle', guideId: 'pickle', name: '피클', initial: '피', role: 'LEAD', roleKo: '총괄', sub: '오케스트레이터 · 최종 결과물 도출', color: '#5eead4', soft: 'rgba(94,234,212,.13)', bg: 'linear-gradient(135deg,#5eead4,#2dd4bf)', fixed: true, roleId: 'lead' },
    { id: 'gemini', guideId: 'gemini-tasks', name: '제미나이 태스크', initial: 'G', role: 'SUB', roleKo: '실행', sub: '실행 · 리서치 · 태스크 분해', color: '#60a5fa', soft: 'rgba(96,165,250,.13)', bg: 'linear-gradient(135deg,#60a5fa,#818cf8)', fixed: true, roleId: 'exec' },
    { id: 'codex', guideId: 'codex', name: '코덱스', initial: 'C', role: 'SUB', roleKo: '검증', sub: '심층 추론 · 리스크 · 아키텍처 검증', color: '#c4b5fd', soft: 'rgba(196,181,253,.14)', bg: 'linear-gradient(135deg,#c4b5fd,#a78bfa)', fixed: true, roleId: 'verify' }
  ];

  /* 카탈로그 항목 → 팀 에이전트 정의 */
  function toolAgent(t, role, label) {
    const r = role || roleById(t.role) || null;
    const c = t.color || '#60a5fa';
    return {
      id: t.agentId || t.id, guideId: t.id, name: t.name, initial: t.initial || 'A',
      role: 'SUB', roleKo: label || (r ? r.label : '실행'),
      sub: (t.limit ? t.limit + ' · ' : '') + (r ? r.hint : t.one || ''),
      color: c, soft: hexA(c, 0.13), bg: 'linear-gradient(135deg,' + c + ',' + c + 'aa)',
      fixed: false, roleId: r ? r.id : (t.role || 'custom'), tool: t
    };
  }

  function extrasOf(list) {
    return (list || []).map((e) => {
      const t = toolById(e.id);
      if (!t || !t.injectable) return null;
      const role = roleById(e.roleId);
      const label = e.roleId === 'custom' ? roleLabelOf('custom', e.label) : null;
      return toolAgent(t, role || null, label);
    }).filter(Boolean);
  }

  /* 현재 팀 = 고정 3인 + 투입된 가이드 에이전트 */
  function teamAgents() {
    return CORE_AGENTS.concat(extrasOf(state.extras));
  }

  function agentById(id) {
    const team = teamAgents();
    const hit = team.find((a) => a.id === id) || team.find((a) => a.guideId === id);
    if (hit) return hit;
    const core = CORE_AGENTS.find((a) => a.id === id || a.guideId === id);
    if (core) return core;
    const t = toolById(id);
    return t ? toolAgent(t, roleById(t.role)) : null;
  }
  function agentByName(name) {
    return teamAgents().find((a) => a.name === name) || null;
  }

  /* ── 팀 구성: 고정 3인 + 투입한 가이드 에이전트(역할 지정) ── */
  let draftExtras = [];               // 과제 시작 전 모달·가이드에서 고른 팀
  function teamIsLive() { return !!(state.profile && !state.completed); }
  function teamList() { return modalMode ? draftExtras : (teamIsLive() ? (state.extras || []) : draftExtras); }
  const roleLabelOf = (roleId, custom) => roleId === 'custom' ? (String(custom || '').trim() || '직접 지정 역할') : ((roleById(roleId) || {}).label || '실행');

  function nextTaskId() {
    let max = 6;
    state.tasks.forEach((t) => { const n = parseInt(String(t.id).replace(/\D/g, ''), 10); if (n > max) max = n; });
    return 'T' + (max + 1);
  }

  function syncExtraTasks() {
    if (!state.profile) return;
    const extras = state.extras || [];
    const kept = [];
    let maxId = 6;
    state.tasks.forEach((t) => { const n = parseInt(String(t.id).replace(/\D/g, ''), 10); if (n > maxId) maxId = n; });
    extras.forEach((e) => {
      const t = toolById(e.id);
      if (!t) return;
      const role = roleById(e.roleId);
      const label = roleLabelOf(e.roleId, e.label);
      const prev = state.tasks.find((x) => x.extraFor === t.id);
      if (prev) { prev.roleLabel = label; prev.owner = t.name; kept.push(prev); return; }
      maxId++;
      kept.push({
        id: 'T' + maxId, title: role ? role.task : (label + ' · ' + (t.one || '역할 수행')),
        owner: t.name, status: 'todo', weight: 0.9, extraFor: t.id, roleLabel: label
      });
    });
    state.tasks = state.tasks.filter((t) => !t.extraFor).concat(kept);
    state.tasks.sort((a, b) => parseInt(String(a.id).replace(/\D/g, ''), 10) - parseInt(String(b.id).replace(/\D/g, ''), 10));
  }

  function addTeamAgent(id, roleId) {
    const t = toolById(id);
    if (!t || !t.injectable) return false;
    const list = teamList().slice();
    if (list.some((e) => e.id === t.id)) return false;
    const rid = roleId || t.role;
    list.push({ id: t.id, roleId: rid, label: roleLabelOf(rid) });
    applyTeamList(list);
    return true;
  }
  function removeTeamAgent(id) {
    const t = toolById(id);
    const key = t ? t.id : id;
    const list = teamList().filter((e) => e.id !== key);
    if (list.length === teamList().length) return false;
    applyTeamList(list);
    return true;
  }
  function setTeamRole(id, roleId, custom) {
    const t = toolById(id);
    const key = t ? t.id : id;
    const list = teamList().map((e) => e.id === key ? Object.assign({}, e, { roleId: roleId, label: roleLabelOf(roleId, custom) }) : e);
    applyTeamList(list);
    return true;
  }
  function applyTeamList(list) {
    if (modalMode || !teamIsLive()) {
      draftExtras = list;
    } else {
      state.extras = list;
      syncExtraTasks();
      renderAll();
      saveSession();
    }
    renderTeamUI();
  }
  function toggleToolInTeam(id) {
    const t = toolById(id);
    if (!t || !t.injectable) return false;
    const on = teamList().some((e) => e.id === t.id);
    if (on) {
      removeTeamAgent(t.id);
      showToast(t.name + josa(t.name, '을') + ' 팀에서 뺐습니다');
      return false;
    }
    if (!modalMode && teamIsLive() && state.cursor >= 9) {
      showToast('마무리 단계입니다 — ' + t.name + josa(t.name, '은') + ' 다음 과제부터 투입할 수 있습니다');
      return false;
    }
    addTeamAgent(t.id);
    showToast(t.name + ' 투입 완료 — 역할은 ' + roleLabelOf(t.role) + ' (바꿀 수 있습니다)');
    return true;
  }
  function onTeamChange(e) {
    const t = e.target;
    if (!t || !t.matches) return;
    if (t.matches('[data-team-pick]')) {
      const id = t.getAttribute('data-team-pick');
      if (t.checked) toggleToolInTeam(id);
      else toggleToolInTeam(id);
      return;
    }
    if (t.matches('[data-team-role]')) {
      const id = t.getAttribute('data-team-role');
      setTeamRole(id, t.value, '');
      const inp = document.querySelector('#teamRows [data-team-custom="' + id + '"]') || document.querySelector('#guideTeam [data-team-custom="' + id + '"]');
      if (inp) inp.focus();
      return;
    }
    if (t.matches('[data-team-custom]')) {
      setTeamRole(t.getAttribute('data-team-custom'), 'custom', t.value);
    }
  }
  function onTeamClick(e) {
    const b = e.target.closest ? e.target.closest('[data-team-remove]') : null;
    if (!b) return;
    const id = b.getAttribute('data-team-remove');
    const t = toolById(id);
    removeTeamAgent(id);
    if (t) showToast(t.name + josa(t.name, '을') + ' 팀에서 뺐습니다');
  }
  function teamSummary() {
    return teamAgents().map((a) => ({
      id: a.id, name: a.name, role: a.roleKo, fixed: !!a.fixed,
      badge: a.tool ? a.tool.badge : (a.id === 'pickle' ? 'Lead' : '기본 멤버'),
      limit: a.tool ? (a.tool.limit || a.tool.badge) : ''
    }));
  }

  function taskDefs(p) {
    return [
      { id: 'T1', title: '범위·성공 기준 확정 — ' + cut(p.keywords[0] || '핵심 결과', 26), owner: '피클', status: 'todo', weight: 1 },
      { id: 'T2', title: '실행 5단계·일정 설계', owner: '제미나이 태스크', status: 'todo', weight: 1.2 },
      { id: 'T3', title: '리스크·대안 시나리오 검증', owner: '코덱스', status: 'todo', weight: 1.1 },
      { id: 'T4', title: p.deliverable + ' 1차 완성', owner: '제미나이 태스크', status: 'todo', weight: 1.4 },
      { id: 'T5', title: '품질 게이트·측정 방법 확정', owner: '코덱스', status: 'todo', weight: 1 },
      { id: 'T6', title: '최종 결과물 리포트 정리', owner: '피클', status: 'todo', weight: 1.1 }
    ];
  }

  function timeBox(profile, share) {
    const days = profile.deadline ? profile.deadline.days : 14;
    const totalH = Math.max(1.2, days * profile.hoursPerDay * (profile.scopeScale || 1));
    const h = Math.max(0.25, totalH * share);
    if (h < 1) return Math.round(h * 60 / 5) * 5 + '분';
    return (Math.round(h * 2) / 2) + '시간';
  }

  function scheduleLine(p) {
    if (!p.deadline) return '기간이 정해지지 않아 2주를 기본값으로 잡았습니다. 실제 마감이 있으면 알려 주세요.';
    const hours = p.hoursPerDay % 1 === 0 ? p.hoursPerDay : p.hoursPerDay.toFixed(1);
    const explicit = p.constraints.some((c) => c.type === 'timeuse');
    return p.deadline.label + ' 기준으로 역산했습니다(하루 ' + hours + '시간 ' + (explicit ? '가용' : '가정') + ').';
  }

  function scopeWord(p) {
    if (p.scopeScale && p.scopeScale < 1) return '지시에 따라 이번 판의 범위를 핵심 경로로 줄였습니다.';
    if (p.scopeScale && p.scopeScale > 1) return '지시에 따라 범위를 넓혀 단계를 나눴습니다.';
    return '';
  }

  function fbBlock(fresh) {
    return fresh ? '<div class="fb-quote">사용자 지시 반영 · "' + esc(cut(fresh, 120)) + '"</div>' : '';
  }

  function bullets(items, cls) {
    return '<ul class="bullets' + (cls ? ' ' + cls : '') + '">' + items.map((i) => '<li>' + i + '</li>').join('') + '</ul>';
  }

  function buildTurn(stage, p, fresh) {
    const a = {
      pickle: (tag, html, extra) => Object.assign({ stage, agent: 'pickle', tag, html, tasks: [], artifacts: [] }, extra || {}),
      gemini: (tag, html, extra) => Object.assign({ stage, agent: 'gemini', tag, html, tasks: [], artifacts: [] }, extra || {}),
      codex: (tag, html, extra) => Object.assign({ stage, agent: 'codex', tag, html, tasks: [], artifacts: [] }, extra || {})
    };
    const k = p.keywords;
    const when = p.deadline ? p.deadline.label : '정한 기간';
    const fb = fbBlock(fresh);

    if (stage === 1) {
      const html = fb +
        '<p>과제 <b>"' + esc(p.title) + '"</b>' + josa(p.title, '을') + ' 시작합니다. 제가 총괄하고, <span class="mention">@제미나이 태스크</span>가 실행 구조를, <span class="mention">@코덱스</span>가 논리와 리스크를 맡습니다.</p>' +
        (extrasOf(state.extras).length ? '<p>가이드에서 데려온 <b>' + extrasOf(state.extras).map((a) => esc(a.name) + '(' + esc(a.roleKo) + ')').join(', ') + '</b>도 함께합니다 — 각자 맡은 역할에서 발언하고 태스크를 하나씩 가져갑니다.</p>' : '') +
        '<p>제가 읽은 과제는 <b>' + esc(p.domainLabel) + ' · ' + esc(p.intentLabel) + '</b> 유형이고, 핵심어는 ' + k.slice(0, 3).map((x) => '<b>' + esc(x) + '</b>').join(', ') + '입니다. 목표는 이렇게 이해했습니다 — ' + esc(p.goalShort) + '</p>' +
        (p.constraints.length ? bullets(p.constraints.slice(0, 4).map((c) => '<b>' + esc(c.label) + '</b>')) : '') +
        '<p><b>성공 기준 3개</b>입니다. 이 셋만 보겠습니다.</p>' +
        bullets(p.criteria.map((c) => esc(c)), 'num-list') +
        '<div class="callout"><b>작업 규칙</b> 협업 중 지시를 넣으면 다음 턴부터 바로 반영합니다. &lsquo;자동 진행&rsquo;을 멈추고 &lsquo;다음 턴&rsquo;으로 한 단계씩 볼 수도 있습니다.</div>';
      return a.pickle('목표 정의', html, { tasks: [{ id: 'T1', status: 'in_progress' }] });
    }

    if (stage === 2) {
      const html = fb +
        '<p>' + (scopeWord(p) ? esc(scopeWord(p)) + ' ' : '') + '"' + esc(k[0] || '핵심 결과') + '"' + josa(k[0] || '핵심', '을') + ' 기준으로 5단계로 쪼갰습니다. ' + esc(scheduleLine(p)) + '</p>' +
        bullets(p.steps.map((s) => '<b>' + esc(s.name) + '</b> <span class="sub-note">· ' + esc(s.when) + ' · ' + esc(s.owner) + '</span><br>' + s.detail + '<br><span class="sub-note">산출물: ' + esc(s.output) + '</span>'), 'num-list') +
        '<p><b>필요한 리소스</b></p>' + bullets(p.resources.map((r) => esc(r))) +
        '<p><b>먼저 확인할 것</b> — 계획을 세우기 전에 사실로 확인해야 하는 항목입니다.</p>' + bullets(p.research.slice(0, 2).map((r) => esc(r))) +
        '<div class="callout"><b>오늘의 첫 30분</b> ' + esc(p.steps[0].detail) + '</div>';
      return a.gemini('과제 분해', html, {
        tasks: [{ id: 'T1', status: 'done' }, { id: 'T2', status: 'in_progress' }],
        artifacts: [{ title: '실행 단계 초안 (' + dateLabel() + ')', content: stepOutlineMd(p) }]
      });
    }

    if (stage === 3) {
      const altA = 'A안 — 좁고 빠르게: ' + esc(p.steps[0].name) + ' → ' + esc(p.steps[1].name) + '만 ' + esc(when) + ' 안에 끝내고, ' + esc(p.steps[3].name) + josa(p.steps[3].name, '은') + ' 다음 판으로 넘깁니다.';
      const altB = 'B안 — 넓고 완성도: 5단계를 모두 유지하되 ' + (p.deadline ? esc(p.deadline.label) + josa(p.deadline.label, '을') + ' 1.5배로 늘리거나' : '기간을 1.5배로 잡거나') + ' 하루 가용 시간을 2배로 확보합니다.';
      const rec = p.plan === 'A'
        ? 'A안을 권합니다. 기간이 짧을수록 단계 수를 줄이는 쪽이 완주율이 높습니다.'
        : 'B안을 권합니다. 다만 2단계 산출물이 나오기 전에는 3단계를 시작하지 않는 조건을 붙이세요.';
      const html = fb +
        '<p>계획을 그대로 두면 위험한 지점부터 짚겠습니다. 네 가지입니다.</p>' +
        bullets(p.critique.map((c) => '<b>' + esc(c.t) + '</b><br>' + esc(c.d)) , 'num-list') +
        '<p><b>대안 시나리오</b></p>' + bullets([altA, altB]) +
        '<p><b>품질 검증 기준</b> — 결과물을 볼 때 이 셋을 먼저 봅니다.</p>' + bullets(p.quality.map((q) => esc(q))) +
        '<div class="callout"><b>판단</b> ' + rec + ' 지시가 없으면 ' + p.plan + '안을 기본값으로 두고 진행합니다.</div>';
      return a.codex('심층 검증', html, { tasks: [{ id: 'T2', status: 'review' }, { id: 'T3', status: 'in_progress' }] });
    }

    if (stage === 4) {
      const html = fb +
        '<p>두 사람의 결과를 합쳐 결정 세 개를 내렸습니다.</p>' +
        bullets([
          '<b>채택</b> — 제미나이 태스크의 5단계 중 1·2단계를 이번 주에 먼저 실행합니다. 첫 산출물은 "' + esc(p.steps[0].output) + '"입니다.',
          '<b>수정</b> — 코덱스가 지적한 "' + esc(p.critique[0].t) + '" 항목을 반영해, 성공 기준에 측정값 한 개를 추가했습니다.',
          '<b>보류</b> — "' + esc(p.steps[4].name) + '"' + josa(p.steps[4].name, '은') + ' 결과물이 나온 뒤로 미룹니다.'
        ], 'num-list') +
        '<p>태스크 보드는 T2 검토, T3 진행, T4 착수로 옮겼습니다. 제미나이 태스크는 수정 실행안을, 코덱스는 품질 게이트를 이어서 준비해 주세요.</p>' +
        '<div class="callout"><b>지금 판단이 필요한 지점</b> A안(좁고 빠르게)과 B안(넓고 완성도) 중 어디로 갈지입니다. 지시가 없으면 <b>' + p.plan + '안</b>으로 계속합니다.</div>';
      return a.pickle('중간 조율', html, { tasks: [{ id: 'T2', status: 'review' }, { id: 'T3', status: 'in_progress' }, { id: 'T4', status: 'in_progress' }] });
    }

    if (stage === 5) {
      const items = p.steps.map((s, i) => '<b>' + esc(s.name) + '</b> — ' + esc(timeBox(p, [0.08, 0.2, 0.32, 0.24, 0.16][i])) + ' · ' + esc(s.when) + '<br>' + s.detail);
      const html = fb +
        '<p>코덱스 지적을 반영해 순서를 다시 짰습니다. ' + esc(when) + ' 안에 끝나도록 시간 상자를 먼저 잡고, 그 안에 맞지 않는 일은 잘라냈습니다.</p>' +
        bullets(items, 'num-list') +
        '<p><b>리소스 확정</b> ' + p.resources.map((r) => esc(r)).join(' · ') + '</p>' +
        '<p><b>이번 판 약속</b> "' + esc(p.checks[0]) + '"까지가 완료 조건입니다. 나머지는 다음 판으로 넘깁니다.</p>' +
        '<div class="callout"><b>검증 지표</b> ' + p.kpis.slice(0, 2).map((x) => esc(x)).join(', ') + ' — 이 두 개만 봅니다.</div>';
      return a.gemini('수정 실행안', html, {
        tasks: [{ id: 'T2', status: 'done' }],
        artifacts: [{ title: '수정 실행 체크리스트', content: checklistMd(p) }]
      });
    }

    if (stage === 6) {
      const gates = p.kpis.slice(0, 3).map((kpi, i) => '<b>' + esc(kpi) + '</b> — 측정: ' + esc(measureMethod(kpi, p, i)) + '<br>기준 미달 시: ' + esc(failAction(i, p))).join('</li><li>');
      const html = fb +
        '<p>측정하지 않는 계획은 계획이 아닙니다. 결과물을 판정할 게이트 세 개를 확정합니다.</p>' +
        '<ol class="bullets num-list"><li>' + gates + '</li></ol>' +
        '<p><b>반증 조건</b> 아래 신호가 하나라도 보이면 계획을 접고 A안으로 후퇴합니다.</p>' +
        bullets([
          esc(p.steps[1].when) + '까지 "' + esc(p.steps[1].output) + '"' + josa(p.steps[1].output, '이') + ' 나오지 않는다',
          '핵심 지표가 기준선보다 나빠진다',
          '같은 원인의 오류·지연이 두 번 반복된다'
        ]) +
        '<p><b>남는 리스크</b> ' + esc(p.risks[0].r) + ' — 대응은 ' + esc(p.risks[0].m) + '. 완전히 없애지는 못했으니 계속 봅니다.</p>' +
        '<div class="callout"><b>품질 기준</b> ' + p.quality.map((q) => esc(q)).join(' / ') + '</div>';
      return a.codex('품질 게이트', html, { tasks: [{ id: 'T3', status: 'done' }, { id: 'T5', status: 'in_progress' }] });
    }

    if (stage === 7) {
      const brief = briefMd(p);
      const html = fb +
        '<p>지금까지 합의를 실행 브리프 한 장으로 묶었습니다. 범위·일정·체크리스트가 같은 문서에 있어야 실행할 때 흔들리지 않습니다.</p>' +
        bullets([
          '<b>범위</b> — ' + esc(p.deliverable) + '까지. ' + esc(p.steps[3].name) + josa(p.steps[3].name, '은') + ' 다음 판.',
          '<b>일정</b> — ' + esc(p.steps.map((s) => s.when).join(' · ')),
          '<b>완료 조건</b> — ' + esc(p.checks[0])
        ]) +
        '<p>산출물 패널에 <b>실행 브리프</b>를 올렸습니다. 복사해서 그대로 쓸 수 있습니다.</p>' +
        '<div class="callout"><b>다음</b> 제미나이 태스크가 첫 3일 실행표를, 코덱스가 최종 검증을 맡습니다.</div>';
      return a.pickle('산출물 작성', html, {
        tasks: [{ id: 'T4', status: 'done' }, { id: 'T6', status: 'in_progress' }],
        artifacts: [{ title: '실행 브리프', content: brief }]
      });
    }

    if (stage === 8) {
      const days = firstThreeDays(p);
      const html = fb +
        '<p>바로 손이 움직이도록 첫 3일을 시간 단위로 잘랐습니다. ' + (p.deadline ? esc(p.deadline.label) : '2주') + ' 계획의 출발점입니다.</p>' +
        bullets(days.map((d) => '<b>' + esc(d.label) + '</b> — ' + esc(d.text) + '<br><span class="sub-note">완료 판단: ' + esc(d.done) + '</span>'), 'num-list') +
        '<p><b>루틴 고정</b> ' + esc(routineAdvice(p)) + '</p>' +
        '<p><b>도구 준비</b> ' + p.resources.map((r) => esc(r)).join(' · ') + '</p>' +
        '<div class="callout"><b>막히면</b> 30분 이상 진전이 없으면 범위를 더 자르고 피클에게 다시 조율을 요청하세요.</div>';
      return a.gemini('실행 체크리스트', html, {
        artifacts: [{ title: '첫 3일 실행표', content: firstDaysMd(p) }]
      });
    }

    if (stage === 9) {
      const html = fb +
        '<p>최종 검증입니다. 계획이 아니라 결과물을 봅니다.</p>' +
        bullets([
          '<b>품질 게이트</b> — ' + p.quality.map((q) => esc(q)).join(' / ') + '. 셋 다 통과해야 완료입니다.',
          '<b>남은 리스크</b> — ' + esc(p.risks[1] ? p.risks[1].r : p.risks[0].r) + ' (대응: ' + esc(p.risks[1] ? p.risks[1].m : p.risks[0].m) + ')',
          '<b>재검토 트리거</b> — ' + esc(p.steps[2].when) + '에 중간 점검, 지표가 기준선보다 나쁘면 즉시 A안으로 후퇴.'
        ], 'num-list') +
        '<p>지표 측정은 결과물을 만든 사람이 아니라 <b>다른 사람</b>이 한 번 해 보는 방식이 가장 정확합니다. ' + esc(p.audience) + ' 한 명에게 부탁하세요.</p>' +
        '<div class="callout"><b>코덱스 판정</b> 계획으로서는 통과입니다. 실행에서 무너질 지점은 일정이 아니라 범위이므로, 추가 요구가 들어오면 이번 판에서는 거절하는 규칙을 유지하세요.</div>';
      return a.codex('최종 검증', html, { tasks: [{ id: 'T5', status: 'done' }] });
    }

    const report = buildReportData(p);
    const html = fb +
      '<p>10단계 동안 태스크 ' + state.tasks.length + '개를 모두 마쳤습니다' + (extrasOf(state.extras).length ? ' — 투입한 ' + extrasOf(state.extras).length + '명도 자기 몫을 가져갔습니다' : '') + '. 마지막으로 결과를 하나로 묶었습니다.</p>' +
      bullets([
        '<b>과제 요약</b> — ' + esc(cut(p.goal, 110)),
        '<b>실행 로드맵</b> — 5단계, ' + esc(p.steps[0].when) + '부터 ' + esc(p.steps[4].when) + '까지',
        '<b>리스크</b> — ' + esc(p.risks[0].r) + ' 외 ' + Math.max(0, p.risks.length - 1) + '건과 대응책',
        '<b>체크리스트</b> — 바로 실행할 ' + p.checks.length + '개 항목'
      ]) +
      '<p><b>최종 결과물이 준비됐습니다.</b> 오른쪽 &lsquo;지표&rsquo; 탭이나 아래 버튼에서 열어 Markdown 복사, .md 저장, .html 보고서 저장을 할 수 있습니다.</p>' +
      '<div class="callout"><b>피클의 마지막 판단</b> 이 계획의 성패는 ' + esc(p.steps[0].name) + '에서 갈립니다. 첫 30분 안에 "' + esc(p.steps[0].output) + '"' + josa(p.steps[0].output, '을') + ' 만들지 못하면 범위를 다시 줄이세요.</div>';
    return a.pickle('최종 종합', html, {
      tasks: [{ id: 'T6', status: 'done' }],
      artifacts: [{ title: '최종 결과물 리포트', content: report.md }],
      report: report
    });
  }

  /* ─────── 4-2. 투입 에이전트의 역할 발언 (고정 3인 뒤에 붙는다) ─────── */
  function extraTaskId(def) {
    const t = state.tasks.find((x) => x.extraFor === def.guideId);
    return t ? t.id : null;
  }

  function extraTurnDef(def) {
    const are = { stage: 0, agent: def.id, tag: def.roleKo, html: '', tasks: [], artifacts: [] };
    return are;
  }

  function buildExtraTurn(def, stage, p) {
    const role = roleById(def.roleId);
    const stages = role && role.stages && role.stages.length ? role.stages : [2, 6];
    const first = stage === stages[0];
    const label = def.roleKo;
    const limit = def.tool ? (def.tool.limit || def.tool.badge || '무료 범위') : '무료 범위';
    const step0 = p.steps[0] || { name: '1단계', output: '첫 결과물' };
    const step1 = p.steps[1] || step0;
    const taskId = extraTaskId(def);
    const taskOps = stage === 1 || !taskId ? [] : [{ id: taskId, status: first ? 'in_progress' : 'done' }];
    const turn = extraTurnDef(def);
    Object.assign(turn, { stage: stage, tasks: taskOps });
    const head = '<p>저는 <b>' + esc(label) + '</b>' + josa(label, '을') + ' 맡았습니다.</p>';
    const headLater = '<p><b>' + esc(label) + '</b> 관점에서 다시 봤습니다.</p>';
    const who = p.audience || '사용자';
    const out = [];
    let html = '';

    if (stage === 1) {
      const myOut = role ? role.output : label;
      html = '<p><b>' + esc(label) + '</b>' + josa(label, '으로') + ' 합류했습니다. 먼저 <b>' + esc(step0.name) + '</b>' + josa(step0.name, '을') + ' 보고, 제 몫인 <b>' + esc(myOut) + '</b>' + josa(myOut, '을') + ' 넘기겠습니다.</p>';
      turn.html = html;
      return turn;
    }

    if (def.roleId === 'code') {
      if (first) {
        html = head +
          '<p>"' + esc(p.title) + '"에서 <b>' + esc(step0.name) + '</b>' + josa(step0.name, '을') + ' PR 3개로 나누겠습니다.</p>' +
          bullets([
            '<b>PR 1</b> — ' + esc(step0.output) + ' 뼈대와 실행 확인',
            '<b>PR 2</b> — 핵심 로직과 예외 처리 (' + esc(step1.name) + ' 준비)',
            '<b>PR 3</b> — 테스트와 사용 설명'
          ], 'num-list') +
          '<p>PR은 하나에 300줄 아래, 브랜치는 PR 하나당 하나만 열어 두겠습니다. 한도 <b>' + esc(limit) + '</b> 안에서 움직이려고 하루 두 사이클로 나뒀습니다.</p>' +
          '<div class="callout"><b>리뷰 규칙</b> @코덱스 품질 기준을 제가 먼저 셀프 체크하고, 통과한 PR만 넘깁니다. 막힌 건 바로 @피클에게 올립니다.</div>';
        out.push({
          title: 'PR 계획 (' + def.name + ')',
          content: ['# PR 계획 — ' + p.title, '', '- 역할: ' + label + ' (' + def.name + ', 한도 ' + limit + ')', '- 목표: ' + p.goal, '', '## PR 3건',
            '1. ' + step0.output + ' 뼈대와 실행 확인', '2. 핵심 로직과 예외 처리 (' + step1.name + ' 준비)', '3. 테스트와 사용 설명', '',
            '## 완료 판단', '- ' + p.checks[0], '- PR 3건 모두 셀프 체크 후 제출'].join('\n')
        });
      } else {
        const crit = p.critique[0] ? p.critique[0].t : '리스크 점검';
        html = headLater +
          '<p>수정 실행안을 코드로 옮길 순서를 확정했습니다. 코덱스가 짚은 항목은 문서가 아니라 실행 절차로 막습니다 — <b>' + esc(crit) + '</b>.</p>' +
          bullets([
            '실행 환경 먼저 맞추기 — 의존성 설치부터 다시(오류가 나면 여기서 멈춤)',
            '<b>' + esc(step0.name) + '</b> 변경을 PR 1로 올리고 실행 로그첨부',
            '통과하면 PR 2·3을 연속해서 올리고, 실패한 검사는 고치지 않고 목록만 남기기'
          ]) +
          '<p>PR을 닫는 기준은 하나입니다 — <b>' + esc(p.checks[0]) + '</b>. 확인되지 않으면 PR을 닫지 않고 다시 엽니다.</p>' +
          '<div class="callout"><b>지금 넘기는 것</b> PR 1건 + 실행 로그. 나머지 2건은 내일 첫 사이클에 올립니다.</div>';
      }
    } else if (def.roleId === 'ide') {
      if (first) {
        html = head +
          '<p>저는 편집기와 터미널에서 실제로 돌려 보는 쪽을 맡습니다. 수정 실행안을 명령 순서로 바꿔 오늘 한 사이클 돌려 보겠습니다.</p>' +
          bullets([
            '① 저장소를 받아 의존성 설치 — 여기서 실패하면 다른 건 보지 않고 멈춥니다',
            '② 개발 모드로 실행해 <b>' + esc(step0.name) + '</b> 결과물이 화면에 뜨는지 확인',
            '③ 빌드·검사 명령을 한 번 돌리고, 오류는 1건씩만 고쳐 다시 실행',
            '④ 실행 로그를 남겨 밖는 사람도 같은 결론을 내릴 수 있게 정리'
          ], 'num-list') +
          '<p>무료 한도가 <b>' + esc(limit) + '</b>라 빌드는 사이클당 한 번만 돌립니다. 여러 번 돌리면 한도가 먼저 떨어집니다.</p>' +
          '<div class="callout"><b>넘길 것</b> 실행 로그와 오류 1건. 고치지 못한 오류는 그대로 적어 @코덱스 판단을 받습니다.</div>';
        out.push({
          title: '실행 명령 순서표 (' + def.name + ')',
          content: ['# 실행 명령 순서표 — ' + p.title, '', '- 담당: ' + def.name + ' (' + label + ', ' + limit + ')', '', '## 사이클', '1. 의존성 설치', '2. 개발 모드 실행 — ' + step0.output + ' 확인',
            '3. 빌드·검사 1회', '4. 오류 1건 수정 후 재실행', '', '## 완료 판단', '- ' + p.checks[0]].join('\n')
        });
      } else {
        html = headLater +
          '<p>첫 3일 실행표를 명령 단위로 바꿨습니다. 하루에 한 사이클씩만 돌려서 한도 안에서 끝냅니다.</p>' +
          bullets([
            '<b>1일차</b> — 설치 → 실행 → <b>' + esc(step0.name) + '</b> 화면 확인',
            '<b>2일차</b> — ' + esc(step1.name) + ' 수정 1건, 빌드 로그 첨부',
            '<b>3일차</b> — ' + esc((p.steps[2] || step1).name) + ' 점검, 남은 오류 목록만 남기고 마감'
          ], 'num-list') +
          '<div class="callout"><b>주의</b> 실행이 두 번 연속 같은 곳에서 막히면 코드를 더 고치지 말고 범위를 줄입니다. 그 판단은 @피클 몫입니다.</div>';
      }
    } else if (def.roleId === 'browser') {
      if (first) {
        html = head +
          '<p>계획을 화면으로 확인하겠습니다. ' + esc(who) + ' 입장에서 실제로 보게 될 장면을 시나리오 3개로 줄였습니다.</p>' +
          bullets([
            '처음 열었을 때 — 첫 화면에서 무엇을 먼저 보는가',
            '핵심 행동 1회 — ' + esc(p.deliverable) + josa(p.deliverable, '이') + ' 실제로 되어 있는가',
            '실패했을 때 — 오류 문구가 다음 행동을 알려 주는가'
          ], 'num-list') +
          '<p>로그인·결제처럼 되돌리기 어려운 동작은 제가 누르지 않고, 어느 화면에서 멈추는지만 기록합니다.</p>' +
          '<div class="callout"><b>판정</b> 세 시나리오 중 둘 이상 막히면 계획이 아니라 화면을 먼저 고쳐야 합니다.</div>';
        out.push({
          title: '브라우저 검증 시나리오 (' + def.name + ')',
          content: ['# 브라우저 검증 시나리오 — ' + p.title, '', '- 검증자: ' + def.name + ' (' + label + ')', '- 대상 사용자: ' + who, '', '## 3개 시나리오',
            '1. 첫 화면: 첫 5초에 무엇을 보는가', '2. 핵심 행동 1회: ' + p.deliverable + josa(p.deliverable, '이') + ' 완성되는가', '3. 실패 화면: 오류 문구가 다음 행동을 알려 주는가', '',
            '## 기록 규칙', '- 로그인·결제·삭제는 직접 누르지 않고 차단 지점만 기록', '- 스크릿샷 1장 + 재현 절차 한 줄'].join('\n')
        });
      } else {
        html = headLater +
          '<p>품질 게이트를 화면 기록으로 바꿀겠습니다. 숫자만 보면 놓치는 것이 있어서, 장면을 함께 남깁니다.</p>' +
          bullets([
            '<b>' + esc(p.kpis[0]) + '</b>' + josa(p.kpis[0], '은') + ' 핵심 화면 도달까지 걸린 횟수로 기록',
            '성공·실패 장면을 같은 조건에서 3번 반복해 재현성 확인',
            '실패 장면은 스크릿샷과 함께 어느 단계에서 멈췄는지 한 줄로 남김'
          ]) +
          '<div class="callout"><b>주의</b> 같은 화면이 두 번 다르게 동작하면 그건 측정 문제가 아니라 버그입니다. 그때는 계획을 늘리지 말고 범위를 줄입니다.</div>';
      }
    } else if (def.roleId === 'local') {
      if (first) {
        html = head +
          '<p>제 일은 발행이 아니라 <b>초안</b>입니다. 내 PC에서 돌리는 모델이라 API 비용 없이 여러 초안을 시도할 수 있습니다.</p>' +
          bullets([
            '초안 1 — ' + esc(p.keywords.slice(0, 2).join('·') || '핵심 주제') + '를 한 문장으로 정리',
            '초안 2 — 독자가 바로 할 수 있는 행동 3개',
            '초안 3 — 반대로 하면 어떻게 되는지(반례)'
          ], 'num-list') +
          '<p>세 초안 중 제가 고른 한 개가 지금 단계의 재료가 됩니다. 메모리는 16GB 한도로 줄이고, 긴 글은 두 번에 나눠 씁니다.</p>' +
          '<div class="callout"><b>전제</b> 로컬 모델 초안은 검토 없이 그대로 쓰지 않습니다. 사실 확인은 @코덱스 기준을 따릅니다.</div>';
        out.push({
          title: '로컬 모델 초안 (' + def.name + ')',
          content: ['# 로컬 모델 초안 — ' + p.title, '', '- 작성: ' + def.name + ' (' + label + ', ' + limit + ')', '', '## 초안 1 (요약)', p.goal, '', '## 초안 2 (행동 3개)',
            '- ' + p.checks[0], '- ' + (p.checks[1] || p.checks[0]), '- ' + (p.checks[2] || p.checks[0]), '', '## 초안 3 (반례)',
            '- ' + (p.risks[0] ? p.risks[0].r : '범위를 넓히면 일정이 먼저 무너진다')].join('\n')
        });
      } else {
        html = headLater +
          '<p>초안 3편을 비교해서 1편만 남겼습니다. 남긴 기준은 문장 길이와 행동문 개수입니다.</p>' +
          '<p>산출물 패널의 <b>로컬 모델 초안</b>을 실행 브리프에 붙일 수 있게 정리해 올렸습니다. 문장 다듬기는 @제미나이 태스크가, 사실 확인은 @코덱스가 마저 봐 주세요.</p>' +
          '<div class="callout"><b>한도</b> 로컬 모델은 무료지만 느립니다. 마감이 급하면 초안을 1편으로 줄이고 품질을 먼저 봅니다.</div>';
      }
    } else if (def.roleId === 'research') {
      if (first) {
        html = head +
          '<p>무료 조건을 같은 기준으로 비교했습니다. 기간과 제공 범위가 서로 달라서, 그대로 견주면 잘못 고릅니다.</p>' +
          bullets([
            p.research[0] ? esc(p.research[0]) : '도구별 무료 한도와 과금 시작점 확인',
            p.research[1] ? esc(p.research[1]) : '같은 작업을 할 때 실제 소요 시간 비교',
            '무료 한도를 다 썼을 때의 대안(대기·다른 도구)까지 함께 적기'
          ], 'num-list') +
          '<p>비교표는 오른쪽 산출물에 올렸습니다. 제 판단은 <b>' + esc(p.plan === 'A' ? 'A안' : 'B안') + '</b> 쪽입니다.</p>' +
          '<div class="callout"><b>기준</b> 가격이 0원이어도 대기 시간이 길면 비용입니다. 시간을 숫자로 바꿔 비교했습니다.</div>';
        out.push({
          title: '무료 조건 비교표 (' + def.name + ')',
          content: ['# 무료 조건 비교표 — ' + p.title, '', '| 항목 | 무료 범위 | 과금 시작점 | 확인 방법 |', '|---|---|---|---|',
            '| ' + (p.research[0] || '도구 A') + ' | 무료 한도 확인 필요 | 한도 소진 후 | 공식 가격 페이지 |',
            '| ' + (p.research[1] || '도구 B') + ' | 체험·무료 터어 | 체험 종료 후 | 공식 문서 |',
            '| 대안 | 직접 실행(로컬) | 없음 | 실행 로그 |', '', '## 결론', '- ' + p.kpis[0] + ' 기준으로 가장 유리한 조합 1개 선택'].join('\n')
        });
      } else {
        html = headLater +
          '<p>비교표를 지표에 연결해 두었습니다. 무료 범위가 달라도 측정 기준만 같으면 결과를 견줄 수 있습니다.</p>' +
          '<p>이번 판에서 도구를 바꾸는 일은 없습니다. 바꾸려면 최소 1주치 표본이 필요해서, 지금 바꾸면 판정이 불가능합니다.</p>' +
          '<div class="callout"><b>확인 필요</b> 무료 정책은 서비스가 수시로 바뀝니다. 판정 일주일 전에 제가 다시 확인해 비교표를 갱슬합니다.</div>';
      }
    } else if (def.roleId === 'spec') {
      if (first) {
        html = head +
          '<p>말로 정한 약속은 실행할 때 흔들리므로, 스펙 세 장으로 고정하겠습니다.</p>' +
          bullets([
            '<b>범위</b> — 이번 판에 끝내는 것: ' + esc(p.deliverable) + ', 이번 판에서 빠지는 것: ' + esc(p.steps[3].name),
            '<b>인터페이스</b> — 누가 무엇을 넣고 무엇을 돌려받는지 (화면·파일·메시지)',
            '<b>완료 조건</b> — ' + esc(p.checks[0])
          ], 'num-list') +
          '<p>크레딧 <b>' + esc(limit) + '</b> 안에서 세 장을 모두 끝내려고 표와 목록만 쓰고 줄글은 빼겠습니다.</p>' +
          '<div class="callout"><b>규칙</b> 스펙에 없는 요구가 들어오면 이번 판에서는 받지 않고 다음 판으로 넘깁니다.</div>';
        out.push({
          title: '스펙 문서 3장 (' + def.name + ')',
          content: ['# 스펙 문서 — ' + p.title, '', '## 1. 범위', '- 포함: ' + p.deliverable, '- 제외: ' + p.steps[3].name + ', ' + p.steps[4].name, '', '## 2. 인터페이스',
            '- 입력: ' + (p.constraints[0] ? p.constraints[0].label : '사용자 요청'), '- 처리: ' + p.steps[0].name + ' → ' + p.steps[1].name, '- 출력: ' + p.deliverable, '', '## 3. 완료 조건', '- ' + p.checks[0], '- ' + p.kpis[0]].join('\n')
        });
      } else {
        html = headLater +
          '<p>완료 조건을 스펙에 숫자로 박아 두었습니다. ' + esc(p.kpis[0]) + josa(p.kpis[0], '을') + ' 측정할 수 없으면 완료가 아니라 보류로 표시합니다.</p>' +
          '<p>스펙에 없는 요구가 들어오면 다음 판 목록에 넣고 이번 판은 그대로 끝냅니다.</p>' +
          '<div class="callout"><b>남은 구멍</b> 인터페이스는 글로만 고정되어 있어서, 실제 화면이 다르면 다시 맞춰야 합니다. @Perplexity Comet 검증 결과를 기다립니다.</div>';
      }
    } else if (def.roleId === 'docs') {
      if (first) {
        html = head +
          '<p>결과물 문서 구조를 잡았습니다. 읽는 사람은 ' + esc(who) + ' 한 명이라고 보고, 첫 화면에서 필요한 것만 위에 올렸습니다.</p>' +
          bullets([
            '<b>요약 1장</b> — 무엇을, 왜, 언제까지 (' + esc(p.deadline ? p.deadline.label : '2주') + ')',
            '<b>실행 문서</b> — ' + esc(p.deliverable) + josa(p.deliverable, '과') + ' 체크리스트',
            '<b>변경 기록</b> — 이번 판에서 뺀 것과 이유'
          ], 'num-list') +
          '<p>문서는 늘리는 대신 합치는 방향으로 다듬겠습니다. 같은 내용이 두 문서에 있으면 하나를 지웁니다.</p>' +
          '<div class="callout"><b>기준</b> 처음 보는 사람이 3분 안에 첫 행동을 찾을 수 있으면 통과입니다.</div>';
        out.push({
          title: '문서 목차 (' + def.name + ')',
          content: ['# 문서 목차 — ' + p.title, '', '1. 요약 (목표 · 기간 · 대상)', '2. 실행 문서 (' + p.deliverable + ')', '3. 체크리스트', '4. 변경 기록', '',
            '## 요약 초안', '- 목표: ' + p.goal, '- 기간: ' + (p.deadline ? p.deadline.label : '2주'), '- 대상: ' + who].join('\n')
        });
      } else {
        html = headLater +
          '<p>첫 3일 실행표 문장을 다듬었습니다. 긴 문장은 명령형 한 줄로 바꾸고, 완료 판단은 눈으로 확인할 수 있는 말로 고쳤습니다.</p>' +
          '<p>문서에서 빠진 항목은 <b>' + esc(p.checks[p.checks.length - 1] || p.checks[0]) + '</b> 하나입니다. 이건 화면 검증 결과가 나온 뒤에 넣겠습니다.</p>' +
          '<div class="callout"><b>넘길 것</b> 정리된 요약 1장. 실행 문서는 @제미나이 태스크 문장을 그대로 쓰고 새로 쓰지 않았습니다.</div>';
      }
    } else if (def.roleId === 'qa') {
      if (first) {
        html = head +
          '<p>재현 절차부터 만들었습니다. 같은 문제가 두 번 나오면 테스트가 없어서 그렇습니다.</p>' +
          bullets([
            '<b>재현</b> — 같은 조건에서 3번 반복해 2번 이상 나오면 버그로 등록',
            '<b>회귀</b> — 체크리스트 첫 항목("' + esc(p.checks[0]) + '") 포함 12건 체크',
            '<b>종료 조건</b> — 새 오류 0건이 아니라, 알려진 오류 목록이 문서와 같은 상태'
          ], 'num-list') +
          '<p>12건 중 9건은 이미 자동으로 돌릴 수 있습니다. 나머지 3건은 화면 확인이 필요해서 @Perplexity Comet 쪽에 넘길 수 있습니다.</p>' +
          '<div class="callout"><b>주의</b> 테스트를 통과해도 기획 의도와 다르면 버그입니다. 마지막 판정은 사람이 합니다.</div>';
        out.push({
          title: '회귀 체크 12건 (' + def.name + ')',
          content: ['# 회귀 체크 12건 — ' + p.title, '', '| 번호 | 확인 항목 | 방법 | 판정 |', '|---|---|---|---|',
            '| 1 | ' + p.checks[0] + ' | 직접 확인 | 대기 |', '| 2 | ' + (p.checks[1] || '핵심 화면 도달') + ' | 반복 실행 | 대기 |',
            '| 3 | 오류 문구 | 화면 확인 | 대기 |', '| 4~12 | 예외 입력·재시도·모바일 화면 | 자동 + 화면 | 대기 |', '', '## 종료 조건', '- 알려진 오류 목록과 문서가 같은 상태'].join('\n')
        });
      } else {
        html = headLater +
          '<p>최종 검증에서 12건을 다시 돌렸습니다. 새 오류는 없고, 알려진 오류 1건은 문서와 같은 상태입니다.</p>' +
          '<p>지표 <b>' + esc(p.kpis[0]) + '</b>' + josa(p.kpis[0], '은') + ' 기준선을 막 넘었습니다. 실패 기준을 넘나드는 상태라 다음 주 한 번 더 봐야 합니다.</p>' +
          '<div class="callout"><b>판정</b> 이번 판은 조건부 통과입니다. 다음 판 첫 작업은 이 한 건의 재현 절차 다시 만들기입니다.</div>';
      }
    } else {
      if (first) {
        html = head +
          '<p>' + esc(label) + ' 관점에서 이번 과제를 보면, 결론을 내리기 전에 <b>' + esc(step0.name) + '</b>의 결과를 한 번 보고 싶습니다.</p>' +
          '<p>제가 보탬 수 있는 부분은 ' + esc(role ? role.output : '역할 산출물') + '입니다. 넘길 때는 확인할 수 있는 형태(문서·목록·기록)로 넘기겠습니다.</p>' +
          '<div class="callout"><b>요청</b> 제 역할 범위를 넘는 결정(예산·일정 변경)은 제가 하지 않고 @피클에게 넘깁니다.</div>';
      } else {
        html = headLater +
          '<p>맡은 부분을 마쳤습니다. 결과는 산출물 패널에 정리했고, 완료 조건은 <b>' + esc(p.checks[0]) + '</b>로 확인했습니다.</p>' +
          '<div class="callout"><b>남긴 것</b> 다음 판에서 다시 볼 항목 1개 — ' + esc(p.risks[0] ? p.risks[0].r : '일정 지연') + '.</div>';
      }
    }

    turn.html = html;
    turn.artifacts = out;
    return turn;
  }

  function extraTurnsFor(stage, p) {
    const list = extrasOf(state.extras);
    const out = [];
    list.forEach((def) => {
      const role = roleById(def.roleId);
      const stages = role && role.stages && role.stages.length ? role.stages : [2, 6];
      if (stage === 1) { out.push(buildExtraTurn(def, 1, p)); return; }
      if (stages.indexOf(stage) >= 0) { out.push(buildExtraTurn(def, stage, p)); return; }
      /* 늦게 합류해 자기 단계를 놓친 에이전트 — 마지막 검증 단계에서 한 번은 말한다 */
      if (stage === 9 && !state.messages.some((m) => m.agent === def.id)) {
        const t = buildExtraTurn(def, 9, p);
        t.html = '<p>합류가 늦어 제 단계를 건너뛰었습니다. <b>' + esc(def.roleKo) + '</b> 관점에서 마지막에 한 번만 짚겠습니다 — <b>' + esc(p.kpis[0]) + '</b> 기준과 <b>' + esc(p.checks[0]) + '</b> 확인은 제가 맡겠습니다.</p>' +
          '<div class="callout"><b>한도</b> ' + esc(def.tool ? (def.tool.limit || def.tool.badge || '무료 범위') : '무료 범위') + ' 안에서 이번 판은 여기까지만 합니다.</div>';
        t.tasks = extraTaskId(def) ? [{ id: extraTaskId(def), status: 'done' }] : [];
        t.artifacts = [];
        out.push(t);
      }
    });
    return out;
  }

  function turnsForStage(stage, p, fresh) {
    const list = [buildTurn(stage, p, fresh)];
    return list.concat(extraTurnsFor(stage, p));
  }

  function measureMethod(kpi, p, i) {    if (/율|비율|률|전환/.test(kpi)) return '같은 조건의 ' + (i === 0 ? '첫 10건' : '1주일') + ' 표본에서 성공 건수 ÷ 전체 건수';
    if (/시간/.test(kpi)) return '시작 시각과 끝 시각을 3회 기록해 중앙값 사용';
    if (/수|건수|개수/.test(kpi)) return '주 1회 같은 요일에 세어 추이만 비교';
    if (/비용/.test(kpi)) return '실제 결제·청구 금액을 합산(추정 금액 제외)';
    return '결과물을 본 ' + (p.audience || '사용자') + ' 3명의 관찰 기록으로 판정';
  }
  function failAction(i, p) {
    return i === 0 ? '범위를 ' + p.steps[0].name + '까지 줄이고 재측정' : i === 1 ? '해당 단계를 중단하고 원인 1개만 고친 뒤 재시도' : '다음 판으로 미루고 현재 판을 마감';
  }
  function routineAdvice(p) {
    const c = p.constraints.map((x) => x.label).join(' ');
    if (/하루\s*\d+\s*시간/.test(c)) return c.match(/하루\s*\d+\s*시간/)[0] + '을 같은 시간대에 고정하고, 그 시간에 들어가지 않는 일은 목록에서 뺍니다.';
    if (/주말/.test(c)) return '주말 한 블록을 길게 쓰고, 평일에는 10분 점검만 합니다.';
    if (/평일|저녁/.test(c)) return '퇴근 후 같은 시간에 30분 블록을 두고, 주말에 다음 주 준비를 몰아서 합니다.';
    return '하루 30분 같은 시간에 고정하고, 못 한 날은 다음 날 10분으로만 만회합니다(두 배로 하지 않습니다).';
  }
  function firstThreeDays(p) {
    return [
      { label: 'D-1 준비', text: p.resources.slice(0, 2).join(' · ') + ' 준비, ' + p.steps[0].output + ' 초안 작성 ' + timeBox(p, 0.1), done: p.steps[0].output + ' 1장이 있다' },
      { label: 'D1 실행', text: p.steps[0].name + ' 완료 → ' + p.steps[1].name + ' 착수 (' + timeBox(p, 0.25) + ')', done: p.steps[1].output + '의 첫 조각이 보인다' },
      { label: 'D2 점검', text: p.steps[1].name + ' 마무리 + 코덱스 품질 기준 1차 확인', done: '체크리스트 첫 항목에 예/아니오로 답할 수 있다' }
    ];
  }

  /* ─────────────────────── 5. 결과물 생성 ─────────────────────── */
  function teamReport() {
    return teamAgents().map((a) => {
      const role = roleById(a.roleId);
      const arts = state.artifacts.filter((x) => x.agent === a.name).map((x) => x.title);
      return {
        name: a.name, role: a.roleKo, fixed: !!a.fixed,
        badge: a.tool ? a.tool.badge : '기본 팀', limit: a.tool ? (a.tool.limit || '') : '',
        spoke: state.messages.filter((m) => m.agent === a.id).length,
        tasks: state.tasks.filter((t) => t.owner === a.name).map((t) => t.title),
        artifacts: arts,
        output: arts.length ? arts.join(', ') : (role ? role.output : a.roleKo + ' 산출물')
      };
    });
  }

  function buildReportData(p) {
    const roadmap = p.steps.map((s) => ({ step: s.name, detail: s.detail.replace(/<[^>]+>/g, ''), owner: s.owner, when: s.when, output: s.output }));
    return {
      p,
      created: dateLabel(),
      team: teamReport(),
      summary: {
        goal: p.goal,
        context: p.context || '별도 제약 없음',
        criteria: p.criteria,
        keywords: p.keywords,
        domain: p.domainLabel,
        intent: p.intentLabel,
        audience: p.audience,
        deadline: p.deadline ? p.deadline.label : '미정(2주 기본값)'
      },
      roadmap,
      risks: p.risks,
      checklist: p.checks,
      gates: p.kpis.slice(0, 3).map((kpi, i) => ({ name: kpi, method: measureMethod(kpi, p, i), fail: failAction(i, p) })),
      next: [
        p.steps[0].output + josa(p.steps[0].output, '을') + ' 오늘 30분 안에 만들고, 만들지 못하면 범위를 절반으로 줄인다',
        p.kpis[0] + ' 기준선을 지금 숫자로 적는다',
        '다음 점검일을 캘린더에 넣는다(' + p.steps[2].when + ')'
      ],
      feedback: (p.feedbackLog || []).slice()
    };
  }

  function stepOutlineMd(p) {
    return ['# ' + p.title + ' — 실행 단계 초안', '', '목표: ' + p.goal, '', '## 5단계', '']
      .concat(p.steps.map((s, i) => (i + 1) + '. **' + s.name + '** (' + s.when + ', ' + s.owner + ')\n   - ' + s.detail.replace(/<[^>]+>/g, '') + '\n   - 산출물: ' + s.output))
      .concat(['', '## 리소스', ''].concat(p.resources.map((r) => '- ' + r)))
      .join('\n');
  }

  function checklistMd(p) {
    return ['# ' + p.title + ' — 실행 체크리스트', '', '기간: ' + (p.deadline ? p.deadline.label : '2주') + ' / 하루 ' + p.hoursPerDay + '시간', '']
      .concat(p.steps.map((s, i) => '- [ ] ' + s.name + ' (' + timeBox(p, [0.08, 0.2, 0.32, 0.24, 0.16][i]) + ') → ' + s.output))
      .concat(['', '## 완료 판정'])
      .concat(p.checks.map((c) => '- [ ] ' + c))
      .join('\n');
  }

  function briefMd(p) {
    return ['# ' + p.title + ' — 실행 브리프', '', '> 피클 · 제미나이 태스크 · 코덱스 협업 산출물 · ' + dateLabel(), '',
      '## 목표', p.goal, '', '## 범위', '- 결과물: ' + p.deliverable, '- 이번 판에서 제외: ' + p.steps[3].name + ', ' + p.steps[4].name, '',
      '## 로드맵'].concat(
      p.steps.slice(0, 3).map((s, i) => (i + 1) + '. ' + s.name + ' — ' + s.when + ' · ' + s.owner + '\n   ' + s.detail.replace(/<[^>]+>/g, '')),
      ['', '## 완료 체크리스트'].concat(p.checks.map((c) => '- [ ] ' + c)),
      ['', '## 지표', p.kpis.map((k) => '- ' + k).join('\n')]
    ).join('\n');
  }

  function firstDaysMd(p) {
    return ['# ' + p.title + ' — 첫 3일 실행표', '']
      .concat(firstThreeDays(p).map((d) => '## ' + d.label + '\n- 할 일: ' + d.text + '\n- 완료 판단: ' + d.done))
      .concat(['', '루틴: ' + routineAdvice(p)]).join('\n');
  }

  function reportTeamLine(data) {
    const team = data.team || [];
    if (team.length <= 3) return '피클(Lead) · 제미나이 태스크 · 코덱스 3자 협업 결과물';
    return '피클(Lead) · 제미나이 태스크 · 코덱스 + 가이드 에이전트 ' + (team.length - 3) + '명이 역할을 나눠 협업한 결과물';
  }

  function reportMarkdown(data) {
    const p = data.p;
    const L = [];
    const team = data.team || [];
    const hasTeam = team.length > 3;
    L.push('# ' + p.title, '');
    L.push('> ' + reportTeamLine(data) + '  ');
    L.push('> ' + data.created + ' · ' + p.domainLabel + ' / ' + p.intentLabel + ' · 대상: ' + p.audience, '');
    if (data.ai) L.push('> ' + aiProvenanceText(data.ai), '');
    L.push('## 1. 과제 요약', '');
    L.push('- **목표**: ' + data.summary.goal);
    L.push('- **배경·제약**: ' + data.summary.context);
    L.push('- **성공 기준**');
    data.summary.criteria.forEach((c, i) => L.push('  ' + (i + 1) + '. ' + c));
    L.push('- **분석된 핵심 키워드**: ' + data.summary.keywords.join(', '));
    L.push('- **기간**: ' + data.summary.deadline, '');
    L.push('## 2. 실행 로드맵', '');
    L.push('| 단계 | 할 일 | 담당 | 기간 | 산출물 |');
    L.push('|---|---|---|---|---|');
    data.roadmap.forEach((r, i) => L.push('| ' + (i + 1) + ' | ' + mdCell(r.step + ' — ' + r.detail) + ' | ' + r.owner + ' | ' + r.when + ' | ' + mdCell(r.output) + ' |'));
    L.push('', '## 3. 리스크 및 대응책', '');
    L.push('| 리스크 | 영향 | 대응 | 조기 신호 |');
    L.push('|---|---|---|---|');
    data.risks.forEach((r) => L.push('| ' + mdCell(r.r) + ' | ' + mdCell(r.i) + ' | ' + mdCell(r.m) + ' | ' + mdCell(r.s) + ' |'));
    L.push('', '## 4. 바로 실행할 체크리스트', '');
    data.checklist.forEach((c) => L.push('- [ ] ' + c));
    L.push('', '## 5. 품질 검증 기준', '');
    L.push('| 지표 | 측정 방법 | 기준 미달 시 |');
    L.push('|---|---|---|');
    data.gates.forEach((g) => L.push('| ' + mdCell(g.name) + ' | ' + mdCell(g.method) + ' | ' + mdCell(g.fail) + ' |'));
    L.push('', '- 품질 기준: ' + p.quality.join(' / '));
    let sec = 5;
    if (hasTeam) {
      sec++;
      L.push('', '## ' + sec + '. 참여 에이전트별 역할·산출물', '');
      L.push('| 에이전트 | 역할 | 발언 | 산출물·맡은 일 |');
      L.push('|---|---|---|---|');
      team.forEach((t) => L.push('| ' + mdCell(t.name) + (t.fixed ? '' : ' (투입)') + ' | ' + mdCell(t.role) + ' | ' + t.spoke + ' | ' + mdCell(t.output) + ' |'));
    }
    if (data.feedback.length) {
      sec++;
      L.push('', '## ' + sec + '. 사용자 개입 반영', '');
      data.feedback.forEach((f) => L.push('- "' + f.text + '" → ' + f.effect));
    }
    sec++;
    L.push('', '## ' + sec + '. 다음 단계', '');
    data.next.forEach((n, i) => L.push((i + 1) + '. ' + n));
    L.push('', '---', '');
    L.push('_Agent Collab Studio에서 ' + (hasTeam ? '피클 · 제미나이 태스크 · 코덱스 + 가이드 에이전트 ' + (team.length - 3) + '명' : '피클 · 제미나이 태스크 · 코덱스') + ' 협업으로 생성됨._');
    return L.join('\n');
  }
  function mdCell(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }

  function aiProvenanceText(ai) {
    if (!ai) return '';
    const label = providerLabelText(ai.provider || 'workers-ai');
    return 'AI 종합 · ' + label + (ai.model ? ' (' + ai.model + ')' : '') + ' — 10턴 협업 기록을 실제 AI가 다시 정리했습니다';
  }

  function reportHtml(data) {
    const p = data.p;
    const team = data.team || [];
    const hasTeam = team.length > 3;
    const section = (n, title, body) => '<h2><span class="n">' + n + '</span>' + esc(title) + '</h2>' + body;
    let h = '<h1>' + esc(p.title) + '</h1>' +
      '<p class="rsub">' + data.created + ' · ' + esc(p.domainLabel) + ' / ' + esc(p.intentLabel) + ' · 대상 ' + esc(p.audience) + '</p>' +
      (data.ai ? '<p class="rprovenance">' + esc(aiProvenanceText(data.ai)) + '</p>' : '') +
      section('01', '과제 요약',
        '<div class="summary-grid">' +
        '<div class="summary-cell"><span>목표</span><b>' + esc(cut(data.summary.goal || p.goal, 160)) + '</b></div>' +
        '<div class="summary-cell"><span>기간</span><b>' + esc(data.summary.deadline) + '</b></div>' +
        '<div class="summary-cell"><span>배경·제약</span><b>' + esc(cut(data.summary.context || p.context || '별도 제약 없음', 160)) + '</b></div>' +
        '<div class="summary-cell"><span>핵심 키워드</span><b>' + esc(data.summary.keywords.join(', ')) + '</b></div>' +
        '</div>' +
        '<h3>성공 기준</h3><ol>' + data.summary.criteria.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ol>') +
      section('02', '실행 로드맵',
        '<div class="table-wrap"><table class="report-table"><thead><tr><th>단계</th><th>할 일</th><th>담당</th><th>기간</th><th>산출물</th></tr></thead><tbody>' +
        data.roadmap.map((r, i) => '<tr><td>' + (i + 1) + '</td><td><b>' + esc(r.step) + '</b><br>' + esc(r.detail) + '</td><td>' + esc(r.owner) + '</td><td>' + esc(r.when) + '</td><td>' + esc(r.output) + '</td></tr>').join('') +
        '</tbody></table></div>') +
      section('03', '리스크 및 대응책',
        '<div class="table-wrap"><table class="report-table"><thead><tr><th>리스크</th><th>영향</th><th>대응</th><th>조기 신호</th></tr></thead><tbody>' +
        data.risks.map((r) => '<tr><td><b>' + esc(r.r) + '</b></td><td>' + esc(r.i) + '</td><td>' + esc(r.m) + '</td><td>' + esc(r.s) + '</td></tr>').join('') +
        '</tbody></table></div>') +
      section('04', '바로 실행할 체크리스트', '<ul class="checklist">' + data.checklist.map((c) => '<li><span class="box"></span><span>' + esc(c) + '</span></li>').join('') + '</ul>') +
      section('05', '품질 검증 기준',
        '<div class="table-wrap"><table class="report-table"><thead><tr><th>지표</th><th>측정 방법</th><th>기준 미달 시</th></tr></thead><tbody>' +
        data.gates.map((g) => '<tr><td><b>' + esc(g.name) + '</b></td><td>' + esc(g.method) + '</td><td>' + esc(g.fail) + '</td></tr>').join('') +
        '</tbody></table></div>' +
        '<p><b>품질 기준</b> ' + p.quality.map((q) => esc(q)).join(' · ') + '</p>');
    let sec = 5;
    if (hasTeam) {
      sec++;
      h += section('0' + sec, '참여 에이전트별 역할·산출물',
        '<div class="table-wrap"><table class="report-table"><thead><tr><th>에이전트</th><th>역할</th><th>발언</th><th>산출물·맡은 일</th></tr></thead><tbody>' +
        team.map((t) => '<tr><td><b>' + esc(t.name) + '</b>' + (t.fixed ? '' : '<br><span class="tg">가이드 투입 · ' + esc(t.badge) + '</span>') + '</td><td>' + esc(t.role) + '</td><td>' + t.spoke + '</td><td>' + esc(t.output) + '</td></tr>').join('') +
        '</tbody></table></div><p class="rsub">고정 3인 외에 무료 에이전트 가이드에서 투입한 에이전트가 부여된 역할대로 발언·태스크·산출물을 맡았습니다.</p>');
    }
    if (data.feedback.length) {
      sec++;
      h += section('0' + sec, '사용자 개입 반영', '<ul>' + data.feedback.map((f) => '<li>"' + esc(f.text) + '" → ' + esc(f.effect) + '</li>').join('') + '</ul>');
    }
    sec++;
    h += section('0' + sec, '다음 단계', '<ol>' + data.next.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ol>');
    return h;
  }

  function standaloneHtml(data) {
    const body = reportHtml(data);
    const p = data.p;
    return '<!DOCTYPE html>\n<html lang="ko">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>' + esc(p.title) + ' — Agent Collab Studio</title>\n<style>\n' +
      'body{margin:0;background:#f6f8fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;line-height:1.7}\n' +
      '.page{max-width:860px;margin:0 auto;padding:40px 24px 64px;background:#fff}\n' +
      '.brand{font-size:11px;letter-spacing:.16em;color:#0f766e;font-weight:700;margin-bottom:6px}\n' +
      'h1{font-size:26px;line-height:1.35;margin:0 0 6px;letter-spacing:-.02em}\n' +
      '.rsub{color:#6b7280;font-size:12px;margin:0 0 26px}\n' +
      '.rprovenance{color:#0f766e;font-size:11px;margin:-16px 0 24px;border-left:2px solid #99f6e4;padding-left:8px}\n' +
      'h2{font-size:15px;margin:32px 0 10px;padding-bottom:7px;border-bottom:2px solid #e5e7eb;display:flex;gap:8px;align-items:center}\n' +
      'h2 .n{font-size:10px;color:#0f766e;border:1px solid #99f6e4;background:#f0fdfa;border-radius:4px;padding:1px 5px}\n' +
      'h3{font-size:13px;margin:16px 0 6px;color:#374151}\n' +
      'p,li{font-size:13px;color:#374151}\n' +
      'ol,ul{padding-left:20px}\n' +
      '.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}\n' +
      '.summary-cell{border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;background:#f9fafb}\n' +
      '.summary-cell span{display:block;font-size:10px;letter-spacing:.06em;color:#9ca3af;font-weight:700}\n' +
      '.summary-cell b{display:block;margin-top:3px;font-size:12.5px;font-weight:600;color:#111827}\n' +
      '.table-wrap{overflow-x:auto;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px}\n' +
      'table{width:100%;border-collapse:collapse;font-size:12px;min-width:520px}\n' +
      'th,td{padding:9px 10px;text-align:left;vertical-align:top;border-bottom:1px solid #f1f5f9}\n' +
      'th{background:#f8fafc;font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#6b7280}\n' +
      'tr:last-child td{border-bottom:0}\n' +
      '.checklist{list-style:none;padding:0}\n' +
      '.checklist li{display:flex;gap:9px;font-size:12.5px;margin-bottom:7px}\n' +
      '.checklist .box{width:14px;height:14px;border:1.5px solid #0d9488;border-radius:4px;flex:none;margin-top:3px}\n' +
      '.footer{margin-top:40px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af}\n' +
      '@media print{body{background:#fff}.page{padding:0}}\n' +
      '@media(max-width:600px){.page{padding:24px 14px 40px}h1{font-size:21px}.summary-grid{grid-template-columns:1fr}}\n' +
      '</style>\n</head>\n<body>\n<div class="page">\n<div class="brand">AGENT COLLAB STUDIO · 피클 · 제미나이 태스크 · 코덱스</div>\n' +
      body + '\n<div class="footer">' + data.created + ' · 브라우저에서 생성된 결과물 · Agent Collab Studio</div>\n</div>\n</body>\n</html>';
  }

  /* ─────────────────────── 6. 상태 · 저장 ─────────────────────── */
  const LS_HISTORY = 'acs.history.v1';
  const LS_SESSION = 'acs.session.v1';

  const state = {
    profile: null,
    tasks: [],
    messages: [],
    artifacts: [],
    cursor: 0,
    feedback: [],
    report: null,
    completed: false,
    busy: false,
    autoPlay: false,
    speed: 1,
    chatFilter: 'all',
    rightTab: 'tasks',
    mobileTab: 'chat',
    focus: false,
    typingAgent: null,
    runId: null,
    createdAt: null,
    extras: [],
    pendingTurn: false,
    ai: { ready: null, source: 'local', provider: '', model: '', ms: 0, reason: '', attempted: false, models: [], poolLoaded: false }
  };
  let autoTimer = null;
  let typingTimer = null;
  let pendingFresh = null;
  let stageQueue = [];
  let stageFresh = null;

  /* ═══════════════ 6-1. AI 실시간 생성 (🤖 에이전트 협업) ═══════════════
     - 기본은 서버의 /api/collab → Workers AI. 키 입력 없이 바로 동작한다.
     - 사용자가 자기 키(BYOK)를 넣으면 그 키로만 호출하고, 키는 이 브라우저에만 둔다.
     - 호출 실패·오프라인·할당량 초과면 아래 결정론적 엔진(buildTurn 등)으로 폴백한다. */
  const LS_AI = 'acs.ai.v1';
  const AI_ENDPOINT = '/api/collab';
  const AI_TIMEOUT = 38000;
  const AI_PROVIDERS = [
    { id: 'auto', label: '자동 · Workers AI 무료', short: '자동' },
    { id: 'groq', label: 'Groq (본인 키)', short: 'Groq' },
    { id: 'openai', label: 'OpenAI (본인 키)', short: 'OpenAI' },
    { id: 'gemini', label: 'Google Gemini (본인 키)', short: 'Gemini' },
    { id: 'openrouter', label: 'OpenRouter (본인 키)', short: 'OpenRouter' }
  ];
  let aiConfig = { provider: 'auto', key: '', model: '' };

  /* ── 무료 AI 풀 · 당일 소진 마킹 ────────────────────────────────
     키는 이 브라우저(localStorage)에만 저장한다. 한 프로바이더가 429·4006·quota 를 돌려주면
     그 프로바이더(또는 모델)를 오늘 날짜로 표시해 두고 다음 턴부터 건너뛴다. */
  const LS_POOL = 'acs.ai.v2';
  const LS_QUOTA = 'acs.ai.quota.v1';
  const LS_OLLAMA = 'acs.ollama.v1';
  const AI_POOL_ENDPOINT = '/api/ai-pool';
  const PROVIDER_LABELS = {
    'workers-ai': 'Workers AI', groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter',
    cerebras: 'Cerebras', mistral: 'Mistral', openai: 'OpenAI', ollama: 'Ollama', local: '로컬'
  };
  /* 서버 GET 이 실패해도 풀 목록을 보여 줄 수 있게 두는 기본값. */
  const POOL_FALLBACK = [
    { id: 'workers-ai', label: 'Cloudflare Workers AI', short: 'Workers AI', free: '무료 10,000 neurons/일', keyless: true, models: ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/qwen/qwen3.8-27b', '@cf/google/gemma-4-26b-a4b-it', '@cf/meta/llama-3.1-8b-instruct-fast'] },
    { id: 'groq', label: 'Groq', short: 'Groq', free: '무료 1,000 req/일', keyHint: 'gsk_…', help: 'https://console.groq.com/keys', models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b'] },
    { id: 'gemini', label: 'Google Gemini', short: 'Gemini', free: '무료 티어', keyHint: 'AIza…', help: 'https://aistudio.google.com/app/apikey', models: ['gemini-3.5-flash-lite', 'gemini-3.8-flash'] },
    { id: 'openrouter', label: 'OpenRouter :free', short: 'OpenRouter', free: '무료 :free 모델 50 req/일', keyHint: 'sk-or-…', help: 'https://openrouter.ai/keys', models: ['google/gemma-4-26b-a4b-it:free', 'baidu/ernie-5.5-flash-preview:free', 'nvidia/nemotron-3-ultra-550b-a55b:free'] },
    { id: 'cerebras', label: 'Cerebras', short: 'Cerebras', free: '무료 1M tokens/일', keyHint: 'csk-…', help: 'https://cloud.cerebras.ai/', models: ['llama-3.3-70b'] },
    { id: 'mistral', label: 'Mistral', short: 'Mistral', free: '무료 실험 티어', keyHint: '…', help: 'https://console.mistral.ai/api-keys/', models: ['mistral-small-latest'] },
    { id: 'openai', label: 'OpenAI', short: 'OpenAI', free: '유료(BYOK)', keyHint: 'sk-…', paid: true, help: 'https://platform.openai.com/api-keys', models: ['gpt-4o-mini'] }
  ];
  let poolRows = POOL_FALLBACK.slice();
  let poolState = { keys: {}, usage: {}, probe: {}, ollama: { enabled: false, url: 'http://localhost:11434', model: 'llama3.2' } };
  let poolQuota = { date: '', until: {} };
  let poolBusy = false;

  function todayKey() {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function loadPool() {
    const saved = readJSON(LS_POOL, null);
    if (saved && typeof saved === 'object') {
      poolState = {
        keys: saved.keys && typeof saved.keys === 'object' ? saved.keys : {},
        usage: saved.usage && typeof saved.usage === 'object' ? saved.usage : {},
        probe: {},
        ollama: Object.assign({ enabled: false, url: 'http://localhost:11434', model: 'llama3.2' }, saved.ollama || {})
      };
    }
    const quota = readJSON(LS_QUOTA, null);
    if (quota && quota.date === todayKey() && quota.until && typeof quota.until === 'object') {
      poolQuota = { date: quota.date, until: quota.until };
    } else {
      poolQuota = { date: todayKey(), until: {} };
    }
  }

  function savePool() {
    try {
      localStorage.setItem(LS_POOL, JSON.stringify({ keys: poolState.keys, usage: poolState.usage, ollama: poolState.ollama }));
    } catch (e) { /* 저장 실패는 무시 */ }
  }

  function saveQuota() {
    try { localStorage.setItem(LS_QUOTA, JSON.stringify(poolQuota)); } catch (e) { /* 무시 */ }
  }

  function quotaToday() {
    if (poolQuota.date !== todayKey()) poolQuota = { date: todayKey(), until: {} };
    return poolQuota.until;
  }

  function poolSkip() {
    return Object.keys(quotaToday());
  }

  function markExhausted(list) {
    if (!Array.isArray(list) || !list.length) return;
    const until = quotaToday();
    let changed = false;
    list.forEach((key) => {
      const text = String(key || '').trim();
      if (!text) return;
      until[text] = Date.now();
      changed = true;
    });
    poolQuota.date = todayKey();
    if (changed) { saveQuota(); renderPool(); renderAiStatus(); }
  }

  function resetQuota() {
    poolQuota = { date: todayKey(), until: {} };
    saveQuota();
    renderPool();
  }

  function providerExhausted(id) {
    const until = quotaToday();
    return Object.keys(until).some((key) => key === id || key.indexOf(id + ':') === 0);
  }

  function bumpUsage(provider) {
    if (!provider) return;
    const id = String(provider).replace(/^byok-/, '');
    poolState.usage[id] = (poolState.usage[id] || 0) + 1;
    savePool();
  }

  function providerLabelText(provider) {
    if (!provider) return 'AI';
    if (String(provider).indexOf('byok-') === 0) return 'BYOK · ' + (PROVIDER_LABELS[String(provider).slice(5)] || String(provider).slice(5));
    return PROVIDER_LABELS[provider] || provider;
  }

  function providerBadge(provider) {
    if (!provider) return 'AI';
    if (String(provider).indexOf('byok-') === 0) return providerLabelText(provider);
    return PROVIDER_LABELS[provider] || provider;
  }

  function poolKeys() {
    const out = {};
    Object.keys(poolState.keys || {}).forEach((id) => {
      const key = String(poolState.keys[id] || '').trim();
      if (key) out[id] = key;
    });
    return out;
  }

  function poolSummaryText() {
    const keyed = Object.keys(poolKeys()).length;
    const exhausted = poolRows.filter((row) => providerExhausted(row.id)).length;
    const ollama = poolState.ollama.enabled ? 1 : 0;
    return 'AI ' + (poolRows.length + 1 + ollama) + '개 · 키 ' + keyed + ' · 오늘 소진 ' + exhausted;
  }

  function aiAvailable() {
    return typeof fetch === 'function' && typeof location !== 'undefined' && /^https?:/.test(location.protocol);
  }

  /* 오늘 아직 쓸 수 있는 무료 AI 가 남아 있는가?
     - Workers AI 만 소진돼도 다른 무료 프로바이더(키가 있는 곳)가 남아 있으면 계속 AI 로 시도한다.
     - 모든 곳이 소진됐을 때만 네트워크 왕복 없이 로컬로 간다. */
  function freeProvidersLeft() {
    const rows = (poolRows && poolRows.length ? poolRows : POOL_FALLBACK).filter((row) => {
      if (!row || row.id === 'local' || row.paid) return false;
      if (providerExhausted(row.id)) return false;
      if (row.keyless) return true;                       /* Workers AI — 바인딩 여부는 서버가 판단 */
      if (String((poolState.keys || {})[row.id] || '').trim()) return true;
      return Boolean(row.serverKey || row.available);
    });
    return rows.map((row) => row.id);
  }

  function aiPoolUsable() {
    /* 서버 풀 정보를 아직 못 받았으면 상태를 확신할 수 없으니 시도한다. */
    if (!state.ai.poolLoaded) return true;
    return freeProvidersLeft().length > 0;
  }

  function aiProviderDef(id) {
    return AI_PROVIDERS.find((p) => p.id === (id || aiConfig.provider)) || AI_PROVIDERS[0];
  }

  function loadAiConfig() {
    const saved = readJSON(LS_AI, null);
    if (saved && typeof saved === 'object') {
      aiConfig = {
        provider: AI_PROVIDERS.some((p) => p.id === saved.provider) ? saved.provider : 'auto',
        key: typeof saved.key === 'string' ? saved.key : '',
        model: typeof saved.model === 'string' ? saved.model : ''
      };
    }
    if (aiConfig.provider !== 'auto' && !aiConfig.key) aiConfig.provider = 'auto';
  }

  function saveAiConfig(next) {
    aiConfig = {
      provider: next && AI_PROVIDERS.some((p) => p.id === next.provider) ? next.provider : 'auto',
      key: next && typeof next.key === 'string' ? next.key.trim() : '',
      model: next && typeof next.model === 'string' ? next.model.trim() : ''
    };
    if (aiConfig.provider !== 'auto' && !aiConfig.key) aiConfig.provider = 'auto';
    try { localStorage.setItem(LS_AI, JSON.stringify(aiConfig)); } catch (e) { /* 저장 실패는 무시 */ }
    /* 고정 엔진에 넣은 키는 풀에도 같이 둔다(같은 프로바이더를 두 곳에서 따로 넣지 않게). */
    if (aiConfig.provider !== 'auto' && aiConfig.key) {
      poolState.keys[aiConfig.provider] = aiConfig.key;
      savePool();
      renderPool();
    }
    renderAiStatus();
    return aiConfig;
  }

  /* ── 무료 AI 풀 화면 ────────────────────────────────────────── */
  function poolStatus(def) {
    if (def.id === 'local') return { tone: 'is-local', label: '항상 사용' };
    if (def.id === 'ollama') {
      const probe = poolState.probe.ollama;
      if (!poolState.ollama.enabled) return { tone: 'is-wait', label: '대기' };
      if (probe && probe.ok) return { tone: 'is-ok', label: '연결됨' };
      if (probe && probe.ok === false) return { tone: 'is-warn', label: '연결 안 됨' };
      return { tone: 'is-wait', label: '확인 필요' };
    }
    if (providerExhausted(def.id)) return { tone: 'is-quota', label: '오늘 한도 소진' };
    const probe = poolState.probe[def.id];
    const hasKey = Boolean(String((poolState.keys || {})[def.id] || '').trim()) || Boolean(def.serverKey);
    if (def.keyless) {
      if (probe && probe.ok) return { tone: 'is-ok', label: '연결됨' };
      if (probe && probe.ok === false) return { tone: 'is-warn', label: '연결 안 됨' };
      return def.available === false ? { tone: 'is-warn', label: '미연결' } : { tone: 'is-ok', label: '연결됨' };
    }
    if (!hasKey) return { tone: 'is-wait', label: '키 필요' };
    if (probe && probe.ok) return { tone: 'is-ok', label: '연결됨' };
    if (probe && probe.ok === false) return { tone: 'is-warn', label: '확인 실패' };
    return { tone: 'is-ready', label: def.serverKey ? '서버 키' : '키 저장됨' };
  }

  function renderPool() {
    const list = $('#poolList');
    if (!list) return;
    const rows = poolRows.slice();
    const html = rows.map((def) => {
      const status = poolStatus(def);
      const use = poolState.usage[def.id] || 0;
      const hasInput = !def.keyless;
      const keyValue = String((poolState.keys || {})[def.id] || '');
      return '<div class="pool-row" data-provider="' + esc(def.id) + '">' +
        '<div class="pool-main">' +
        '<span class="pool-dot ' + status.tone + '" aria-hidden="true"></span>' +
        '<div class="pool-id"><b>' + esc(def.label || def.short || def.id) + '</b><span>' + esc(def.free || '') + '</span></div>' +
        '<span class="pool-status ' + status.tone + '">' + esc(status.label) + '</span>' +
        (use ? '<span class="pool-use">' + use + '회</span>' : '') +
        '</div>' +
        (hasInput
          ? '<div class="pool-key"><input data-pool-key="' + esc(def.id) + '" type="password" autocomplete="off" spellcheck="false" placeholder="' + esc((def.keyHint || 'API 키') + ' (이 브라우저에만 저장)') + '" value="' + esc(keyValue) + '" />' +
            (def.help ? '<a href="' + esc(def.help) + '" target="_blank" rel="noopener noreferrer">키 발급 ↗</a>' : '') + '</div>'
          : '') +
        '</div>';
    }).join('');

    const ollama = poolState.ollama;
    const oStatus = poolStatus({ id: 'ollama' });
    const localStatus = poolStatus({ id: 'local' });
    const extra =
      '<div class="pool-row" data-provider="ollama">' +
        '<div class="pool-main">' +
        '<span class="pool-dot ' + oStatus.tone + '" aria-hidden="true"></span>' +
        '<div class="pool-id"><b>로컬 Ollama</b><span>내 컴퓨터 · 무료 · 무제한</span></div>' +
        '<span class="pool-status ' + oStatus.tone + '">' + esc(oStatus.label) + '</span>' +
        '<label class="pool-toggle"><input type="checkbox" id="poolOllamaOn"' + (ollama.enabled ? ' checked' : '') + ' /> 사용</label>' +
        '</div>' +
        '<div class="pool-key"><input id="poolOllamaUrl" autocomplete="off" spellcheck="false" placeholder="http://localhost:11434" value="' + esc(ollama.url || '') + '" />' +
        '<input id="poolOllamaModel" class="pool-model" autocomplete="off" spellcheck="false" placeholder="llama3.2" value="' + esc(ollama.model || '') + '" /></div>' +
      '</div>' +
      '<div class="pool-row is-local" data-provider="local">' +
        '<div class="pool-main">' +
        '<span class="pool-dot ' + localStatus.tone + '" aria-hidden="true"></span>' +
        '<div class="pool-id"><b>로컬 결정론적 엔진</b><span>최후 폴백 · 10턴·리포트·프로젝트를 항상 완성</span></div>' +
        '<span class="pool-status ' + localStatus.tone + '">' + esc(localStatus.label) + '</span>' +
        '</div>' +
      '</div>';
    list.innerHTML = html + extra;
    const summary = $('#poolSummary');
    if (summary) summary.textContent = poolSummaryText();
  }

  function savePoolForm() {
    $$('[data-pool-key]').forEach((input) => {
      const id = input.getAttribute('data-pool-key');
      const value = String(input.value || '').trim();
      if (value) poolState.keys[id] = value;
      else delete poolState.keys[id];
    });
    if ($('#poolOllamaOn')) poolState.ollama.enabled = $('#poolOllamaOn').checked;
    if ($('#poolOllamaUrl')) poolState.ollama.url = String($('#poolOllamaUrl').value || '').trim() || 'http://localhost:11434';
    if ($('#poolOllamaModel')) poolState.ollama.model = String($('#poolOllamaModel').value || '').trim() || 'llama3.2';
    savePool();
    renderPool();
    renderAiStatus();
    showToast('풀 키를 이 브라우저에만 저장했습니다');
  }

  function probePool() {
    if (!aiAvailable() || poolBusy) return Promise.resolve();
    poolBusy = true;
    const note = $('#poolNote');
    if (note) note.textContent = '전체 연결 테스트 중…';
    const targets = poolRows.filter((row) => row.id !== 'local');
    const results = [];
    const run = targets.reduce((chain, def) => chain.then(() => {
      const key = String((poolState.keys || {})[def.id] || '').trim();
      return fetch(AI_POOL_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: def.id, key: key || undefined })
      })
        .then((res) => res.json().catch(() => null))
        .then((data) => {
          poolState.probe[def.id] = { ok: !!(data && data.ok), at: Date.now(), message: (data && data.message) || '' };
          results.push(providerLabelText(def.id) + ' ' + (data && data.ok ? 'OK' : '실패'));
        })
        .catch(() => { poolState.probe[def.id] = { ok: false, at: Date.now(), message: '연결 실패' }; results.push(providerLabelText(def.id) + ' 실패'); });
    }), Promise.resolve());

    return run.then(() => {
      if (!poolState.ollama.enabled) return null;
      const url = String(poolState.ollama.url || 'http://localhost:11434').replace(/\/+$/, '');
      return fetch(url + '/api/tags')
        .then((res) => res.json())
        .then((data) => {
          const models = (data && data.models) || [];
          poolState.probe.ollama = { ok: true, at: Date.now(), models: models.map((m) => m.name).slice(0, 4) };
          results.push('Ollama OK' + (models.length ? ' (' + models.map((m) => m.name).slice(0, 2).join(', ') + ')' : ''));
        })
        .catch(() => { poolState.probe.ollama = { ok: false, at: Date.now() }; results.push('Ollama 연결 안 됨'); });
    }).then(() => {
      poolBusy = false;
      renderPool();
      const okCount = Object.keys(poolState.probe).filter((id) => poolState.probe[id].ok).length;
      if (note) note.textContent = '연결 확인: ' + okCount + '개 응답 · ' + results.join(' · ');
    });
  }

  function plainText(html) {
    return String(html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* AI가 쓴 **굵게** 만 허용하고 나머지는 전부 escape 한다. */
  function richText(text) {
    return esc(text).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }

  function aiMissionPayload(p) {
    return {
      title: p.title,
      goal: p.goal,
      context: p.context || '',
      audience: p.audience || '',
      deadline: p.deadline ? p.deadline.label : '',
      deliverable: p.deliverable || '',
      keywords: p.keywords.slice(0, 6),
      constraints: (p.constraints || []).map((c) => c.label).slice(0, 6),
      kpis: (p.kpis || []).slice(0, 4),
      checks: (p.checks || []).slice(0, 6),
      plan: p.plan,
      steps: (p.steps || []).map((s) => ({ name: s.name, detail: plainText(s.detail).slice(0, 180), when: s.when, owner: s.owner, output: s.output })),
      risks: (p.risks || []).slice(0, 3).map((r) => ({ r: r.r, i: r.i, m: r.m }))
    };
  }

  function aiHistoryPayload() {
    return state.messages.slice(-8).map((m) => ({
      agent: m.agent === 'user' ? '나(사용자)' : ((agentById(m.agent) || {}).name || '에이전트'),
      stage: m.stage || 0,
      text: plainText(m.html).slice(0, 260)
    })).filter((m) => m.text);
  }

  function aiTurnPayload(turn, stage, p, fresh) {
    const a = agentById(turn.agent) || CORE_AGENTS[0];
    return {
      mode: stage >= TURN_TOTAL && !!turn.report ? 'report' : 'turn',
      stage: stage,
      stageName: STAGE_NAMES[clamp(stage - 1, 0, TURN_TOTAL - 1)],
      mission: aiMissionPayload(p),
      agent: {
        id: a.guideId || a.id,
        name: a.name,
        role: a.roleKo,
        sub: a.sub,
        badge: a.tool ? a.tool.badge : '',
        limit: a.tool ? (a.tool.limit || '') : '',
        extra: !a.fixed
      },
      team: teamAgents().map((x) => ({ name: x.name, role: x.roleKo, badge: x.tool ? x.tool.badge : '' })),
      history: aiHistoryPayload(),
      directives: state.feedback.map((f) => f.text).slice(-4),
      directive: fresh || '',
      keys: poolKeys(),
      skip: poolSkip(),
      prefer: aiConfig.provider,
      byok: aiConfig.provider !== 'auto' && aiConfig.key ? { provider: aiConfig.provider, key: aiConfig.key, model: aiConfig.model } : undefined
    };
  }

  function aiRequest(payload) {
    return new Promise((resolve) => {
      let done = false;
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try { if (controller) controller.abort(); } catch (e) { /* 무시 */ }
        resolve({ ok: false, code: 'timeout', message: '응답 시간이 초과되었습니다.' });
      }, AI_TIMEOUT);
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      };
      try {
        fetch(AI_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller ? controller.signal : undefined
        })
          .then((res) => res.json().catch(() => null))
          .then((data) => finish(data || { ok: false, code: 'bad_response', message: '서버 응답을 읽지 못했습니다.' }))
          .catch((err) => finish({ ok: false, code: 'network', message: String((err && err.message) || err) }));
      } catch (err) {
        finish({ ok: false, code: 'network', message: String((err && err.message) || err) });
      }
    });
  }

  function aiTurnHtml(data) {
    const parts = [];
    (data.say || []).forEach((line) => parts.push('<p>' + richText(line) + '</p>'));
    if (data.points && data.points.length) {
      parts.push('<ul class="bullets">' + data.points.map((pt) => '<li>' + (pt.t ? '<b>' + richText(pt.t) + '</b> ' : '') + richText(pt.d || '') + '</li>').join('') + '</ul>');
    }
    if (data.callout && data.callout.text) {
      parts.push('<div class="callout"><b>' + esc(data.callout.label || '판단') + '</b> ' + richText(data.callout.text) + '</div>');
    }
    return parts.join('');
  }

  /* AI 산출물은 기존 산출물 자리의 제목·구성을 유지하고 본문만 AI가 쓴다. */
  function aiArtifacts(data, turn) {
    const local = turn.artifacts || [];
    if (!data.artifact || !data.artifact.markdown) return local;
    const first = local[0];
    const head = first
      ? { title: first.title, content: data.artifact.markdown }
      : { title: data.artifact.title || 'AI 산출물', content: data.artifact.markdown };
    return [head].concat(local.slice(1));
  }

  function mergeAiReport(local, ai, meta) {
    if (!local) return null;
    const r = Object.assign({}, local);
    if (ai.summary) {
      r.summary = Object.assign({}, local.summary, {
        goal: ai.summary.goal || local.summary.goal,
        context: ai.summary.context || local.summary.context,
        criteria: ai.summary.criteria && ai.summary.criteria.length ? ai.summary.criteria : local.summary.criteria
      });
    }
    if (ai.roadmap && ai.roadmap.length >= 2) r.roadmap = ai.roadmap;
    if (ai.risks && ai.risks.length >= 2) r.risks = ai.risks;
    if (ai.checklist && ai.checklist.length >= 3) r.checklist = ai.checklist;
    if (ai.gates && ai.gates.length) r.gates = ai.gates;
    if (ai.next && ai.next.length) r.next = ai.next;
    r.ai = meta;
    return r;
  }

  /** 한 턴을 AI로 시도하고, 실패하면 로컬 턴을 그대로 돌려준다. 절대 reject 하지 않는다. */
  function aiTurn(turn, stage, p, fresh) {
    const started = Date.now();
    const local = (reason) => ({
      turn: turn,
      meta: { source: 'local', provider: 'local', model: '', ms: Date.now() - started, reason: reason || '' }
    });
    if (!aiAvailable()) return Promise.resolve(local('offline'));
    if (!aiPoolUsable()) return Promise.resolve(local('모든 무료 AI 한도 소진 — 00:00 UTC(한국 09:00)에 리셋됩니다.'));
    const payload = aiTurnPayload(turn, stage, p, fresh);
    return aiRequest(payload).then((data) => {
      const ms = Date.now() - started;
      if (data && Array.isArray(data.exhausted) && data.exhausted.length) markExhausted(data.exhausted);
      if (data && data.ok === true) {
        bumpUsage(data.provider);
        const norm = data.mode === 'report' ? data.report : data.turn;
        if (!norm) return local('empty');
        const enriched = Object.assign({}, turn, {
          html: aiTurnHtml(norm) || turn.html,
          artifacts: aiArtifacts(norm, turn)
        });
        if (data.mode === 'report') {
          const localReport = turn.report || buildReportData(p);
          const merged = mergeAiReport(localReport, norm, {
            provider: data.provider || 'workers-ai',
            model: data.model || '',
            ms: data.ms || ms,
            at: Date.now()
          });
          if (merged) enriched.report = merged;
        }
        return {
          turn: enriched,
          meta: { source: 'ai', provider: data.provider || 'workers-ai', model: data.model || '', ms: data.ms || ms, at: Date.now(), reason: '' }
        };
      }
      const reason = (data && (data.message || data.code)) || 'error';
      /* 서버 풀·BYOK 가 모두 실패하면, 사용자가 켜 둔 로컬 Ollama 를 브라우저에서 직접 시도한다. */
      return ollamaTurn(payload, turn).then((ollama) => {
        if (ollama) {
          bumpUsage('ollama');
          const enriched = Object.assign({}, turn, { html: aiTurnHtml(ollama.data) || turn.html });
          return {
            turn: enriched,
            meta: { source: 'ai', provider: 'ollama', model: poolState.ollama.model || '', ms: Date.now() - started, at: Date.now(), reason: '' }
          };
        }
        return local(reason);
      });
    }).catch((err) => local(String((err && err.message) || err)));
  }

  /* 로컬 Ollama — 브라우저가 http://localhost:11434 로 직접 호출. 꺼져 있거나 실패하면 null. */
  function ollamaTurn(payload, turn) {
    const cfg = poolState.ollama;
    if (!cfg || !cfg.enabled) return Promise.resolve(null);
    const base = String(cfg.url || 'http://localhost:11434').replace(/\/+$/, '');
    const mission = payload.mission || {};
    const agent = payload.agent || {};
    const history = (payload.history || []).slice(-3).map((m) => '[' + m.agent + '] ' + m.text).join('\n');
    const prompt = [
      '한국어 협업 시뮬레이터의 ' + (agent.name || '에이전트') + '(' + (agent.role || '') + ')입니다.',
      '과제: ' + mission.title,
      '목표: ' + (mission.goal || ''),
      '배경·제약: ' + (mission.context || ''),
      '이번 턴(' + (payload.stage || 1) + '단계 ' + (payload.stageName || '') + ')에 할 일을 2~3문단으로 씁니다.',
      history ? '이전 발언:\n' + history : '',
      payload.directive ? '사용자 지시: ' + payload.directive : '',
      'JSON 하나만: {"say":["문단","문단"],"points":[{"t":"항목","d":"설명"}],"callout":{"label":"판단","text":"한 문장"}}'
    ].filter(Boolean).join('\n');
    return fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.model || 'llama3.2', stream: false, format: 'json', messages: [{ role: 'user', content: prompt }] })
    })
      .then((res) => res.json())
      .then((data) => {
        const text = data && data.message && data.message.content;
        if (!text) return null;
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
        if (!parsed || typeof parsed !== 'object') return null;
        const say = (parsed.say || []).filter((s) => typeof s === 'string' && s.trim()).map((s) => s.slice(0, 500)).slice(0, 4);
        const points = (parsed.points || []).filter((pt) => pt && (pt.d || pt.t)).map((pt) => ({ t: String(pt.t || '').slice(0, 60), d: String(pt.d || '').slice(0, 240) })).slice(0, 4);
        const callout = parsed.callout && parsed.callout.text ? { label: String(parsed.callout.label || '판단').slice(0, 20), text: String(parsed.callout.text).slice(0, 260) } : null;
        const joined = say.join(' ') + points.map((pt) => pt.t + pt.d).join(' ');
        if ((!say.length && !points.length) || !/[가-힣]/.test(joined)) return null;
        return { data: { say, points, callout } };
      })
      .catch(() => null);
  }

  /** 서버 기능 확인 — 키 없이 Workers AI가 붙어 있는지 + 무료 AI 풀 목록. */
  function probeAi() {
    if (!aiAvailable()) {
      state.ai.ready = false;
      state.ai.reason = '브라우저에서 API를 호출할 수 없습니다.';
      renderAiStatus();
      renderPool();
      return Promise.resolve(false);
    }
    const poolProbe = fetch(AI_POOL_ENDPOINT, { method: 'GET', headers: { accept: 'application/json' } })
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (data && data.ok && Array.isArray(data.pool) && data.pool.length) {
          poolRows = data.pool;
          state.ai.poolLoaded = true;
          renderPool();
        }
        return data;
      })
      .catch(() => null);
    try {
      return fetch(AI_ENDPOINT, { method: 'GET', headers: { accept: 'application/json' } })
        .then((res) => res.json().catch(() => null))
        .then((data) => {
          state.ai.ready = !!(data && data.ok && data.workersAi);
          state.ai.models = (data && data.models) || [];
          if (data && Array.isArray(data.pool)) { poolRows = data.pool; state.ai.poolLoaded = true; renderPool(); }
          if (!state.ai.ready) state.ai.reason = 'Workers AI를 쓸 수 없어 로컬 엔진으로 동작합니다.';
          renderAiStatus();
          probePoolLight();
          return state.ai.ready;
        })
        .catch(() => {
          state.ai.ready = false;
          state.ai.reason = 'API에 연결하지 못해 로컬 엔진으로 동작합니다.';
          renderAiStatus();
          poolProbe.then(() => renderPool());
          return false;
        });
    } catch (e) {
      state.ai.ready = false;
      state.ai.reason = 'API에 연결하지 못해 로컬 엔진으로 동작합니다.';
      renderAiStatus();
      return Promise.resolve(false);
    }
  }

  /* 설정 창을 열었을 때 풀 상태를 가볍게 채운다(실제 호출 없이 서버 정보만). */
  function probePoolLight() {
    if (!aiAvailable()) return;
    fetch(AI_POOL_ENDPOINT, { method: 'GET', headers: { accept: 'application/json' } })
      .then((res) => res.json().catch(() => null))
      .then((data) => {
        if (data && data.ok && Array.isArray(data.pool)) { poolRows = data.pool; state.ai.poolLoaded = true; renderPool(); }
      })
      .catch(() => {});
  }

  function renderAiStatus() {
    const btn = $('#btnAi');
    if (!btn) return;
    const ai = state.ai;
    const label = $('#aiLabel');
    const dot = $('#aiDot');
    let text = 'AI 실시간';
    let tone = 'is-ai';
    let title = '협업 턴을 무료 AI 풀(' + poolRows.length + '개 AI · Workers AI 1순위)이 생성합니다. 한 AI의 당일 할당량이 소진되면 다음 AI가 이어받습니다.';
    if (ai.attempted && ai.source === 'local') {
      text = '로컬 폴백';
      tone = 'is-local';
      title = 'AI 호출이 실패해 기존 엔진으로 이 턴을 만들었습니다 — ' + (ai.reason || '알 수 없는 이유');
    } else if (aiConfig.provider !== 'auto') {
      text = 'AI · ' + aiProviderDef().short;
      tone = 'is-byok';
      title = '내 ' + aiProviderDef().short + ' 키로 협업 턴을 생성합니다. 키는 이 브라우저에만 저장됩니다.';
    } else if (ai.ready === null) {
      text = 'AI 확인 중';
      tone = 'is-checking';
      title = 'AI 연결을 확인하고 있습니다.';
    } else if (!aiPoolUsable()) {
      text = '무료 AI 소진';
      tone = 'is-local';
      title = '무료 AI가 모두 오늘 한도 소진입니다 — 이 턴은 로컬 엔진으로 만들고, 00:00 UTC(한국 09:00)에 자동으로 돌아옵니다. ' + poolSummaryText();
    } else if (ai.ready === false) {
      text = '로컬 엔진';
      tone = 'is-local';
      title = ai.reason || 'AI를 쓸 수 없어 브라우저 내 엔진으로 동작합니다.';
    }
    if (ai.source === 'ai' && ai.attempted) {
      title += ' · 최근 응답 ' + (ai.model || ai.provider) + ' ' + Math.round((ai.ms || 0) / 100) / 10 + '초';
    }
    btn.className = 'ctl ctl-ai ' + tone;
    btn.title = title;
    btn.setAttribute('aria-label', 'AI 설정 — ' + text);
    if (label) label.textContent = text;
    if (dot) dot.className = 'ai-dot ' + tone;
    const status = $('#aiStatus');
    if (status && $('#aiOverlay') && !$('#aiOverlay').hidden) status.textContent = aiStatusText();
  }

  function aiStatusText() {
    if (!aiAvailable()) return '이 환경에서는 API를 호출할 수 없습니다 — 브라우저 내 엔진으로 동작합니다.';
    if (aiConfig.provider !== 'auto') return aiProviderDef().label + ' 키로 호출합니다. 키는 이 브라우저(localStorage)에만 저장됩니다.';
    if (state.ai.ready === null) return 'AI 연결 확인 중…';
    const summary = poolSummaryText();
    if (!aiPoolUsable()) return '무료 AI가 모두 오늘 한도 소진입니다 — 턴은 로컬 엔진으로 만들고, 00:00 UTC(한국 09:00)에 자동 복구됩니다. (' + summary + ')';
    if (state.ai.ready) return '무료 AI 풀 연결됨 — 키 없이 1순위 Workers AI부터 시작하고, 한도가 차면 다음 AI로 넘어갑니다. (' + summary + ')';
    return (state.ai.reason || 'Workers AI를 쓸 수 없어 로컬 엔진으로 동작합니다.') + ' (' + summary + ')';
  }

  function syncAiForm() {
    const provider = $('#aiProvider');
    const key = $('#aiKey');
    const model = $('#aiModel');
    if (!provider) return;
    const byok = provider.value !== 'auto';
    if (key) {
      key.disabled = !byok;
      key.placeholder = byok ? 'API 키 (이 브라우저에만 저장)' : '자동 모드는 키가 필요 없습니다';
    }
    if (model) {
      model.disabled = !byok;
      model.placeholder = byok ? '모델 (선택) · 비우면 기본 모델' : '자동 모드는 서버가 모델을 고릅니다';
    }
    const hint = $('#aiByokHint');
    if (hint) hint.hidden = !byok;
    const status = $('#aiStatus');
    if (status) status.textContent = aiStatusText();
  }

  /* 무료 AI 풀 입력 영역을 화면 가운데로 끌어와 잠깐 강조한다 — 모바일에서 'API 키' 버튼으로 열었을 때
     키를 넣을 곳이 바로 보이도록. */
  function focusPoolArea() {
    const list = $('#poolList');
    if (!list) return;
    try {
      if (typeof list.scrollIntoView === 'function') list.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch (e) { /* 스크롤 미지원 환경은 무시 */ }
    list.classList.remove('is-focus');
    void list.offsetWidth;               /* 애니메이션을 다시 시작하려고 강제 리플로 */
    list.classList.add('is-focus');
    if (typeof list.focus === 'function') {
      try { list.focus({ preventScroll: true }); } catch (e) { /* 포커스 미지원 환경은 무시 */ }
    }
    setTimeout(() => list.classList.remove('is-focus'), 1800);
  }

  function openAiDialog(opts) {
    if (!$('#aiOverlay')) return;
    if ($('#aiProvider')) $('#aiProvider').value = aiConfig.provider;
    if ($('#aiKey')) $('#aiKey').value = aiConfig.key;
    if ($('#aiModel')) $('#aiModel').value = aiConfig.model;
    renderPool();
    syncAiForm();
    $('#aiOverlay').hidden = false;
    probeAi();
    if (opts && opts.focusPool) setTimeout(focusPoolArea, 80);
  }

  function closeAiDialog() {
    if ($('#aiOverlay')) $('#aiOverlay').hidden = true;
  }

  function publicState() {
    return {
      title: state.profile ? state.profile.title : null,
      cursor: state.cursor,
      total: TURN_TOTAL,
      completed: state.completed,
      messages: state.messages.length,
      tasks: state.tasks.map((t) => ({ id: t.id, status: t.status, title: t.title, owner: t.owner })),
      artifacts: state.artifacts.map((a) => a.title),
      feedback: state.feedback.map((f) => f.text),
      hasReport: !!state.report,
      team: teamSummary(),
      profile: state.profile ? {
        domain: state.profile.domain,
        intent: state.profile.intent,
        keywords: state.profile.keywords,
        audience: state.profile.audience,
        deadline: state.profile.deadline,
        constraints: state.profile.constraints,
        measurable: state.profile.measurable
      } : null
    };
  }

  function serialize() {
    const data = {
      id: state.runId,
      createdAt: state.createdAt,
      updatedAt: Date.now(),
      profile: state.profile,
      tasks: state.tasks,
      messages: state.messages,
      artifacts: state.artifacts,
      cursor: state.cursor,
      feedback: state.feedback,
      report: state.report,
      completed: state.completed,
      extras: state.extras
    };
    let clone;
    try { clone = JSON.parse(JSON.stringify(data)); } catch (e) { return data; }
    if (clone.profile) delete clone.profile.pack;
    if (clone.report && clone.report.p) delete clone.report.p.pack;
    return clone;
  }

  function saveSession() {
    if (!state.profile) return;
    try {
      const data = serialize();
      localStorage.setItem(LS_SESSION, JSON.stringify(data));
      saveToHistory(data);
    } catch (e) { /* 저장 공간 부족 시 무시 */ }
  }

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function saveToHistory(data) {
    try {
      const list = readJSON(LS_HISTORY, []);
      const clean = JSON.parse(JSON.stringify(data));
      const idx = list.findIndex((x) => x.id === clean.id);
      if (idx >= 0) list[idx] = clean; else list.unshift(clean);
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      localStorage.setItem(LS_HISTORY, JSON.stringify(list.slice(0, 12)));
    } catch (e) { /* 무시 */ }
  }

  function restoreSession(data) {
    if (!data || !data.profile) return false;
    const pack = PACKS[data.profile.domain] || PACKS.general;
    data.profile.pack = pack;
    state.profile = data.profile;
    state.tasks = data.tasks || [];
    state.messages = data.messages || [];
    state.artifacts = data.artifacts || [];
    state.cursor = data.cursor || 0;
    state.feedback = data.feedback || [];
    state.report = data.report || null;
    state.completed = !!data.completed;
    state.extras = (data.extras || []).filter((e) => { const t = toolById(e.id); return t && t.injectable; });
    stageQueue = [];
    state.runId = data.id || ('run-' + Date.now());
    state.createdAt = data.createdAt || Date.now();
    state.profile.feedbackLog = state.feedback.map((f) => ({ text: f.text, effect: f.effect || '' }));
    return true;
  }

  /* ─────────────────────── 7. 렌더링 ─────────────────────── */
  function agentVars(a) {
    return '--agent-c:' + a.color + ';--agent-soft:' + a.soft + ';--agent-bg:' + a.bg + ';';
  }

  function renderAll() {
    renderMission();
    renderAgents();
    renderFeed();
    renderStage();
    renderTasks();
    renderArtifacts();
    renderMetrics();
    renderControls();
    renderReportButton();
    renderAiStatus();
  }

  function renderMission() {
    const p = state.profile;
    const titleEl = $('#missionTitle');
    const goalEl = $('#missionGoal');
    const stateEl = $('#missionState');
    if (!p) {
      titleEl.textContent = '아직 과제가 없습니다';
      goalEl.textContent = '‘새 과제’에서 목표와 제약을 입력하면 피클이 바로 협업을 시작합니다.';
      $('#missionTags').innerHTML = '';
      $('#missionMeta').innerHTML = '';
      stateEl.textContent = '준비';
      stateEl.className = 'mission-state';
      $('#missionSub').textContent = '피클이 이끄는 리드 · 서브 협업 콘솔';
      return;
    }
    titleEl.textContent = p.title;
    goalEl.textContent = cut(p.goal, 190);
    stateEl.textContent = state.completed ? '완료' : state.busy ? '협업 중' : state.cursor === 0 ? '준비' : '진행 중';
    stateEl.className = 'mission-state' + (state.completed ? ' is-done' : state.cursor > 0 ? ' is-running' : '');
    $('#missionTags').innerHTML = p.keywords.slice(0, 5).map((k, i) => '<span class="tag' + (i === 0 ? ' k' : '') + '">' + esc(k) + '</span>').join('');
    const meta = [];
    meta.push('<span class="meta"><b>' + esc(p.domainLabel) + '</b></span>');
    meta.push('<span class="meta">의도 <b>' + esc(p.intentLabel) + '</b></span>');
    meta.push('<span class="meta">기간 <b>' + esc(p.deadline ? p.deadline.label : '미정') + '</b></span>');
    meta.push('<span class="meta">대상 <b>' + esc(p.audience) + '</b></span>');
    p.constraints.filter((c) => c.type !== 'time').slice(0, 3).forEach((c) => meta.push('<span class="meta">' + esc(c.label) + '</span>'));
    $('#missionMeta').innerHTML = meta.join('');
    $('#missionSub').textContent = p.title.length > 34 ? cut(p.title, 34) : p.title;
  }

  function renderAgents() {
    const wrap = $('#agentList');
    if (!wrap) return;
    const team = teamAgents();
    const hint = $('#agentCountHint');
    if (hint) hint.textContent = team.length + '명';
    const badge = $('#brandBadge');
    if (badge) badge.textContent = team.length + '-에이전트 협업';
    wrap.innerHTML = team.map((a) => {
      const msgs = state.messages.filter((m) => m.agent === a.id).length;
      const doneTasks = state.tasks.filter((t) => t.owner === a.name && t.status === 'done').length;
      const current = state.typingAgent === a.id;
      const status = current ? '작성 중' : state.profile ? (state.completed ? '완료' : '대기') : '대기';
      const pct = contributionPct(a);
      return '<div class="agent' + (current ? ' is-active' : '') + (a.fixed ? '' : ' is-extra') + '" style="' + agentVars(a) + '" data-agent="' + esc(a.id) + '">' +
        '<div class="agent-top">' +
        '<div class="avatar">' + esc(a.initial) + '</div>' +
        '<div class="agent-id"><div class="agent-name">' + esc(a.name) + '<span class="role-pill">' + esc(a.roleKo) + '</span></div>' +
        '<div class="agent-sub">' + esc(a.sub) + '</div>' +
        (a.fixed ? '' : '<span class="agent-badge">' + esc(a.tool ? a.tool.badge : '가이드 투입') + '</span>') +
        '</div></div>' +
        '<div class="agent-foot"><span class="agent-status"><i class="dotl ' + (current ? 'work' : state.profile && state.cursor > 0 ? 'on' : '') + '"></i>' + status + '</span>' +
        '<span class="agent-count">발언 ' + msgs + ' · 기여 ' + pct + '%</span></div>' +
        '</div>';
    }).join('');
    const proto = $('#protocolExtra');
    if (proto) {
      const extras = team.filter((a) => !a.fixed);
      proto.hidden = !extras.length;
      if (extras.length) proto.innerHTML = extras.map((a) => '<li><b>' + esc(a.name) + '</b> ' + esc(a.roleKo)).join('');
    }
  }

  function contributionPct(a) {
    const total = state.messages.length || 0;
    if (!total) return 0;
    const team = teamAgents();
    const score = state.messages.filter((m) => m.agent === a.id).length + state.tasks.filter((t) => t.owner === a.name && t.status === 'done').length * 1.5;
    const all = team.reduce((sum, x) => sum + state.messages.filter((m) => m.agent === x.id).length + state.tasks.filter((t) => t.owner === x.name && t.status === 'done').length * 1.5, 0) || 1;
    return Math.round((score / all) * 100);
  }

  function renderFeed() {
    const feed = $('#chatFeed');
    if (!state.profile) {
      feed.innerHTML = '<div class="feed-empty">' +
        '<div class="empty-badge"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.6"/><circle cx="16" cy="8" r="2.6"/><circle cx="12" cy="16" r="2.6"/><path d="M8 8h8M8 8l2.6 5.6M16 8l-2.6 5.6"/></svg></div>' +
        '<h3>과제를 넣으면 세 에이전트가 바로 시작합니다</h3>' +
        '<p>피클이 목표와 성공 기준을 세우고, 제미나이 태스크가 실행 단계를, 코덱스가 허점과 리스크를 검증합니다. 마지막에 피클이 하나의 결과물로 종합합니다.</p>' +
        '<div class="empty-steps"><span class="empty-step">① 과제 입력</span><span class="empty-step">② 10턴 협업</span><span class="empty-step">③ 최종 결과물</span><span class="empty-step">④ .md · .html 내보내기</span></div>' +
        '<div class="empty-actions"><button type="button" class="btn btn-primary" data-open-new>새 과제 시작</button>' +
        '<button type="button" class="btn" data-open-guide>무료 에이전트 가이드 보기</button></div>' +
        '</div>';
      $('#msgCount').textContent = '0 메시지';
      return;
    }
    if (!state.messages.length) {
      feed.innerHTML = '<div class="feed-empty"><p>협업이 아직 시작되지 않았습니다. ‘자동 진행’ 또는 ‘다음 턴’을 누르세요.</p></div>';
      return;
    }
    feed.innerHTML = state.messages.map((m) => messageHtml(m)).join('');
    feed.scrollTop = feed.scrollHeight;
    $('#msgCount').textContent = state.messages.length + ' 메시지';
  }

  function messageHtml(m) {
    if (m.agent === 'user') {
      return '<div class="msg is-user" style="--agent-c:#5eead4;--agent-soft:rgba(94,234,212,.13)">' +
        '<div class="avatar" style="background:linear-gradient(135deg,#5eead4,#38bdf8);color:#06121a">나</div>' +
        '<div class="msg-body"><div class="msg-meta"><span class="msg-name">나</span><span class="msg-tag">지시</span><span class="msg-time">' + esc(m.time) + '</span></div>' +
        '<div class="bubble">' + m.html + '</div></div></div>';
    }
    const a = agentById(m.agent) || CORE_AGENTS[0];
    const taskOps = (m.tasks || []).map((t) => {
      const task = state.tasks.find((x) => x.id === t.id);
      const label = t.status === 'done' ? '완료' : t.status === 'in_progress' ? '진행 중' : t.status === 'review' ? '검토' : '대기';
      const cls = t.status === 'done' ? 'done' : t.status === 'todo' ? 'todo' : 'now';
      return '<span class="chip-task">' + esc(t.id) + '</span><span class="st ' + cls + '">' + label + '</span>' + (task ? '' : '');
    }).join('<span style="opacity:.3">·</span>');
    const art = (m.artifacts || []).map((x) => '<div><span class="artifact-chip">⌘ ' + esc(x.title) + ' · 산출물에 저장됨</span></div>').join('');
    return '<div class="msg' + (m.agent === 'pickle' ? ' is-lead' : '') + '" style="' + agentVars(a) + '">' +
      '<div class="avatar">' + esc(a.initial) + '</div>' +
      '<div class="msg-body">' +
      '<div class="msg-meta"><span class="msg-name">' + esc(a.name) + '</span>' +
      (m.tag ? '<span class="msg-tag">' + esc(m.tag) + '</span>' : '') +
      (m.ai ? '<span class="msg-ai ' + (m.ai.source === 'ai' ? 'is-ai' : 'is-local') + '" title="' + esc(m.ai.source === 'ai' ? (providerLabelText(m.ai.provider) + (m.ai.model ? ' · ' + m.ai.model : '') + ' · ' + (m.ai.ms ? (Math.round(m.ai.ms / 100) / 10) + '초' : '실시간 생성')) : ('AI 호출 대신 브라우저 내 엔진으로 생성' + (m.ai.reason ? ' · ' + m.ai.reason : ''))) + '">' + (m.ai.source === 'ai' ? esc(providerBadge(m.ai.provider)) : '로컬') + '</span>' : '') +
      '<span class="msg-stage">STEP ' + String(m.stage).padStart(2, '0') + '</span>' +
      '<span class="msg-time">' + esc(m.time) + '</span></div>' +
      '<div class="bubble">' + m.html + art + (taskOps ? '<div class="taskop">태스크 보드 갱신 ' + taskOps + '</div>' : '') + '</div>' +
      '</div></div>';
  }

  function renderStage() {
    const track = $('#stageTrack');
    if (!track.children.length) {
      track.innerHTML = new Array(TURN_TOTAL).fill(0).map((_, i) => '<span class="stage-seg" data-seg="' + i + '"></span>').join('');
    }
    $$('.stage-seg', track).forEach((el, i) => {
      const showNow = i === state.cursor && state.cursor < TURN_TOTAL && (state.cursor > 0 || state.busy);
      el.className = 'stage-seg' + (i < state.cursor ? ' is-done' : showNow ? ' is-now' : '');
    });
    $('#stageName').textContent = state.completed ? '최종 결과물 준비 완료' : state.cursor === 0 ? '대기 중' : STAGE_NAMES[clamp(state.cursor - 1, 0, TURN_TOTAL - 1)];
    $('#stageCount').textContent = state.cursor + ' / ' + TURN_TOTAL;
    const dot = $('#liveDot');
    dot.className = 'live-dot' + (state.busy ? ' busy' : state.cursor > 0 && !state.completed ? ' on' : '');
  }

  function renderTasks() {
    const list = $('#taskList');
    const total = state.tasks.length;
    const done = state.tasks.filter((t) => t.status === 'done').length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('#taskPct').textContent = pct + '%';
    const ring = $('#taskRing');
    ring.style.background = 'conic-gradient(#5eead4 ' + (pct * 3.6) + 'deg, rgba(148,163,184,.16) ' + (pct * 3.6) + 'deg)';
    $('#taskDoneText').textContent = done + ' / ' + total + ' 완료';
    $('#taskHint').textContent = !total ? '협업이 시작되면 태스크가 자동으로 채워집니다' : state.completed ? '모든 태스크가 완료되었습니다' : '협업 진행에 따라 자동 갱신됩니다';
    $('#taskBar').style.width = pct + '%';
    $('#mtabTaskCount').textContent = String(total);
    const labels = { todo: '대기', in_progress: '진행 중', review: '검토 중', done: '완료' };
    list.innerHTML = total ? state.tasks.map((t) => {
      const owner = agentByName(t.owner);
      return '<div class="task" data-status="' + t.status + '" style="' + (owner ? agentVars(owner) : '') + '">' +
        '<div class="task-top"><span class="task-id">' + esc(t.id) + '</span><span class="pill ' + t.status + '">' + labels[t.status] + '</span></div>' +
        '<p class="task-title">' + esc(t.title) + '</p>' +
        '<div class="task-foot"><span class="task-owner"><i></i>' + esc(t.owner) + '</span><span class="task-meta">' + (t.extraFor ? '역할 · ' + esc(t.roleLabel || '투입') : '가중치 ' + t.weight) + '</span></div>' +
        '</div>';
    }).join('') : '<p class="empty-note">태스크 보드가 비어 있습니다.<br>새 과제를 시작하면 6개 태스크가 자동 생성됩니다.</p>';
  }

  function renderArtifacts() {
    const list = $('#artifactList');
    $('#artifactCount').textContent = String(state.artifacts.length);
    if ($('#btnArtifactZip')) $('#btnArtifactZip').disabled = !state.artifacts.length;
    list.innerHTML = state.artifacts.length ? state.artifacts.map((a, i) =>
      '<div class="artifact"><div class="artifact-head"><div class="artifact-name"><b>' + esc(a.title) + '</b><span>' + esc(a.agent || '피클') + ' · ' + esc(a.time || '') + '</span></div>' +
      '<span class="artifact-actions">' +
      '<button type="button" class="mini" data-download-artifact="' + i + '" title="이 산출물을 .md 파일로 내려받기">⬇ .md</button>' +
      '<button type="button" class="mini" data-copy-artifact="' + i + '">복사</button></span></div>' +
      '<pre>' + esc(cut(a.content, 420)) + '</pre></div>'
    ).join('') : '<p class="empty-note">협업이 진행되면 실행 단계 초안, 체크리스트, 실행 브리프, 최종 리포트가 이곳에 쌓입니다.</p>';
  }

  /* 산출물 파일 이름 — 제목을 안전한 파일명으로 바꾸고 순번을 붙인다. */
  function artifactFileName(artifact, index) {
    const base = String((artifact && artifact.title) || 'artifact').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'artifact';
    return String(index + 1).padStart(2, '0') + '-' + base + '.md';
  }

  function artifactFiles() {
    return state.artifacts.map((a, i) => ({ path: artifactFileName(a, i), content: String(a.content || '') }));
  }

  function downloadArtifact(index) {
    const a = state.artifacts[index];
    if (!a) return;
    download(artifactFileName(a, index), String(a.content || ''), 'text/markdown;charset=utf-8');
    showToast('산출물 .md 파일을 받았습니다');
  }

  function downloadArtifactZip() {
    const files = artifactFiles();
    if (!files.length) { showToast('내려받을 산출물이 없습니다'); return; }
    const zip = window.ACSBuild && typeof window.ACSBuild.zipFiles === 'function' ? window.ACSBuild.zipFiles(files) : null;
    if (!zip) {
      /* ZIP 생성기를 쓸 수 없으면 한 파일로 합쳐 내려받는다. */
      download('agent-collab-studio-산출물-' + dateLabel() + '.md', files.map((f) => '# ' + f.path + '\n\n' + f.content).join('\n\n---\n\n'), 'text/markdown;charset=utf-8');
      showToast('산출물을 하나의 .md 파일로 받았습니다');
      return;
    }
    const url = URL.createObjectURL(zip);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent-collab-studio-산출물-' + dateLabel() + '.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    showToast('산출물 ' + files.length + '개를 ZIP으로 받았습니다');
  }

  function renderMetrics() {
    const total = state.messages.length;
    const done = state.tasks.filter((t) => t.status === 'done').length;
    $('#metricMsgs').textContent = String(total);
    $('#metricTasks').textContent = done + ' / ' + state.tasks.length;
    const team = teamAgents();
    const all = team.reduce((s, a) => s + state.messages.filter((m) => m.agent === a.id).length + state.tasks.filter((t) => t.owner === a.name && t.status === 'done').length * 1.5, 0) || 1;
    $('#metricBars').innerHTML = team.map((a) => {
      const msgs = state.messages.filter((m) => m.agent === a.id).length;
      const tk = state.tasks.filter((t) => t.owner === a.name && t.status === 'done').length;
      const pct = Math.round(((msgs + tk * 1.5) / all) * 100);
      return '<div style="' + agentVars(a) + '"><div class="mbar-head"><span>' + esc(a.name) + '</span><b>' + pct + '% <span style="color:#64748b;font-weight:400">(' + msgs + '발언 · ' + tk + '완료)</span></b></div>' +
        '<div class="mbar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('');
    const fb = $('#feedbackList');
    fb.innerHTML = state.feedback.length ? state.feedback.map((f) => '<div class="fb-item">"' + esc(cut(f.text, 90)) + '"<span>' + esc(f.at) + ' · ' + esc(f.effect || '다음 턴 반영') + '</span></div>').join('') : '<p class="metric-note">아직 없습니다. 대화창에 지시를 넣으면 다음 턴에 반영됩니다.</p>';
  }

  function renderControls() {
    const btn = $('#btnAuto');
    const label = $('#autoLabel');
    if (state.autoPlay) {
      btn.classList.add('is-pause');
      label.textContent = '일시정지';
      $('#autoIcon').innerHTML = '<path d="M8 5v14M16 5v14"/>';
    } else {
      btn.classList.remove('is-pause');
      label.textContent = state.completed ? '완료됨' : state.cursor > 0 ? '이어서 진행' : '자동 진행';
      $('#autoIcon').innerHTML = '<path d="M7 4l12 8-12 8z"/>';
    }
    btn.disabled = state.completed;
    $('#btnStep').disabled = state.completed || state.busy;
    $('#speedLabel').textContent = state.speed === 'instant' ? '즉시' : state.speed + 'x';
    $('#btnFocus').className = 'mini' + (state.focus ? ' is-on' : '');
    $('#app').classList.toggle('focus-left', state.focus);
  }

  function renderReportButton() {
    const ready = $('#reportReady');
    if (ready) ready.hidden = !state.report;
    const btn = $('#btnOpenReport');
    if (!btn) return;
    btn.disabled = !state.report;
    btn.textContent = state.report ? '결과물 열기' : '결과물 준비 중';
    $('#reportNote').textContent = state.report
      ? (state.report.ai ? '실제 AI가 협업 기록을 종합했습니다. 과제 요약 · 실행 로드맵 · 리스크 대응 · 체크리스트가 한 문서로 묶였습니다.' : '협업이 끝났습니다. 과제 요약 · 실행 로드맵 · 리스크 대응 · 체크리스트가 한 문서로 묶였습니다.')
      : (state.cursor > 0 ? '10턴이 끝나면 결과물이 생성됩니다. 현재 ' + state.cursor + ' / ' + TURN_TOTAL + '턴.' : '협업이 끝나면 과제 요약 · 실행 로드맵 · 리스크 대응 · 체크리스트가 한 문서로 묶입니다.');
  }

  /* ─────────────────────── 8. 엔진 실행 ─────────────────────── */
  function startMission(input, opts) {
    const o = opts || {};
    stopAuto();
    clearTimeout(typingTimer);
    state.busy = false;
    state.pendingTurn = false;
    const p = analyzeMission(input);
    p.feedbackLog = [];
    state.profile = p;
    state.extras = draftExtras.map((e) => Object.assign({}, e));
    state.tasks = taskDefs(p);
    syncExtraTasks();
    state.messages = [];
    state.artifacts = [];
    state.cursor = 0;
    state.feedback = [];
    state.report = null;
    state.completed = false;
    stageQueue = [];
    state.runId = 'run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    state.createdAt = Date.now();
    pendingFresh = null;
    if (o.silent !== true) {
      switchMobileTab('chat');
      renderAll();
      saveSession();
      if (o.instant) runTurns(TURN_TOTAL, true);
      else startAuto();
    }
    return publicState();
  }

  function addMessage(turn, fresh) {
    const msg = {
      id: 'm' + (state.messages.length + 1) + '-' + Date.now(),
      agent: turn.agent,
      tag: turn.tag,
      stage: turn.stage,
      time: nowTime(),
      html: (fresh ? '<div class="fb-quote">지시 반영 · "' + esc(cut(fresh, 120)) + '"</div>' : '') + turn.html.replace(/^<div class="fb-quote">[\s\S]*?<\/div>/, ''),
      tasks: turn.tasks || [],
      artifacts: turn.artifacts || [],
      ai: turn.ai || null
    };
    state.messages.push(msg);
    (turn.tasks || []).forEach((t) => {
      const task = state.tasks.find((x) => x.id === t.id);
      if (task) task.status = t.status;
    });
    (turn.artifacts || []).forEach((art) => {
      if (state.artifacts.some((x) => x.title === art.title)) return;
      const agent = agentById(turn.agent);
      state.artifacts.push({ title: art.title, content: art.content, agent: agent ? agent.name : '피클', time: msg.time });
    });
    if (turn.report) {
      state.report = turn.report;
      state.report.md = reportMarkdown(turn.report);
      state.report.html = reportHtml(turn.report);
      state.completed = true;
    }
    return msg;
  }

  function executeTurn(instant) {
    if (state.completed) return false;
    if (!state.profile) return false;
    if (!instant && state.pendingTurn) return false;
    if (!stageQueue.length) {
      if (state.cursor >= TURN_TOTAL) return false;
      const nextStage = state.cursor + 1;
      stageFresh = pendingFresh;
      stageQueue = turnsForStage(nextStage, state.profile, stageFresh);
      pendingFresh = null;
    }
    const stage = state.cursor + 1;
    const fresh = stageFresh;
    const turn = stageQueue.shift();
    const lastOfStage = !stageQueue.length;
    if (lastOfStage) stageFresh = null;

    const apply = (enriched) => {
      state.busy = false;
      state.pendingTurn = false;
      addMessage(enriched || turn, fresh);
      if (lastOfStage) state.cursor = stage;
      renderAll();
      saveSession();
      if (state.completed) {
        stopAuto();
        showToast('최종 결과물이 준비되었습니다 — 지표 탭에서 열 수 있습니다');
        renderReportButton();
      }
    };

    if (instant) { apply(Object.assign({}, turn, { ai: turn.ai || { source: 'local', provider: 'local', model: '', ms: 0, reason: '즉시 모드' } })); return true; }

    state.busy = true;
    state.pendingTurn = true;
    showTyping(turn.agent);
    renderStage();
    renderControls();
    renderAiStatus();

    const runToken = state.runId;
    const started = Date.now();
    const speedNum = state.speed === 'instant' ? 12 : state.speed;
    const minDelay = Math.max(0, Math.round(480 / speedNum));
    const finish = (result, meta) => {
      if (runToken !== state.runId) return; /* 새 과제가 시작됐으면 이 응답은 버린다 */
      hideTyping();
      state.ai.attempted = true;
      state.ai.source = (meta && meta.source) || 'local';
      state.ai.provider = (meta && meta.provider) || 'local';
      state.ai.model = (meta && meta.model) || '';
      state.ai.ms = (meta && meta.ms) || 0;
      state.ai.reason = (meta && meta.reason) || '';
      if (state.ai.source === 'ai') state.ai.ready = true;
      const enriched = Object.assign({}, result || turn, { ai: state.ai.source === 'ai' ? { source: 'ai', provider: state.ai.provider, model: state.ai.model, ms: state.ai.ms } : { source: 'local', provider: 'local', model: '', ms: state.ai.ms, reason: state.ai.reason } });
      apply(enriched);
      renderAiStatus();
      if (state.autoPlay && !state.completed) {
        clearTimeout(autoTimer);
        autoTimer = setTimeout(() => executeTurn(false), Math.max(60, Math.round(760 / speedNum)));
      }
    };

    aiTurn(turn, stage, state.profile, fresh).then((res) => {
      const wait = minDelay - (Date.now() - started);
      if (wait > 0) setTimeout(() => finish(res && res.turn, res && res.meta), wait);
      else finish(res && res.turn, res && res.meta);
    }).catch((err) => {
      finish(turn, { source: 'local', provider: 'local', model: '', ms: Date.now() - started, reason: String((err && err.message) || err) });
    });
    return true;
  }

  function runTurns(n, instant) {
    for (let i = 0; i < n; i++) {
      if (state.completed) break;
      let guard = 0;
      do {
        if (!executeTurn(instant)) break;
      } while (stageQueue.length && ++guard < 40);
    }
    return publicState();
  }

  function startAuto() {
    if (!state.profile) { openNewModal(); return; }
    if (state.completed) return;
    state.autoPlay = true;
    renderControls();
    /* 즉시 모드 — AI·턴 딜레이 없이 10턴을 한 번에 마치고 결과물로 바로 간다. */
    if (state.speed === 'instant') {
      runTurns(TURN_TOTAL, true);
      state.autoPlay = false;
      clearTimeout(autoTimer);
      autoTimer = null;
      renderControls();
      showToast('즉시 모드 — 10턴을 한 번에 마쳤습니다. 결과물을 확인하세요');
      return;
    }
    executeTurn(false);
  }
  function stopAuto() {
    state.autoPlay = false;
    clearTimeout(autoTimer);
    autoTimer = null;
    renderControls();
  }
  function toggleAuto() {
    if (state.autoPlay) { stopAuto(); showToast('자동 진행을 멈췄습니다'); }
    else startAuto();
  }

  function showTyping(agentId) {
    const a = agentById(agentId) || CORE_AGENTS[0];
    state.typingAgent = a.id;
    const bar = $('#typingBar');
    const av = $('#typingAvatar');
    av.textContent = a.initial;
    av.style.background = a.bg;
    $('#typingName').textContent = a.name;
    const mode = $('#typingMode');
    if (mode) {
      const live = aiAvailable() && aiConfig.provider !== 'auto' ? aiProviderDef().short + ' AI' : (aiAvailable() && state.ai.ready !== false ? 'AI 실시간' : '로컬 엔진');
      mode.textContent = '· ' + live;
      mode.hidden = false;
    }
    bar.hidden = false;
    $('#liveDot').className = 'live-dot busy';
    renderAgents();
  }
  function hideTyping() {
    $('#typingBar').hidden = true;
    const mode = $('#typingMode');
    if (mode) mode.hidden = true;
    state.busy = false;
    state.typingAgent = null;
    renderAgents();
  }

  /* ─────────────────────── 9. 사용자 개입 ─────────────────────── */
  function interpretFeedback(text, p) {
    const t = String(text || '');
    const changes = [];
    let effect = '다음 턴 계획에 반영';
    if (/(줄|축소|간단|핵심만|반으로|짧게)/.test(t)) {
      p.scopeScale = 0.7;
      p.extraChecks = Array.from(new Set((p.extraChecks || []).concat(['이번 판에서 뺀 항목이 실제로 빠졌는지 확인'])));
      changes.push('범위를 핵심 경로로 축소');
      effect = '이번 판 범위를 축소해 1·2단계 중심으로 재편';
    } else if (/(늘|연장|여유|2주|3주|추가)/.test(t)) {
      if (p.deadline) {
        const nd = Math.min(365, p.deadline.days + 7);
        p.deadline = { days: nd, label: p.deadline.label + ' + 1주', n: p.deadline.n + 1, unit: p.deadline.unit };
      } else {
        p.deadline = { days: 21, label: '3주', n: 3, unit: '주' };
      }
      p.steps = buildSteps(p.pack || PACKS[p.domain] || PACKS.general, p);
      changes.push('기간을 1주 늘려 재일정');
      effect = '기간을 늘려 단계별 시간 재배분';
    } else if (/(예산|비용|무료|돈|0원)/.test(t)) {
      p.extraChecks = Array.from(new Set((p.extraChecks || []).concat(['예산·무료 한도 안에서 대안 1개를 준비'])));
      changes.push('비용 조건 재점검');
      effect = '비용 0원 조건을 체크리스트와 리스크에 재반영';
    } else if (/(초보|직장인|학생|고객|구독자|대상|독자)/.test(t)) {
      const m = t.match(/(초보자|입문자|왕초보|1인\s*개발자|개발자|직장인|학생|대학생|주부|구독자|고객|부모|소상공인|크리에이터)/);
      if (m) { p.audience = m[1]; changes.push('대상을 "' + m[1] + '"로 변경'); effect = '대상 독자를 "' + m[1] + '"로 바꿔 문장·예시 조정'; }
    } else if (/(빠르|먼저|우선|지금)/.test(t)) {
      changes.push('우선순위를 첫 단계로 집중');
      effect = '첫 실행을 앞당기고 나머지 순서 조정';
    }
    if (!changes.length) {
      p.extraChecks = Array.from(new Set((p.extraChecks || []).concat(['사용자 지시 "' + cut(t, 40) + '" 반영 여부를 결과물에서 확인'])));
      changes.push('지시를 체크리스트에 반영');
    }
    return { effect: effect, changes: changes };
  }

  function submitDirective(text) {
    const t = String(text || '').trim();
    if (!t) return;
    if (!state.profile) { showToast('먼저 새 과제를 시작하세요'); return; }
    const r = interpretFeedback(t, state.profile);
    state.feedback.push({ text: t, at: nowTime(), effect: r.effect, changes: r.changes });
    state.profile.feedbackLog = state.feedback.map((f) => ({ text: f.text, effect: f.effect }));
    state.messages.push({
      id: 'u' + Date.now(),
      agent: 'user',
      tag: '지시',
      stage: Math.max(1, state.cursor),
      time: nowTime(),
      html: '<p>' + esc(t) + '</p>' + (r.changes.length ? '<p class="reflect-note" style="margin:6px 0 0;font-size:11px">반영: ' + esc(r.changes.join(' · ')) + '</p>' : '')
    });
    pendingFresh = t;
    renderAll();
    saveSession();
    if (state.completed) {
      // 완료 후 지시: 보완 턴을 한 번 실행해 결과물을 갱신
      state.report = null;
      state.completed = false;
      state.cursor = TURN_TOTAL - 1;
      showToast('지시를 반영해 결과물을 다시 종합합니다');
      executeTurn(false);
      return;
    }
    if (!state.autoPlay && !state.busy) showToast('다음 턴부터 반영됩니다 — ‘다음 턴’을 누르세요');
  }

  /* ─────────────────────── 10. 내보내기 ─────────────────────── */
  function openReport() {
    if (!state.report) return;
    const body = $('#reportBody');
    body.innerHTML = state.report.html || reportHtml(state.report);
    $('#reportOverlay').hidden = false;
  }
  function closeReport() { $('#reportOverlay').hidden = true; }

  function copyMarkdown() {
    if (!state.report) return;
    const md = state.report.md || reportMarkdown(state.report);
    const done = () => showToast('Markdown을 클립보드에 복사했습니다');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(done).catch(() => legacyCopy(md, done));
    } else legacyCopy(md, done);
  }
  function legacyCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { showToast('복사에 실패했습니다'); }
    ta.remove();
  }
  function slug(s) {
    return String(s || 'report').replace(/[^\w가-힣]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'report';
  }
  function downloadMd() {
    if (!state.report) return;
    const md = state.report.md || reportMarkdown(state.report);
    download('agent-collab-studio-' + dateLabel() + '-' + slug(state.profile.title) + '.md', md, 'text/markdown;charset=utf-8');
    showToast('.md 파일을 내려받았습니다');
  }
  function downloadHtml() {
    if (!state.report) return;
    download('agent-collab-studio-' + dateLabel() + '-' + slug(state.profile.title) + '.html', standaloneHtml(state.report), 'text/html;charset=utf-8');
    showToast('.html 보고서를 내려받았습니다');
  }

  /* ─────────────────────── 11. 히스토리 ─────────────────────── */
  function renderHistory() {
    const list = readJSON(LS_HISTORY, []);
    const wrap = $('#historyList');
    if (!list.length) {
      wrap.innerHTML = '<p class="empty-note">아직 저장된 과제가 없습니다.<br>과제를 실행하면 자동으로 이 브라우저에 기록됩니다.</p>';
      return;
    }
    wrap.innerHTML = list.map((h) => {
      const title = (h.profile && h.profile.title) || '제목 없음';
      const when = h.updatedAt ? dateTimeLabel(new Date(h.updatedAt)) : '';
      const donePct = h.tasks && h.tasks.length ? Math.round((h.tasks.filter((t) => t.status === 'done').length / h.tasks.length) * 100) : 0;
      return '<div class="hist-item" data-open-hist="' + esc(h.id) + '">' +
        '<div class="hist-main"><b>' + esc(title) + '</b>' +
        '<span>' + esc((h.profile && h.profile.domainLabel) || '') + ' · ' + esc(when) + ' · 턴 ' + (h.cursor || 0) + '/10 · 태스크 ' + donePct + '%</span></div>' +
        '<span class="hist-badge' + (h.completed ? '' : ' part') + '">' + (h.completed ? '완료' : '진행') + '</span>' +
        '<button type="button" class="hist-del" data-del-hist="' + esc(h.id) + '" aria-label="삭제">✕</button>' +
        '</div>';
    }).join('');
  }
  function openHistory() { renderHistory(); $('#historyOverlay').hidden = false; }
  function closeHistory() { $('#historyOverlay').hidden = true; }
  function openHistoryItem(id) {
    const list = readJSON(LS_HISTORY, []);
    const item = list.find((x) => x.id === id);
    if (!item) return;
    stopAuto();
    restoreSession(item);
    closeHistory();
    renderAll();
    saveSession();
    showToast('저장된 과제로 돌아왔습니다 — ' + (item.cursor || 0) + ' / 10턴');
    return true;
  }
  function deleteHistoryItem(id) {
    const list = readJSON(LS_HISTORY, []).filter((x) => x.id !== id);
    try { localStorage.setItem(LS_HISTORY, JSON.stringify(list)); } catch (e) { /* 무시 */ }
    renderHistory();
    showToast('히스토리에서 삭제했습니다');
  }

  /* ─────────────────────── 12. 새 과제 모달 ───────────────────────
     프리셋 카드는 화면에서 걷어냈다. 과제는 입력창에 직접 쓰는 방식만 남긴다. */
  function openNewModal(prefill) {
    const pre = prefill && typeof prefill === 'object' && prefill.title ? prefill : null;
    modalMode = true;
    if (state.profile) draftExtras = (state.extras || []).map((e) => Object.assign({}, e));
    $('#inputTitle').value = pre ? pre.title : '';
    $('#inputGoal').value = pre ? (pre.goal || '') : '';
    $('#inputContext').value = pre ? (pre.context || '') : '';
    renderTeamUI();
    $('#modal').hidden = false;
    setTimeout(() => (pre ? $('#inputGoal') : $('#inputTitle')).focus(), 60);
  }
  function closeNewModal() { $('#modal').hidden = true; modalMode = false; }

  /* ── 12-0. 팀 구성 UI (모달 + 가이드 드로어) ── */
  let modalMode = false;
  const INJECT_ROLES = () => ROLES.filter((r) => r.kind === 'inject');
  function roleOptionsHtml(selected) {
    return INJECT_ROLES().map((r) => '<option value="' + esc(r.id) + '"' + (r.id === selected ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('') +
      '<option value="custom"' + (selected === 'custom' ? ' selected' : '') + '>직접 입력…</option>';
  }
  function teamRowHtml(e, context) {
    const t = toolById(e.id);
    if (!t) return '';
    const label = roleLabelOf(e.roleId, e.label);
    return '<div class="team-row" data-team-row="' + esc(t.id) + '" style="--tc:' + esc(t.color || '#60a5fa') + '">' +
      '<div class="tr-main"><b>' + esc(t.name) + '</b><span>' + esc(t.badge) + '</span></div>' +
      '<select class="team-role" data-team-role="' + esc(t.id) + '" aria-label="' + esc(t.name) + ' 역할">' + roleOptionsHtml(e.roleId) + '</select>' +
      (e.roleId === 'custom' ? '<input class="team-custom" type="text" data-team-custom="' + esc(t.id) + '" value="' + esc(e.label || '') + '" placeholder="역할 직접 입력" maxlength="24" />' : '') +
      '<button type="button" class="tr-del" data-team-remove="' + esc(t.id) + '" aria-label="' + esc(t.name) + ' 팀에서 빼기">✕</button>' +
      '</div>';
  }
  function teamNoteText() {
    const live = teamIsLive();
    const n = teamList().length;
    if (live) return '협업 중입니다. 추가한 에이전트는 다음 단계부터 역할대로 발언하고 태스크를 맡습니다.' + (state.cursor >= 9 ? ' 지금은 마무리 단계라 다음 과제부터 반영됩니다.' : '');
    if (n) return '추가 ' + n + '명이 기본 3인과 함께 협업합니다. 역할은 드롭다운으로 바꾸거나 직접 입력할 수 있습니다.';
    return '기본 3인(피클 · 제미나이 태스크 · 코덱스)만으로도 실행됩니다. 가이드 에이전트를 더하면 그 역할까지 나눠 맡습니다.';
  }

  function renderTeamUI() {
    const list = teamList();
    const core = $('#teamCore');
    if (core) {
      core.innerHTML = CORE_AGENTS.map((a) => '<span class="core-chip" style="--tc:' + esc(a.color) + '"><b>' + esc(a.name) + '</b>' + esc(a.roleKo) + '<i>고정</i></span>').join('');
    }
    const add = $('#teamAdd');
    if (add) {
      add.innerHTML = INJECTABLE.map((t) => {
        const picked = list.find((e) => e.id === t.id);
        return '<label class="pick' + (picked ? ' is-on' : '') + '" style="--tc:' + esc(t.color || '#60a5fa') + '">' +
          '<input type="checkbox" data-team-pick="' + esc(t.id) + '"' + (picked ? ' checked' : '') + ' />' +
          '<span class="pick-name">' + esc(t.name) + '</span>' +
          '<span class="pick-badge">' + esc(t.badge) + '</span>' +
          '<span class="pick-role">' + esc(roleLabelOf(picked ? picked.roleId : t.role, picked && picked.label)) + '</span>' +
          '</label>';
      }).join('');
    }
    const rows = $('#teamRows');
    if (rows) rows.innerHTML = list.map((e) => teamRowHtml(e)).join('');
    const note = $('#teamNote');
    if (note) note.textContent = teamNoteText();
    const gt = $('#guideTeam');
    if (gt) {
      gt.innerHTML = '<div class="gt-head"><span>현재 팀 <b>' + teamAgents().length + '명</b></span><span>' + (teamIsLive() ? '협업 중 · 바로 반영' : '다음 과제에 적용') + '</span></div>' +
        '<div class="gt-core">' + CORE_AGENTS.map((a) => '<span class="gt-chip">' + esc(a.name) + ' · ' + esc(a.roleKo) + '</span>').join('') +
        list.map((e) => teamRowHtml(e)).join('') + '</div>' +
        (list.length ? '' : '<p class="gt-empty">아직 추가 투입한 에이전트가 없습니다. 카드의 <b>팀에 투입</b>을 누르면 기본 3인과 함께 협업합니다.</p>');
    }
    renderGuideCardState();
  }

  function renderGuideCardState() {
    const list = teamList();
    $$('#guideList .guide-card').forEach((card) => {
      const id = card.getAttribute('data-tool');
      const on = list.some((e) => e.id === id);
      card.classList.toggle('is-on-team', on);
      const btn = card.querySelector('[data-tool-inject]');
      if (btn) btn.textContent = on ? '팀에서 빼기' : '+ 팀에 투입';
    });
  }

  /* ──────────────── 12-1. 무료 에이전트 가이드 ──────────────── */
  const GUIDE_CATS = [
    { id: 'all', label: '전체', color: '#5eead4' },
    { id: 'assistant', label: '개인비서', title: '개인 비서 · 생활 실행형', color: '#5eead4' },
    { id: 'coding', label: '코딩', title: '코딩 · 개발 에이전트', color: '#c4b5fd' },
    { id: 'browser', label: '브라우저', title: '브라우저 자동화형', color: '#60a5fa' },
    { id: 'local', label: '로컬·멀티', title: '로컬 · 멀티 에이전트형', color: '#fbbf24' }
  ];
  let guideCat = 'all';

  const guideCatOf = (id) => GUIDE_CATS.find((c) => c.id === id) || GUIDE_CATS[0];
  const guideByTool = (id) => GUIDE.find((g) => g.id === id) || null;

  function renderGuideFilters() {
    const wrap = $('#guideFilters');
    if (!wrap) return;
    wrap.innerHTML = GUIDE_CATS.map((c) => {
      const n = c.id === 'all' ? GUIDE.length : GUIDE.filter((g) => g.cat === c.id).length;
      const on = guideCat === c.id;
      return '<button type="button" class="gf' + (on ? ' is-on' : '') + '" role="tab" aria-selected="' + (on ? 'true' : 'false') + '" data-guide-cat="' + c.id + '">' +
        esc(c.label) + '<span>' + n + '</span></button>';
    }).join('');
  }

  function guideSummary() {
    const limited = GUIDE.filter((g) => g.free === 'partial').length;
    const sunset = GUIDE.filter((g) => g.status).length;
    return '<span class="gs"><b>' + GUIDE.length + '</b>개 도구</span>' +
      '<span class="gs"><b>4</b>가지 유형</span>' +
      '<span class="gs">무료로 시작 가능</span>' +
      '<span class="gs">무료 범위 제한 <b>' + limited + '</b>개</span>' +
      (sunset ? '<span class="gs gs-warn">종료·전환 예정 <b>' + sunset + '</b>개</span>' : '');
  }

  function guideCardHtml(g) {
    const cat = guideCatOf(g.cat);
    const onTeam = teamList().some((e) => e.id === g.id);
    const missionBtn = '<button type="button" class="btn btn-sm gc-btn" data-tool-mission="' + esc(g.id) + '">이 도구 활용해 과제 만들기</button>';
    const actions = g.injectable
      ? '<div class="gc-actions">' + missionBtn +
        '<button type="button" class="btn btn-sm gc-inject' + (onTeam ? ' is-on' : '') + '" data-tool-inject="' + esc(g.id) + '" aria-pressed="' + (onTeam ? 'true' : 'false') + '">' + (onTeam ? '팀에서 빼기' : '+ 팀에 투입') + '</button></div>'
      : '<div class="gc-actions">' + missionBtn + '<span class="gc-fixed">' + (g.self ? '이 화면 · 팀을 돌리는 곳' : '기본 팀 · 고정') + '</span></div>';
    const sourceLink = g.source
      ? '<a class="gc-src" href="' + esc(g.source) + '" target="_blank" rel="noopener noreferrer" title="' + esc(g.source) + '">공식 출처 ↗</a>'
      : '';
    const statusRibbon = g.status
      ? '<div class="gc-status ' + esc(g.status.tone || 'sunset') + '"><b>' + esc(g.status.label || '') + '</b>' +
        (g.status.note ? '<span>' + esc(g.status.note) + '</span>' : '') + '</div>'
      : '';
    return '<article class="guide-card' + (onTeam ? ' is-on-team' : '') + (g.status ? ' is-sunset' : '') + '" data-tool="' + esc(g.id) + '" data-cat="' + esc(g.cat) + '" data-status="' + esc(g.status ? (g.status.tone || 'sunset') : '') + '" style="--gc:' + cat.color + '">' +
      '<div class="gc-top"><div class="gc-name"><b>' + esc(g.name) + '</b><span>' + esc(g.en) + '</span></div>' +
      '<span class="gc-badge' + (g.free === 'partial' ? ' partial' : '') + (g.status ? ' sunset' : '') + '">' + esc(g.badge) + '</span></div>' +
      statusRibbon +
      '<p class="gc-one">' + esc(g.one) + '</p>' +
      '<div class="gc-free"><span>무료 제공 범위 · 제한</span><p>' + esc(g.scope) + '</p></div>' +
      sourceLink +
      actions +
      '</article>';
  }

  function renderGuide() {
    renderGuideFilters();
    const sum = $('#guideSummary');
    if (sum) sum.innerHTML = guideSummary();
    const list = $('#guideList');
    if (!list) return;
    const groups = guideCat === 'all' ? GUIDE_CATS.filter((c) => c.id !== 'all') : [guideCatOf(guideCat)];
    list.innerHTML = groups.map((c) => {
      const items = GUIDE.filter((g) => g.cat === c.id);
      if (!items.length) return '';
      return '<section class="guide-group" data-guide-group="' + esc(c.id) + '" style="--gc:' + c.color + '">' +
        '<div class="gg-head"><b>' + esc(c.title || c.label) + '</b><span>' + items.length + '개 · 무료 ' + items.filter((g) => g.free === 'free').length + '</span></div>' +
        '<div class="gg-grid">' + items.map(guideCardHtml).join('') + '</div>' +
        '</section>';
    }).join('');
    renderTeamUI();
  }

  function openGuide(cat) {
    if (cat && guideCatOf(cat).id === cat) guideCat = cat;
    renderGuide();
    $('#guideOverlay').hidden = false;
  }
  function closeGuide() { $('#guideOverlay').hidden = true; }
  function applyToolMission(id) {
    const g = guideByTool(id);
    if (!g) return false;
    closeGuide();
    openNewModal(g.mission);
    showToast(g.name + '로 할 과제를 채웠습니다 — 확인하고 협업 시작을 누르세요');
    return true;
  }
  function setGuideCat(cat) {
    guideCat = guideCatOf(cat).id;
    renderGuide();
    return guideCat;
  }

  /* ─────────────────────── 13. 토스트 / 탭 ─────────────────────── */
  let toastTimer = null;
  function showToast(msg) {
    const t = $('#toast');
    $('#toastText').textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function switchRightTab(tab) {
    state.rightTab = tab;
    $$('.rtab').forEach((b) => {
      const on = b.getAttribute('data-rtab') === tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('#tabTasks').hidden = tab !== 'tasks';
    $('#tabArtifacts').hidden = tab !== 'artifacts';
    $('#tabMetrics').hidden = tab !== 'metrics';
    if ($('#tabBuild')) $('#tabBuild').hidden = tab !== 'build';
    if (tab === 'build') renderBuildTab();
  }

  /* 🛠️ 빌드 · 배포 — 과제·리포트를 build.js 모듈에 넘긴다. */
  function buildContext() {
    return {
      mission: state.profile ? aiMissionPayload(state.profile) : null,
      report: state.report || null
    };
  }

  function renderBuildTab() {
    const note = $('#buildTabNote');
    if (!note) return;
    if (!state.profile) {
      note.innerHTML = '협업 과제를 먼저 시작하세요 — 과제 목표·단계·체크리스트가 프로젝트 재료가 됩니다.';
      return;
    }
    note.innerHTML = '<b>' + esc(state.profile.title) + '</b>' + (state.report ? ' · 최종 리포트 반영됨' : ' · 리포트 전이지만 과제 단계로도 만들 수 있습니다');
  }

  function openBuild() {
    if (!window.ACSBuild) { showToast('빌드 모듈을 불러오지 못했습니다'); return; }
    window.ACSBuild.open(buildContext);
    renderBuildTab();
  }

  /* ⚡ 바로 앱 생성 — 10턴 협업을 건너뛰고, 과제 분석 결과만으로 빌드 모달에서 바로 앱을 만든다. */
  function instantAppBuild() {
    const titleEl = $('#inputTitle');
    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) { if (titleEl) titleEl.focus(); showToast('과제 제목을 먼저 입력하세요'); return; }
    const goalEl = $('#inputGoal');
    const contextEl = $('#inputContext');
    const goal = goalEl ? goalEl.value.trim() : '';
    const context = contextEl ? contextEl.value.trim() : '';
    closeNewModal();
    startMission({ title, goal, context }, { silent: true });
    renderAll();
    saveSession();
    if (!window.ACSBuild) { showToast('빌드 모듈을 불러오지 못했습니다'); return; }
    window.ACSBuild.open(buildContext, { autostart: true });
    renderBuildTab();
    showToast('⚡ 10턴 협업을 건너뛰고 바로 앱을 만듭니다');
  }
  function switchMobileTab(tab) {
    state.mobileTab = tab;
    $$('.mtab').forEach((b) => {
      const on = b.getAttribute('data-mobile-tab') === tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const app = $('#app');
    app.classList.toggle('show-agents', tab === 'agents');
    app.classList.toggle('show-workspace', tab === 'workspace');
    if (tab === 'workspace') switchRightTab(state.rightTab);
  }

  /* ─────────────────────── 14. 이벤트 연결 ─────────────────────── */
  function bind() {
    $('#btnAuto').addEventListener('click', toggleAuto);
    $('#btnStep').addEventListener('click', () => {
      if (state.busy) return;
      if (!state.profile) { openNewModal(); return; }
      stopAuto();
      executeTurn(false);
    });
    $('#btnSpeed').addEventListener('click', () => {
      const seq = [1, 2, 4, 'instant'];
      state.speed = seq[(seq.indexOf(state.speed) + 1) % seq.length];
      renderControls();
      showToast(state.speed === 'instant' ? '협업 속도 즉시 — 자동 진행을 누르면 10턴을 한 번에 마칩니다' : '협업 속도 ' + state.speed + 'x');
    });
    $('#btnNew').addEventListener('click', () => openNewModal());
    $('#btnHistory').addEventListener('click', openHistory);
    $('#btnGuide').addEventListener('click', () => openGuide());

    /* AI 설정 · BYOK */
    const btnAi = $('#btnAi');
    if (btnAi) btnAi.addEventListener('click', openAiDialog);
    const btnApiKey = $('#btnApiKey');
    if (btnApiKey) btnApiKey.addEventListener('click', () => openAiDialog({ focusPool: true }));
    const aiClose = $('#btnAiClose');
    if (aiClose) aiClose.addEventListener('click', closeAiDialog);
    const aiOverlay = $('#aiOverlay');
    if (aiOverlay) aiOverlay.addEventListener('click', (e) => { if (e.target === aiOverlay) closeAiDialog(); });
    const aiProvider = $('#aiProvider');
    if (aiProvider) aiProvider.addEventListener('change', syncAiForm);
    const aiSave = $('#aiSave');
    if (aiSave) aiSave.addEventListener('click', () => {
      const next = saveAiConfig({
        provider: $('#aiProvider') ? $('#aiProvider').value : 'auto',
        key: $('#aiKey') ? $('#aiKey').value : '',
        model: $('#aiModel') ? $('#aiModel').value : ''
      });
      closeAiDialog();
      showToast(next.provider === 'auto' ? 'AI 자동 모드(Workers AI)로 돌아갑니다' : aiProviderDef(next.provider).short + ' 키를 이 브라우저에만 저장했습니다');
      if (next.provider === 'auto') probeAi();
    });
    const aiClear = $('#btnAiClear');
    if (aiClear) aiClear.addEventListener('click', () => {
      saveAiConfig({ provider: 'auto', key: '', model: '' });
      if ($('#aiKey')) $('#aiKey').value = '';
      if ($('#aiModel')) $('#aiModel').value = '';
      if ($('#aiProvider')) $('#aiProvider').value = 'auto';
      syncAiForm();
      showToast('저장한 키를 지우고 자동 모드로 돌아왔습니다');
      probeAi();
    });
    const aiTest = $('#btnAiTest');
    if (aiTest) aiTest.addEventListener('click', () => {
      const status = $('#aiStatus');
      if (status) status.textContent = '연결 확인 중…';
      probeAi().then((ok) => {
        if (status) status.textContent = ok ? 'Workers AI 연결됨 — 키 없이 바로 동작합니다' : (state.ai.reason || 'Workers AI를 쓰지 못합니다');
        showToast(ok ? 'Workers AI 연결됨' : 'Workers AI를 쓰지 못해 로컬 엔진으로 동작합니다');
      });
    });
    $('#btnCloseGuide').addEventListener('click', closeGuide);
    $('#guideOverlay').addEventListener('click', (e) => { if (e.target === $('#guideOverlay')) closeGuide(); });
    $('#guideFilters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-guide-cat]');
      if (b) setGuideCat(b.getAttribute('data-guide-cat'));
    });
    $('#guideList').addEventListener('click', (e) => {
      const inj = e.target.closest('[data-tool-inject]');
      if (inj) { toggleToolInTeam(inj.getAttribute('data-tool-inject')); return; }
      const b = e.target.closest('[data-tool-mission]');
      if (b) applyToolMission(b.getAttribute('data-tool-mission'));
    });
    $('#btnGuideFromModal').addEventListener('click', () => { closeNewModal(); openGuide(); });
    $('#btnFocus').addEventListener('click', () => { state.focus = !state.focus; renderControls(); });
    $('#btnClear').addEventListener('click', () => {
      if (!state.profile) return;
      stopAuto();
      state.messages = [];
      state.artifacts = [];
      state.cursor = 0;
      state.completed = false;
      state.report = null;
      state.feedback = [];
      pendingFresh = null;
      state.tasks.forEach((t) => { t.status = 'todo'; });
      renderAll();
      saveSession();
      showToast('대화를 비우고 같은 과제를 처음부터 다시 시작할 수 있습니다');
    });

    $$('.rtab').forEach((b) => b.addEventListener('click', () => switchRightTab(b.getAttribute('data-rtab'))));
    $$('.mtab').forEach((b) => b.addEventListener('click', () => switchMobileTab(b.getAttribute('data-mobile-tab'))));

    $('#composerForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#composerInput');
      const v = input.value.trim();
      if (!v) return;
      input.value = '';
      if (!state.profile) { openNewModal(); return; }
      submitDirective(v);
      if (state.autoPlay && !state.busy && !state.completed) executeTurn(false);
    });

    $$('#chips .chip[data-mention]').forEach((c) => c.addEventListener('click', () => {
      const input = $('#composerInput');
      input.value = (input.value ? input.value + ' ' : '') + c.getAttribute('data-mention') + ' ';
      input.focus();
    }));
    $$('#chips .chip[data-quick]').forEach((c) => c.addEventListener('click', () => {
      const input = $('#composerInput');
      input.value = c.getAttribute('data-quick');
      input.focus();
    }));

    $('#chatFeed').addEventListener('click', (e) => {
      if (e.target.closest('[data-open-new]')) openNewModal();
      else if (e.target.closest('[data-open-guide]')) openGuide();
    });

    $('#artifactList').addEventListener('click', (e) => {
      const dl = e.target.closest('[data-download-artifact]');
      if (dl) { downloadArtifact(parseInt(dl.getAttribute('data-download-artifact'), 10)); return; }
      const b = e.target.closest('[data-copy-artifact]');
      if (!b) return;
      const a = state.artifacts[parseInt(b.getAttribute('data-copy-artifact'), 10)];
      if (!a) return;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(a.content).then(() => showToast('산출물을 복사했습니다')).catch(() => legacyCopy(a.content, () => showToast('산출물을 복사했습니다')));
      else legacyCopy(a.content, () => showToast('산출물을 복사했습니다'));
    });

    $('#btnOpenReport').addEventListener('click', () => { switchRightTab('metrics'); openReport(); });
    if ($('#btnArtifactZip')) $('#btnArtifactZip').addEventListener('click', downloadArtifactZip);
    $('#btnOpenReport2').addEventListener('click', openReport);
    $('#btnCloseReport').addEventListener('click', closeReport);
    $('#reportOverlay').addEventListener('click', (e) => { if (e.target === $('#reportOverlay')) closeReport(); });
    $('#btnCopyMd').addEventListener('click', copyMarkdown);
    $('#btnDownloadMd').addEventListener('click', downloadMd);
    $('#btnDownloadHtml').addEventListener('click', downloadHtml);
    if ($('#btnBuildOpen')) $('#btnBuildOpen').addEventListener('click', openBuild);
    if ($('#btnBuildReport')) $('#btnBuildReport').addEventListener('click', () => { closeReport(); openBuild(); });
    if ($('#poolSave')) $('#poolSave').addEventListener('click', savePoolForm);
    if ($('#poolTest')) $('#poolTest').addEventListener('click', () => { savePoolForm(); probePool(); });
    if ($('#poolReset')) $('#poolReset').addEventListener('click', () => { resetQuota(); showToast('오늘 소진 표시를 초기화했습니다'); });

    $('#btnCloseHistory').addEventListener('click', closeHistory);
    $('#historyOverlay').addEventListener('click', (e) => { if (e.target === $('#historyOverlay')) closeHistory(); });
    $('#historyList').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del-hist]');
      if (del) { e.stopPropagation(); deleteHistoryItem(del.getAttribute('data-del-hist')); return; }
      const item = e.target.closest('[data-open-hist]');
      if (item) openHistoryItem(item.getAttribute('data-open-hist'));
    });

    $('#btnCloseModal').addEventListener('click', closeNewModal);
    $('#modal').addEventListener('click', (e) => { if (e.target === $('#modal')) closeNewModal(); });
    ['#teamAdd', '#teamRows', '#guideTeam'].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      el.addEventListener('change', onTeamChange);
      el.addEventListener('click', onTeamClick);
    });
    $('#formMission').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = $('#inputTitle').value.trim();
      if (!title) { $('#inputTitle').focus(); return; }
      const goal = $('#inputGoal').value.trim();
      const context = $('#inputContext').value.trim();
      closeNewModal();
      startMission({ title, goal, context });
      showToast('과제 분석 완료 — 피클이 협업을 시작합니다');
    });
    if ($('#btnInstantBuild')) $('#btnInstantBuild').addEventListener('click', instantAppBuild);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#reportOverlay').hidden) closeReport();
      else if (!$('#historyOverlay').hidden) closeHistory();
      else if (!$('#guideOverlay').hidden) closeGuide();
      else if ($('#aiOverlay') && !$('#aiOverlay').hidden) closeAiDialog();
      else if (window.ACSBuild && window.ACSBuild.isOpen()) window.ACSBuild.close();
      else if (!$('#modal').hidden) closeNewModal();
    });

    window.addEventListener('beforeunload', saveSession);
  }

  /* ─────────────────────── 15. 부트스트랩 ─────────────────────── */
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    loadAiConfig();
    loadPool();
    bind();
    switchRightTab('tasks');
    switchMobileTab(state.mobileTab);
    const saved = readJSON(LS_SESSION, null);
    if (saved && saved.profile) {
      restoreSession(saved);
      renderAll();
    } else {
      renderAll();
    }
    renderAiStatus();
    renderPool();
    probeAi();
  }

  /* 테스트·검증용 공개 API */
  window.__ACS = {
    analyze: analyzeMission,
    start: (input, opts) => startMission(input, Object.assign({ instant: true, silent: false }, opts || {})),
    step: () => executeTurn(true),
    runAll: () => runTurns(TURN_TOTAL, true),
    state: publicState,
    reportMd: () => (state.report ? (state.report.md || reportMarkdown(state.report)) : null),
    reportHtml: () => (state.report ? (state.report.html || reportHtml(state.report)) : null),
    standalone: () => (state.report ? standaloneHtml(state.report) : null),
    directive: submitDirective,
    openReport: openReport,
    openHistory: openHistory,
    openGuide: openGuide,
    guide: {
      count: () => GUIDE.length,
      categories: () => GUIDE_CATS.map((c) => c.label),
      catIds: () => GUIDE_CATS.map((c) => c.id),
      category: () => guideCat,
      filter: setGuideCat,
      cards: () => GUIDE.map((g) => ({ id: g.id, name: g.name, cat: g.cat, free: g.free, badge: g.badge, scope: g.scope, source: g.source || null, status: g.status ? (g.status.label || '') : null })),
      sunset: () => GUIDE.filter((g) => g.status).map((g) => ({ id: g.id, label: g.status.label, note: g.status.note })),
      missions: () => GUIDE.map((g) => ({ id: g.id, name: g.name, title: g.mission.title, goal: g.mission.goal, context: g.mission.context })),
      visible: () => $$('#guideList .guide-card').length,
      apply: applyToolMission
    },
    historyCount: () => readJSON(LS_HISTORY, []).length,
    restoreLatest: () => { const l = readJSON(LS_HISTORY, []); return l.length ? openHistoryItem(l[0].id) : false; },
    reset: () => { stopAuto(); state.pendingTurn = false; try { localStorage.removeItem(LS_SESSION); } catch (e) {} state.profile = null; state.messages = []; state.tasks = []; state.artifacts = []; state.cursor = 0; state.report = null; state.completed = false; state.feedback = []; state.extras = []; stageQueue = []; renderAll(); },
    TURN_TOTAL: TURN_TOTAL,
    STAGE_NAMES: STAGE_NAMES,
    AGENTS: CORE_AGENTS.map((a) => ({ id: a.id, name: a.name, role: a.roleKo })),
    /* 카탈로그 · 팀 투입 API */
    catalog: {
      version: () => CATALOG.version,
      tools: () => TOOLS.map((t) => ({ id: t.id, name: t.name, cat: t.cat, role: t.role, injectable: t.injectable, self: !!t.self, badge: t.badge, limit: t.limit, source: t.source || null, status: t.status ? (t.status.label || '') : null })),
      injectable: () => INJECTABLE.map((t) => ({ id: t.id, name: t.name, role: t.role, badge: t.badge })),
      roles: () => ROLES.map((r) => ({ id: r.id, label: r.label, kind: r.kind, stages: r.stages })),
      injectRoles: () => INJECT_ROLES().map((r) => r.label),
      roleOf: (id) => { const t = toolById(id); return t ? { id: t.role, label: (roleById(t.role) || {}).label } : null; }
    },
    team: {
      current: () => teamSummary(),
      ids: () => teamAgents().map((a) => a.id),
      extras: () => (teamList() || []).map((e) => ({ id: e.id, roleId: e.roleId, role: roleLabelOf(e.roleId, e.label) })),
      add: (id, roleId) => addTeamAgent(id, roleId),
      remove: (id) => removeTeamAgent(id),
      setRole: (id, roleId, custom) => setTeamRole(id, roleId, custom),
      toggle: (id) => toggleToolInTeam(id),
      draft: (list) => { draftExtras = (list || []).map((e) => Object.assign({}, typeof e === 'string' ? { id: e, roleId: (toolById(e) || {}).role } : e)); return draftExtras.slice(); },
      clearDraft: () => { draftExtras = []; return []; },
      live: () => teamIsLive()
    },
    turnStages: (roleId) => { const r = roleById(roleId); return r ? r.stages.slice() : []; },
    /* AI 실시간 생성 API */
    ai: {
      available: aiAvailable,
      status: () => Object.assign({}, state.ai, {
        provider: aiConfig.provider,
        byok: aiConfig.provider !== 'auto' && !!aiConfig.key,
        ready: state.ai.ready
      }),
      configure: (cfg) => JSON.parse(JSON.stringify(saveAiConfig(cfg || {}))),
      probe: () => probeAi(),
      open: openAiDialog,
      close: closeAiDialog,
      liveStep: () => executeTurn(false),
      pending: () => !!state.pendingTurn,
      messages: () => state.messages.map((m) => ({ agent: m.agent, stage: m.stage, ai: m.ai || null, text: plainText(m.html).slice(0, 120) })),
      missionPayload: () => (state.profile ? aiMissionPayload(state.profile) : null),
      reportAi: () => (state.report ? state.report.ai || null : null),
      /* 무료 AI 풀 */
      poolPayload: () => ({ keys: poolKeys(), skip: poolSkip(), prefer: aiConfig.provider }),
      poolUsable: () => aiPoolUsable(),
      freeProviders: () => freeProvidersLeft(),
      pool: () => ({
        rows: poolRows.map((row) => Object.assign({}, row, { status: poolStatus(row) })),
        keys: Object.keys(poolKeys()),
        usage: Object.assign({}, poolState.usage),
        exhausted: poolSkip(),
        ollama: Object.assign({}, poolState.ollama),
        labels: Object.assign({}, PROVIDER_LABELS)
      }),
      markExhausted: (list) => { markExhausted(list); return poolSkip(); },
      resetQuota: () => { resetQuota(); return poolSkip(); },
      probePool: () => probePool(),
      label: (provider) => providerLabelText(provider),
      badge: (provider) => providerBadge(provider)
    },
    build: {
      open: openBuild,
      close: () => { if (window.ACSBuild) window.ACSBuild.close(); },
      context: buildContext
    },
    instantBuild: instantAppBuild,
    setSpeed: (value) => { state.speed = value; renderControls(); return state.speed; },
    cleanTitle: cleanTitleText
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
