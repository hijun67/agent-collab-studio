# Agent Collab Studio

피클(Lead) · 제미나이 태스크 · 코덱스 세 에이전트가 기본으로 협업하고, **무료 에이전트 가이드의 도구를 팀에 투입해 역할을 나눠 맡길 수 있는** 브라우저 앱입니다. 과제를 넣으면 마지막에 **하나의 결과물**로 종합합니다.

- 라이브: <https://agent-collab-studio.pages.dev>
- 상단 **모드 전환 탭**으로 두 가지를 한 사이트에서 씁니다.
  - **🤖 에이전트 협업** — 20종 무료 에이전트 가이드 · 팀 투입 · **무료 AI 풀 10턴 협업** · 리포트 · **🛠️ 실제 프로젝트 생성 & 배포**
  - **🎨 4컷만화 · 카드뉴스** — 기사 본문 이미지 + 기사 본문 기반 AI 이미지로 4컷만화·카드뉴스 제작
- **v2.2** — **스마트 앱 생성기**. 빌드가 어떤 과제든 "실행 대시보드"만 만들던 문제를 고쳤습니다. 이제 과제 문장의 키워드·의도를 읽어 **실제로 동작하는 웹앱 7종**(포모도로 타이머 · 계산기 · 할 일 트래커 · 플래시카드 퀴즈 · 메모 노트 · 큐레이션 목록 · 실행 대시보드) 중 가장 맞는 것을 만들고, AI가 살아 있을 때도 대시보드가 아니라 과제가 요구한 기능(타이머·계산·추가/삭제·검색·채점·저장)을 구현하도록 프롬프트를 바꿨습니다. 새 과제 모달에 **⚡ 바로 앱 생성** 버튼(10턴 협업 건너뛰고 즉시 빌드)과 협업 속도 **즉시**를 추가했고, 제목과 목표가 붙어 나오던 버그를 없애 `<h1>`·`<title>` 에는 과제 제목만 나옵니다.
- **v2.1** — **☀️ 라이트 / 🌙 다크 모드 전환**. 헤더와 🎨 스튜디오 상단 바의 토글로 바꾸고 `localStorage`(`acs.theme.v1`)에 기억해 새로고침·재방문에도 유지합니다. 기본은 기존 다크 모드이고, 첫 페인트 전 `<head>` 인라인 스크립트로 저장된 테마를 적용해 깜빡임이 없습니다. 모바일 브라우저 상단 바 색(`theme-color`)도 함께 바뀝니다.
- **v2.0** — 무료 AI를 최대한 모아 두고 **당일 할당량이 소진되면 다음 무료 AI가 그 턴을 이어받는 자동 로테이션**과, 계획만 짜는 데서 끝나지 않고 **실제 파일 생성 → 코드 편집·미리보기 → ZIP/GitHub Pages/Cloudflare Pages 배포**까지 실행하는 파이프라인을 추가했습니다.
- 협업 모드는 각 턴의 발언·분석·검증·산출물과 최종 리포트를 **Cloudflare Workers AI 무료 텍스트 모델**로 실제 생성합니다(`/api/collab`). 키 입력 없이 바로 동작하고, 모델·할당량 문제로 실패하면 **브라우저 내 결정론적 엔진**으로 자동 폴백합니다. AI/로컬 여부는 발언마다 배지로 표시합니다.
- 4컷만화·카드뉴스 모드는 Cloudflare Pages Functions(`/api/*`)와 Workers AI를 씁니다. AI가 없거나 실패해도 폴백(시각 사전 프롬프트 · Pollinations · Canvas 아트)으로 끝까지 동작합니다.

## 🤖 에이전트 협업 — 실제 AI 응답

과제를 넣으면 10턴(브리핑 → 과제 분해 → 심층 검증 → 중간 조율 → 수정 실행안 → 품질 게이트 → 산출물 → 실행 체크리스트 → 최종 검증 → 최종 종합)을 실제 AI가 이어갑니다. 담당 에이전트(피클 Lead · 제미나이 태스크 실행 · 코덱스 검증 · 투입 에이전트)마다 인격과 역할을 프롬프트에 넣어, 같은 과제라도 발언의 관점이 다릅니다.

- **입력 문맥** — 과제 제목·목표·배경/제약·대상·기간, 현재 턴 단계명·담당 에이전트·부여된 역할, 이전 발언 요약, 사용자의 중간 개입 지시, 팀 구성(고정 3인 + 투입 에이전트), 참고 실행 단계·지표·리스크.
- **출력** — 문단 2~3개 + 항목 2~4개 + 판단 콜아웃. 산출물이 있는 턴(과제 분해·수정 실행안·실행 브리프·첫 3일)은 Markdown 산출물을 함께 만들고, 마지막 턴은 실행 로드맵·리스크·체크리스트·품질 게이트·다음 단계를 AI가 다시 종합합니다. 결과는 `.md`/`.html` 내보내기에 그대로 들어갑니다.
- **엔진** — `/api/collab` → **무료 AI 풀 자동 로테이션**: Workers AI 4개 모델 → Groq → Gemini → OpenRouter `:free` → Cerebras → Mistral → OpenAI → 로컬 Ollama → 로컬 엔진. 모델이 형식을 깨면 같은 모델에 한 번 더 요청하고, 그래도 안 되면 다음 AI로 넘깁니다.
- **BYOK(선택)** — 헤더 AI 버튼의 **무료 AI 풀**에서 프로바이더별 키를 넣으면 그 AI들이 풀에 합류합니다. 키는 `localStorage`(`acs.ai.v2`)에만 저장되고 서버에 저장하지 않습니다. 고정 엔진(한 AI로만 호출)도 그대로 지원합니다(`acs.ai.v1`).
- **투명한 폴백** — AI 호출이 실패·오프라인·할당량 초과면 기존 결정론적 엔진으로 그 턴을 만들고, 발언마다 `AI` / `로컬` 배지, 헤더에는 `AI 실시간` / `로컬 폴백` / `로컬 엔진` 상태를 표시합니다. 10턴과 리포트는 어떤 경우에도 끝까지 생성됩니다.

## 🧠 무료 AI 풀 — 당일 한도 소진 시 자동 전환

헤더의 **AI** 버튼을 열면 풀 전체가 한 화면에 나옵니다. 각 AI의 무료 범위, 현재 상태(연결됨 / 키 필요 / 오늘 한도 소진 / 확인 실패), 이 브라우저에서 이 AI로 만든 턴 수를 볼 수 있습니다.

| 순서 | AI | 무료 범위 | 키 | 한도 단위 |
|---|---|---|---|---|
| 1 | **Cloudflare Workers AI** | 10,000 neurons/일 | 불필요(서버 바인딩) | 프로바이더 |
| 2 | **Groq** | 1,000 req/일 | BYOK | 모델 |
| 3 | **Google Gemini** | 무료 티어(분당·일일) | BYOK | 모델 |
| 4 | **OpenRouter `:free`** | 무료 50 req/일 | BYOK | 프로바이더 |
| 5 | **Cerebras** | 1M tokens/일 | BYOK | 모델 |
| 6 | **Mistral** | 무료 실험 티어 | BYOK | 모델 |
| 7 | **OpenAI** | 유료(BYOK) | BYOK | 모델 |
| 8 | **로컬 Ollama** | 내 PC · 무제한 | 불필요 | 프로바이더 |
| 9 | **로컬 결정론적 엔진** | 항상 · 무료 | 불필요 | — |

- **소진 감지** — `429`, Workers AI `4006`/`5016`, `quota`, `rate limit`, `insufficient_quota` 같은 응답을 받으면 그 프로바이더(모델 단위 한도면 그 모델)를 **오늘 날짜로 `localStorage`에 표시**하고, **같은 턴을 다음 AI가 즉시 이어서** 만듭니다. 턴이 끊기지 않습니다.
- **요청에 실어 보내는 것** — `keys`(프로바이더별 BYOK 키), `skip`(오늘 소진된 AI), `prefer`(고정 엔진). 서버는 `exhausted`를 돌려주고 브라우저가 오늘 소진으로 기록합니다.
- **표시** — 발언 배지에 실제 응답한 AI(`Workers AI` · `Groq` · `Gemini` · `OpenRouter` · `Ollama` · `로컬`), 툴팁에 모델명·응답 시간. 별도 **오늘 소진 초기화** 버튼으로 표시를 지울 수 있습니다.
- **전체 연결 테스트** — 풀의 각 AI에 아주 작은 요청을 보내 실제 연결을 확인합니다(Workers AI·BYOK는 `/api/ai-pool`, Ollama는 `localhost:11434/api/tags`).
- **Ollama 설정** — `OLLAMA_ORIGINS=https://agent-collab-studio.pages.dev ollama serve` 로 띄우면 브라우저가 직접 호출합니다. https 페이지에서 브라우저가 localhost를 막는 경우가 있으면 협업 턴은 서버 풀을, 프로젝트 생성은 서버 폴백을 씁니다.

## 🛠️ 빌드 · 배포 — 계획이 아니라 실제 파일

협업 화면 오른쪽 **🛠️ 빌드** 탭 또는 최종 리포트의 **실제 프로젝트 생성 & 배포** 버튼으로 엽니다.

1. **프로젝트 생성** — `/api/generate-project` 가 과제·최종 리포트를 무료 AI 풀에 보내 `index.html` · `style.css` · `app.js` · `README.md` 를 실제 동작 코드로 만듭니다. AI가 없거나 형식이 깨져도 **과제 맞춤형 스마트 로컬 생성기**가 같은 파일 세트를 만듭니다(v2.2).
   - **v2.2 — 결과물은 앱이다.** 과제 문장의 키워드·의도를 읽어 7가지 아키타입 중 맞는 것을 고릅니다: `pomodoro`(25/5/15 타이머 + 할 일) · `calculator`(실시간 계산·분해표·기록) · `todo`(우선순위·필터·진행률) · `quiz`(뒤집는 카드·점수·연속 정답) · `notes`(목록+편집기·검색·태그·.md) · `directory`(검색·분류·D-day·북마크·상세) · `dashboard`(계획·점검 과제 전용).
   - 모든 결과물은 4파일·외부 CDN 0개·`localStorage` 저장·다크/라이트 테마·390px 가로 스크롤 0을 지킵니다. 두 단계(markup → logic)로 나눠 만들 때는 markup 단계의 실제 id 목록을 logic 단계 프롬프트에 그대로 넘겨 DOM 계약이 깨지지 않게 했습니다.
2. **파일 · 편집 · 미리보기** — 파일 트리에서 파일을 고르고 코드를 직접 고친 뒤 **적용**하면, 샌드박스 `<iframe srcdoc>` 미리보기에서 CSS/JS가 인라인으로 합쳐져 **즉시 실행**됩니다. 편집한 파일은 ZIP과 배포에 그대로 반영됩니다.
3. **ZIP 다운로드** — 외부 CDN 없이 브라우저에서 직접 만드는 store 방식 ZIP(CRC32·UTF-8 파일명).
4. **GitHub 업로드 + Pages 배포** — 브라우저가 GitHub REST API를 직접 호출합니다: 저장소 생성(`POST /user/repos`, 있으면 재사용) → 모든 파일 커밋(`PUT /contents/{path}`, 기존 파일은 sha로 갱신) → **GitHub Pages 활성화**(`POST /pages`) → `https://{계정}.github.io/{저장소}/` 라이브 URL 표시. 토큰(`repo` 권한)은 이 브라우저(`localStorage`)에만 저장됩니다.
5. **Cloudflare Pages 직접 배포** — `/api/deploy-cf` 프록시가 Direct Upload 6단계(토큰 확인 → 프로젝트 확보 → 업로드 JWT → 자산 업로드 → 해시 등록 → 배포 생성)를 실행하고 `https://{프로젝트}.pages.dev` 를 돌려줍니다. 자산 키는 wrangler와 같은 **`blake3(base64(내용)+확장자)` 32자 해시**(순수 JS BLAKE3 구현)이고, API 토큰은 요청에만 쓰고 저장하지 않습니다.

## 🎨 4컷만화 · 카드뉴스 (통합 스튜디오)

기사 하나를 넣으면 **기사 본문 사진을 정확히 골라** 4컷만화와 카드뉴스(4·6·8·10장)로 만듭니다. 이미지가 부족한 컷·카드는 **기사 본문을 읽어 만든 영문 장면 프롬프트**로 AI 이미지를 생성합니다.

| 단계 | 하는 일 |
|---|---|
| **1. 미러링 허브** | 기사 주소 입력 · 예시 기사 3종 · 분류별 피드(분류당 20건) · 파트너스 고수익 목록. 본문을 직접 붙여넣어도 됩니다. |
| **2. 4컷 만화** | 기사 본문 이미지를 컷에 배치(순서대로/개별 선택)하고 모자란 컷은 AI 이미지로. 실사·지브리풍·웹툰·이슈툰 4가지 화풍, 2×2·세로 1×4 합본, 컷별 해요체 문구, 합본/컷 PNG 저장. |
| **3. 카드뉴스** | 4·6·8·10장, 분할형/전면형, 7가지 테마·비율. **표지부터 마지막 장까지** 기사 본문 이미지와 본문 기반 AI 이미지를 고르게 배치합니다. 카드별 문구 편집·ZIP 저장. |
| **4. 채널** | 6개 채널(쓰레드·X·인스타·유튜브·틱톡·네이버) 문구·해시태그·첫 댓글 링크 패키지, 계정 자동입력, 9:16 슬라이드 영상. |

### 이미지가 좋아진 방식

1. **기사 본문 이미지 정제 추출** (`functions/api/_lib.js`의 `extractArticleImages`) — 본문 영역(`articleBody`·`bo_v_atc`·`article-body` 등)만 보고, 사이드바 추천기사·관련기사 썸네일·광고 배너·기자 프로필·1px 추적 픽셀은 걸러냅니다. 지연 로딩(`data-src`) 사진도 포함하고, 같은 사진의 CDN 중복은 하나로 묶습니다. 브라우저 캔버스에서 CORS 없이 그리도록 `/api/proxy-image`가 base64로 중계합니다.
2. **기사 본문 기반 영문 프롬프트** (`/api/build-prompts`) — 기사 제목·본문을 Workers AI(`@cf/meta/llama-3.2-3b-instruct`, 실패 시 다른 무료 텍스트 모델 → 시각 사전 폴백)로 보내 컷·카드마다 다른 **영문 장면 프롬프트**를 만듭니다. 한글이 섞이면 기사 기준 장면으로 되돌리고, 글자를 그리라는 표현은 걸러냅니다. 결과는 7일 캐시합니다.
3. **이미지 생성** (`/api/generate-image`) — Workers AI `flux-1-schnell` → 무료 Pollinations 순서로 시도하고, 모두 실패하면 스타일별 Canvas 아트로 대체합니다. 이미지에는 글자가 들어가지 않습니다.
4. **카드뉴스 전 카드 배치** — 기사 이미지를 카드 순서대로 먼저 배분하고, 남는 카드만 본문 기반 AI 이미지로 채워 표지에만 몰리지 않게 합니다.

## 에이전트

| 에이전트 | 역할 | 하는 일 |
|---|---|---|
| **피클** | Lead · 총괄 | 목표·제약·성공 기준을 세우고, 두 에이전트의 결과를 조율해 최종 결과물을 도출 |
| **제미나이 태스크** | Sub · 실행 | 5단계 실행 계획, 우선순위, 일정, 체크리스트, 필요 리소스 |
| **코덱스** | Sub · 검증 | 논리적 허점, 리스크 요인, 대안 시나리오, 품질 검증 기준 |
| **+ 투입 에이전트** | Sub · 부여된 역할 | 가이드 20개 중 16개(Google Jules, Google Antigravity, GitHub Copilot Free, Cursor Free, AWS Kiro, OpenCode + Browse, Devin Desktop, Warp Free, Linger, Replit Amuse, Perplexity Comet, ego(lite), Browser Use, Karpo-browser, Ollama, OpenRouter 무료 모델)를 골라 `코드 구현/PR`·`IDE/CLI 실행`·`브라우저 검증`·`로컬 추론/초안`·`리서치/비교`·`스펙 설계`·`문서/정리`·`테스트/QA` 또는 직접 입력한 역할을 맡깁니다 |

## 기능

- **과제 입력** — 제목·목표·배경/제약을 직접 씁니다. 화면에 늘 붙어 있던 추천 과제 카드는 걷어내고 입력창 중심으로 정리했습니다.
- **무료 에이전트 가이드** — 상단 버튼으로 열리는 드로어에서 에이전트 4가지 유형(개인비서 · 코딩 · 브라우저 · 로컬·멀티) 20개 도구를 비교 카드로 봅니다. 카드마다 무료 여부 배지, 무료 제공 범위·제한, 한 줄 특징이 있고, 공식 출처 링크가 있는 카드에는 ‘공식 출처 ↗’가 붙습니다. 종료·전환이 확정된 도구(Google Jules)는 카드에 **읽기 전용 · 2026-12-31 종료 예정** 상태 띠와 붉은 테두리로 표시되고, 요약 줄에 ‘종료·전환 예정’ 개수가 따로 잡힙니다. ‘이 도구 활용해 과제 만들기’는 그 도구에 맞는 과제를 채운 새 과제 창을, **‘+ 팀에 투입’**은 지금 팀(또는 다음 과제)에 그 도구를 합류시킵니다. 드로어 상단의 **현재 팀** 줄에서 역할을 바로 바꾸거나 뺄 수 있고, 유형별 필터(전체/개인비서/코딩/브라우저/로컬·멀티)를 지원합니다.
- **팀 투입 · 역할 부여** — 진입 경로 두 가지. ① **새 과제 창**의 ‘참여 에이전트 · 역할’에서 기본 3인은 고정으로 두고 16개 도구를 체크박스로 더한 뒤 에이전트별 역할을 드롭다운(또는 직접 입력)으로 지정합니다. ② **가이드 드로어**의 카드 버튼으로 실행 중인 과제에도 바로 합류. 투입된 에이전트는 왼쪽 ‘참여 에이전트’ 목록에 이름·무료 배지·부여된 역할로 표시됩니다.
- **투입 에이전트의 실제 협업** — 역할마다 발언 단계가 달라 자기 단계에서 턴을 가집니다(코드 → 과제 분해·수정 실행안, 브라우저 → 심층 검증·품질 게이트, 로컬 → 과제 분해·산출물, 리서치 → 검증·품질 게이트, 스펙 → 분해·품질 게이트, IDE → 수정 실행안·실행 체크리스트, 문서 → 산출물·체크리스트, QA → 검증·최종 검증). 태스크 보드 카드·기여도 지표·산출물·최종 리포트의 ‘참여 에이전트별 역할·산출물’ 표에도 함께 들어갑니다. 늦게 합류해 자기 단계를 놓친 에이전트는 마지막 검증 단계에서 한 번 짚고 마무리합니다.
- **과제 맞춤 협업 엔진** — 10턴: 브리핑 → 과제 분해 → 심층 검증 → 중간 조율 → 수정 실행안 → 품질 게이트 → 산출물 → 실행 체크리스트 → 최종 검증 → 최종 종합
- **AI 실시간 / 로컬 폴백** — 헤더 AI 버튼에서 Workers AI(기본)·OpenAI·Gemini·OpenRouter를 고르고 연결을 확인합니다. 발언마다 `AI`/`로컬` 배지, 응답 중 로딩 표시, 실패해도 멈추지 않는 폴백
- **실시간 제어** — 자동 진행/일시정지, 다음 턴 실행, 속도 1x·2x·4x (진행 중 중복 실행 방지)
- **중간 개입** — 협업 중 지시를 넣으면 다음 턴에 인용과 함께 즉시 반영(범위 축소, 기간 연장, 비용 조건, 대상 변경 등 해석)
- **태스크 보드** — 대기 → 진행 중 → 검토 → 완료 자동 갱신, 진행률, 에이전트 기여도
- **산출물** — 실행 단계 초안, 체크리스트, 실행 브리프, 첫 3일 실행표, 최종 리포트 + 투입 에이전트별 산출물(PR 계획, 화면 검증 시나리오, 비교표, 스펙 문서, 회귀 체크 등)
- **최종 결과물** — 과제 요약 · 실행 로드맵 · 리스크 및 대응책 · 바로 실행할 체크리스트 · 품질 검증 기준, **Markdown 복사 / `.md` / `.html` 보고서** 내보내기
- **히스토리** — localStorage에 실행 기록 저장, 목록에서 다시 열기·삭제
- **반응형** — 1440px 데스크톱과 390px 모바일 모두 가로 오버플로 0

## 동작 방식

1. **분석** — 문장을 토큰화해 조사(을/를, 이/가 …)를 떼고 가중치(제목 3 · 목표 2 · 제약 1.4)로 핵심어를 뽑습니다. 도메인 10종(개발·콘텐츠·마케팅·기획·학습·커리어·재무·건강·여행·행사) 사전과 의도 9종(구축·개선·조사·확산·집필·학습·커리어·비교·계획)을 점수화해 고르고, 기간/예산/인원/도구/대상/금지 조건을 정규식으로 추출합니다.
2. **계획** — 선택된 도메인 지식 팩(5단계·리스크·체크리스트·지표·리소스·리서치·품질 기준)에 추출값을 채워 과제별 단계·일정·시간 상자를 만듭니다. 기간이 짧으면 범위를 자르는 A안, 길면 B안을 기본값으로 잡습니다.
3. **AI 발언** — 분석 결과와 팀 구성을 `/api/collab`으로 보내 그 턴 담당 에이전트의 발언·산출물을 실제 AI로 만듭니다. 실패하면 아래 로컬 규칙 엔진이 같은 턴을 즉시 대신 만듭니다.
4. **검증·종합** — AI의 리스크 지적과 대안을 반영해 결과물 리포트를 Markdown/HTML로 생성합니다. 저장은 `localStorage`(`acs.session.v1`, `acs.history.v1`, `acs.ai.v1`)에만 이뤄집니다.
5. **팀** — 고정 3인에 더해 투입된 에이전트가 자기 역할의 단계에서 발언하고, 태스크 카드와 산출물을 하나씩 맡습니다. 발언·완료 태스크 수가 기여도 지표와 최종 리포트 표에 그대로 반영됩니다.

로컬 규칙 엔진(도메인 지식 팩 · 과제별 단계·리스크·체크리스트)은 AI가 없을 때의 폴백이자, AI 프롬프트에 넣는 참고 계획입니다. 협업 화면은 이 엔진만으로도 10턴·태스크 보드·리포트를 끝까지 만들 수 있습니다.

가이드의 무료 범위·제한 정보와 에이전트 카탈로그는 2026년 11월 기준으로 `agents-catalog.json`에 두었고, 실제 정책은 각 서비스에서 바뀔 수 있습니다.

## 에이전트 카탈로그 (`agents-catalog.json`)

가이드 20개 항목과 팀 투입 역할 8종의 **원본**입니다. 새 에이전트를 추가할 때는 `tools` 배열에 항목(`name`·`cat`·`free`·`badge`·`scope`·`one`·`mission`·`role`·`injectable`·`initial`·`color`·`limit`)을 넣고 `role`에 역할 id를 지정하면 됩니다(`injectable: false`면 가이드에만 보이고 팀에는 들어가지 않습니다). 서비스 종료·전환이 확정된 도구는 `status: { tone, label, note }`를 넣으면 카드에 상태 띠와 붉은 테두리가 붙고 요약줄의 ‘종료·전환 예정’ 개수에 잡힙니다(현재 Google Jules).

`agents-catalog.js`는 JSON을 그대로 옮긴 실행용 사본입니다(파일 하나로 열어도 동작하도록).

```bash
node scripts/catalog.mjs          # JSON → agents-catalog.js 생성
node scripts/catalog.mjs --check  # 둘이 어긋나면 exit 1
```

## 파일

```
index.html        화면 구조 (모드 탭 + 두 모드의 마크업)
app.css           디자인 시스템 · 반응형 · 모드 바
app.js            분석 엔진 · 협업 턴 생성 · 무료 AI 풀 · 리포트 · 팀 투입 · 저장 (협업 모드)
build.js          🛠️ 빌드·배포 패널 — 파일 트리·편집·미리보기·ZIP·GitHub Pages·Cloudflare Pages
mode.js           🤖/🎨 모드 전환, 스튜디오 모듈 지연 로드
agents-catalog.json  에이전트·역할 원본 데이터 (일일 스캔으로 갱신)
agents-catalog.js    위 JSON의 실행용 사본 (자동 생성)
studio/           🎨 4컷만화 · 카드뉴스 스튜디오 (ES 모듈)
  app.js            화면 컨트롤러 (미러링·4컷·카드뉴스·채널)
  plan.js           기사 분석 · 4컷/카드 스토리보드 · 채널 문구
  canvas.js         컷 렌더러(Canvas) · 이미지 로더
  cards.js          카드뉴스 렌더러
  video.js          9:16 슬라이드 영상
  style.css         원본 스타일 (참고용)
  style-scoped.css  #studioRoot 아래로 가둔 배포용 스타일 (자동 생성)
functions/api/    Cloudflare Pages Functions — collab·generate-project·deploy-cf·ai-pool·mirror·feed·build-prompts 등
  collab.js         🤖 협업 턴·최종 리포트 실제 AI 응답 (무료 AI 풀 로테이션 · 로컬 폴백 신호)
  _collab.js        위 함수의 프롬프트·응답 정규화 (Node 테스트와 공유)
  _aiPool.js        무료 AI 풀 정의 · 키 수집 · 시도 순서 · 소진 감지 · 로테이션 엔진
  generate-project.js  협업 과제·리포트 → 실제 프로젝트 파일 세트 (AI → 로컬 폴백)
  _project.js       파일 경로 안전성 · AI 파일 정규화 · 폴백 프로젝트 생성기 · 프롬프트
  deploy-cf.js      Cloudflare Pages Direct Upload 프록시 (토큰 미저장)
  _blake3.js        Pages 자산 키용 순수 JS BLAKE3
  ai-pool.js        풀 현황 GET · 프로바이더별 연결 테스트 POST
wrangler.toml     Pages 설정 · Workers AI 바인딩(AI)
scripts/catalog.mjs  JSON → JS 사본 생성·검사
scripts/scope-css.mjs studio/style.css → style-scoped.css (전역 선택자 격리)
scripts/build.mjs    dist/ 생성 (배포용 파일만 복사)
package.json         npm run build / npm run check
```

## 로컬 실행

```bash
python3 -m http.server 8000      # 또는 아무 정적 서버
# http://localhost:8000
```

## 테스트

`.local-tests/agent-collab-studio/`에 있습니다(저장소에는 포함하지 않음).

```bash
node .local-tests/agent-collab-studio/test.js            # jsdom: 협업 엔진·가이드·팀 투입·모드 탭·Functions 구성 (424개)
node .local-tests/agent-collab-studio/functions.test.mjs  # 본문 이미지 정제 추출·영문 프롬프트·무관 장면 교체·이미지 폴백 (31개)
node .local-tests/agent-collab-studio/collab.test.mjs     # AI 협업 API: 프롬프트·응답 정규화·Workers AI·모델 폴백·BYOK·할당량 안내 (90개)
node .local-tests/agent-collab-studio/ai.test.js          # jsdom: AI 응답 배선·산출물·리포트·폴백·XSS (64개)
node .local-tests/agent-collab-studio/pool.test.mjs       # BLAKE3 벡터·무료 AI 풀 로테이션·/api/collab 전환·/api/generate-project·/api/deploy-cf (136개)
node .local-tests/agent-collab-studio/ui.test.js          # headless: 협업 화면 조작·다운로드·오버플로·콘솔 에러·모드 전환 (138개)
node .local-tests/agent-collab-studio/ui-ai.test.js       # headless: AI 실시간 10턴·산출물·리포트·BYOK·390px·폴백 (38개)
node .local-tests/agent-collab-studio/ui-studio.test.js   # headless: 미러링→4컷→카드뉴스 전 카드 이미지→390px (25개)
node .local-tests/agent-collab-studio/ui-build.test.js    # headless: AI 풀·소진 전환·파일 생성·편집·미리보기·ZIP·GitHub Pages·Cloudflare·390px (60개)
node .local-tests/agent-collab-studio/ui-theme.test.js    # headless: 다크/라이트 토글 동기화·FOUC·390px (71개)
node .local-tests/agent-collab-studio/v22-ui.test.js      # headless: ⚡ 바로 앱 생성 · 즉시 협업 속도 · 제목/목표 분리 (19개)
node .local-tests/agent-collab-studio/v22-apps.test.js    # headless: 폴백 생성 앱 7종 실제 조작(타이머·할일·계산·퀴즈·노트·목록·대시보드)·390px·콘솔 오류 (46개)
node --test tests/archetypes.test.mjs                     # 저장소 단위 테스트: 아키타입 분류·생성기 구조·제목/목표 버그·프롬프트·API (13개)
```

Playwright 테스트는 이 환경의 Chromium 라이브러리 경로가 필요합니다: `LD_LIBRARY_PATH=/workspace/tmp-acs/libs node ...`

## 배포

```bash
npm run build
npx wrangler pages deploy dist --project-name agent-collab-studio --branch main
```

Cloudflare Pages 프로젝트 `agent-collab-studio`에 정적 자산과 `functions/`를 함께 업로드합니다. Workers AI 바인딩(`AI`)은 `wrangler.toml`의 `[ai]`로 선언하며, 대시보드 **Settings → Functions → AI bindings**에도 `AI`가 있어야 `/api/build-prompts`·`/api/generate-image`가 Workers AI를 씁니다(없으면 폴백).
