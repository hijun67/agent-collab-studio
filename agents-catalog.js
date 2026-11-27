/* 자동 생성 파일 — 원본은 agents-catalog.json 입니다. 직접 고치지 마세요. */
window.ACS_CATALOG = {
  "version": "2.6.0",
  "updated": "2026-11-27",
  "note": "무료 에이전트 가이드(GUIDE) 30개 항목과 팀 투입 역할 정의. 일일 스캔은 tools 배열에 항목을 추가하고 injectable·role을 지정하면 된다. status(tone·label·note)가 있으면 카드에 상태 띠로 표시된다.",
  "roles": [
    {
      "id": "lead",
      "label": "총괄",
      "kind": "fixed",
      "hint": "목표·조율·최종 종합",
      "stages": [
        1,
        4,
        7,
        10
      ],
      "task": "범위·성공 기준 확정과 최종 종합",
      "output": "최종 결과물 리포트"
    },
    {
      "id": "exec",
      "label": "실행",
      "kind": "fixed",
      "hint": "실행 분해·일정·리소스",
      "stages": [
        2,
        5,
        8
      ],
      "task": "실행 5단계·일정 설계",
      "output": "실행 단계 초안·체크리스트"
    },
    {
      "id": "verify",
      "label": "검증",
      "kind": "fixed",
      "hint": "허점·리스크·품질 기준",
      "stages": [
        3,
        6,
        9
      ],
      "task": "리스크·품질 게이트 검증",
      "output": "리스크 점검·품질 기준"
    },
    {
      "id": "code",
      "label": "코드 구현/PR",
      "kind": "inject",
      "hint": "저장소를 고쳐 PR로 넘김",
      "stages": [
        2,
        5
      ],
      "task": "코드 변경 PR 3건 생성·셀프 리뷰",
      "output": "PR 3건 링크와 변경 요약"
    },
    {
      "id": "ide",
      "label": "IDE/CLI 실행",
      "kind": "inject",
      "hint": "편집기·터미널에서 직접 실행",
      "stages": [
        5,
        8
      ],
      "task": "IDE·CLI 실행 순서와 오류 수정 기록",
      "output": "실행 명령 순서와 오류 수정 로그"
    },
    {
      "id": "browser",
      "label": "브라우저 검증",
      "kind": "inject",
      "hint": "화면·로그인 흐름을 직접 확인",
      "stages": [
        3,
        6
      ],
      "task": "실제 화면 시나리오 3건 검증",
      "output": "화면 검증 시나리오와 확인 결과"
    },
    {
      "id": "local",
      "label": "로컬 추론/초안",
      "kind": "inject",
      "hint": "내 PC 모델로 초안·요약 생성",
      "stages": [
        2,
        7
      ],
      "task": "로컬 모델로 초안 3편 생성",
      "output": "로컬 모델 초안 3편"
    },
    {
      "id": "research",
      "label": "리서치/비교",
      "kind": "inject",
      "hint": "여러 서비스의 조건·가격 비교",
      "stages": [
        3,
        6
      ],
      "task": "무료 조건·가격 비교표 1장",
      "output": "무료 조건 비교표 1장"
    },
    {
      "id": "spec",
      "label": "스펙 설계",
      "kind": "inject",
      "hint": "요구사항을 스펙 문서로 고정",
      "stages": [
        2,
        6
      ],
      "task": "스펙 문서 3장(범위·인터페이스·완료 조건)",
      "output": "스펙 문서 3장"
    },
    {
      "id": "docs",
      "label": "문서/정리",
      "kind": "inject",
      "hint": "문서·안내문 정리",
      "stages": [
        7,
        8
      ],
      "task": "결과물 문서·README 정리",
      "output": "README·브리프 정리본"
    },
    {
      "id": "qa",
      "label": "테스트/QA",
      "kind": "inject",
      "hint": "재현·회귀 테스트로 확인",
      "stages": [
        3,
        9
      ],
      "task": "재현 절차·회귀 체크 12건 실행",
      "output": "회귀 체크 12건 결과"
    }
  ],
  "core": [
    "pickle",
    "gemini",
    "codex"
  ],
  "tools": [
    {
      "id": "pickle",
      "cat": "assistant",
      "name": "피클",
      "en": "Pickle",
      "free": "free",
      "badge": "무료 플랜",
      "one": "일정·웹·메일·생활 행정·배포까지 직접 처리하는 개인 비서형 에이전트.",
      "scope": "무료 플랜 제공 · 브라우저·일정·메일·생활 행정·사이트 배포를 도구로 직접 실행",
      "mission": {
        "title": "피클로 생활 행정 5건 일괄 처리",
        "goal": "2주 안에 미뤄 둔 서류 제출·예약·문의 5건을 피클에게 맡겨 직접 끝낸다",
        "context": "무료 플랜, 하루 30분, 예산 0원, 결제·계약은 본인 승인 후 진행"
      },
      "agentId": "pickle",
      "injectable": false,
      "self": false,
      "initial": "피",
      "color": "#5eead4",
      "limit": "",
      "role": "lead"
    },
    {
      "id": "gemini-tasks",
      "cat": "assistant",
      "name": "제미나이 태스크",
      "en": "Gemini Tasks",
      "free": "free",
      "badge": "무료 (2026-11 오픈)",
      "one": "조사·정리·일정처럼 반복되는 작업을 대신 실행하는 구글의 작업 실행 에이전트.",
      "scope": "2026년 11월부터 한국 포함 무료 사용자에게도 오픈 · 구글 계정으로 사용",
      "mission": {
        "title": "제미나이 태스크로 주간 조사 업무 자동화",
        "goal": "3주 안에 매주 반복되는 시장 조사 3건을 제미나이 태스크에 맡겨 보고서 초안까지 받는다",
        "context": "구글 계정 무료 사용, 평일 저녁 하루 1시간, 예산 0원, 조사 주제는 생활 금융"
      },
      "agentId": "gemini",
      "injectable": false,
      "self": false,
      "initial": "G",
      "color": "#60a5fa",
      "limit": "",
      "role": "exec"
    },
    {
      "id": "codex",
      "cat": "coding",
      "name": "코덱스",
      "en": "Codex · ChatGPT Free",
      "free": "partial",
      "badge": "부분 무료",
      "one": "코드를 읽고 고치고 테스트까지 돌리는 코딩 에이전트.",
      "scope": "ChatGPT 무료 플랜 데스크톱 앱에서 사용 가능 · 웹·CLI·IDE 확장은 유료",
      "mission": {
        "title": "코덱스 무료판으로 4컷 생성기 버그 3건 수정",
        "goal": "1주 안에 4컷 생성기의 이미지 저장·중복 클릭·모바일 레이아웃 문제 3건을 고쳐 다시 배포한다",
        "context": "ChatGPT 무료 플랜 데스크톱 앱만 사용, 평일 저녁 하루 2시간, 예산 0원, 코드는 GitHub 저장소 그대로"
      },
      "agentId": "codex",
      "injectable": false,
      "self": false,
      "initial": "C",
      "color": "#c4b5fd",
      "limit": "",
      "role": "verify"
    },
    {
      "id": "antigravity",
      "cat": "coding",
      "name": "Google Antigravity",
      "en": "Antigravity",
      "free": "partial",
      "badge": "주간 무료 할당량",
      "one": "편집기 안에서 계획·실행·검증을 나눠 돌리는 구글의 에이전트 IDE·CLI. 11월 30일부터 무료 플랜은 Gemini 4 Hydrogen 한 종만 쓴다.",
      "scope": "주간 무료 할당량 제공 · 할당량을 다 쓰면 다음 주기까지 대기 · 2026-11-30부터 Free·AI Plus 플랜에서 Claude Sonnet/Opus 4.6 · GPT-OSS-120b · Gemini 4 Argon · Gemini 3.8 Flash가 빠지고 기본 모델 Gemini 4 Hydrogen만 남음(계획·실행 모두 Hydrogen, 주간 한도는 그대로)",
      "mission": {
        "title": "Antigravity 주간 할당량으로 뉴스 검색 앱 개선",
        "goal": "1주 안에 뉴스 검색 앱에 필터 1개를 추가하고 주간 무료 할당량 안에서 테스트까지 끝낸다",
        "context": "주간 무료 할당량만 사용, 무료 모델은 Gemini 4 Hydrogen 한 종, 평일 저녁 하루 1시간, 예산 0원, Windows 데스크톱"
      },
      "agentId": "antigravity",
      "injectable": true,
      "self": false,
      "initial": "A",
      "color": "#c4b5fd",
      "limit": "주간 무료 할당량",
      "role": "ide",
      "source": "https://antigravity.google/docs/models"
    },
    {
      "id": "jules",
      "cat": "coding",
      "name": "Google Jules",
      "en": "Jules",
      "free": "free",
      "badge": "읽기 전용 · 12/31 종료",
      "status": {
        "tone": "sunset",
        "label": "읽기 전용 · 2026-12-31 종료 예정",
        "note": "2026-11-11부터 읽기 전용으로 전환, 12-31 서비스 종료 후 Google Antigravity로 통합. Jules Tools로 세션·메모리·설정 내보내기만 가능"
      },
      "one": "GitHub 저장소를 맡기면 비동기로 고쳐 오던 코딩 에이전트. 지금은 읽기 전용이고 12월 31일에 끝난다.",
      "scope": "무료는 하루 15개 태스크였고, 2026-11-11부터 읽기 전용 · 2026-12-31 서비스 종료(Google Antigravity 통합) · 남은 기간에는 기존 세션 마무리와 Jules Tools 데이터 내보내기만 가능",
      "mission": {
        "title": "Jules 세션·설정을 Antigravity로 옮기기",
        "goal": "12월 31일 전에 Jules Tools로 세션·메모리·설정을 내 PC에 내보내고, 남은 작업을 Antigravity에서 이어 갈 목록으로 정리한다",
        "context": "Jules는 읽기 전용, 내보내기는 Jules Tools(npm), 평일 저녁 하루 30분, 예산 0원"
      },
      "agentId": "jules",
      "injectable": true,
      "self": false,
      "initial": "J",
      "color": "#c4b5fd",
      "limit": "읽기 전용 · 12/31 종료",
      "role": "code",
      "source": "https://jules.google/docs/changelog"
    },
    {
      "id": "copilot",
      "cat": "coding",
      "name": "GitHub Copilot Free",
      "en": "Copilot Free",
      "free": "free",
      "badge": "무료 티어",
      "one": "편집기 자동완성과 제한된 에이전트에, 크롬 확장으로 내 브라우저까지 조종하는 무료 티어.",
      "scope": "월 2,000회 자동완성 + 제한된 에이전트 사용 · 카드 등록 없이 시작 · 2026-11-17부터 Chrome 확장 연동 Browser Use(브라우저 제어) 퍼블릭 프리뷰",
      "mission": {
        "title": "Copilot 무료로 블로그 도구 리팩토링",
        "goal": "2주 안에 블로그 이전 도구의 중복 코드 3곳을 정리하고 자동완성 월 한도 안에서 마무리한다",
        "context": "월 2,000회 자동완성 한도, VS Code, 평일 저녁 하루 1시간, 예산 0원"
      },
      "agentId": "copilot",
      "injectable": true,
      "self": false,
      "initial": "C",
      "color": "#c4b5fd",
      "limit": "월 2,000회 자동완성",
      "role": "code",
      "source": "https://github.blog/changelog/2026-11-17-let-github-copilot-interact-with-your-browser/"
    },
    {
      "id": "cursor",
      "cat": "coding",
      "name": "Cursor Free",
      "en": "Cursor",
      "free": "free",
      "badge": "무료 티어",
      "one": "AI가 처음부터 붙어 있는 코드 에디터의 무료 티어.",
      "scope": "무료 티어 제공 · 고급 모델·에이전트 요청은 월 한도 안에서 사용",
      "mission": {
        "title": "Cursor 무료 티어로 랜딩 페이지 1장 만들기",
        "goal": "1주 안에 랜딩 페이지 1장을 Cursor로 작성하고 모바일 화면까지 확인한다",
        "context": "무료 티어 한도, 하루 1시간, 예산 0원, 정적 HTML/CSS"
      },
      "agentId": "cursor",
      "injectable": true,
      "self": false,
      "initial": "Cu",
      "color": "#c4b5fd",
      "limit": "무료 티어 월 한도",
      "role": "ide"
    },
    {
      "id": "kiro",
      "cat": "coding",
      "name": "AWS Kiro",
      "en": "Kiro",
      "free": "free",
      "badge": "무료 · 월 50크레딧",
      "one": "스펙을 먼저 쓰게 하는 스펙 주도 개발 IDE.",
      "scope": "월 50크레딧 제공 · 소진되면 다음 달까지 대기",
      "mission": {
        "title": "Kiro 월 50크레딧으로 스펙 문서 3장 작성",
        "goal": "이번 달 안에 다음 기능 스펙 문서 3장을 Kiro로 작성하고 크레딧 50개 안에서 끝낸다",
        "context": "월 50크레딧, 주말 하루 2시간, 예산 0원"
      },
      "agentId": "kiro",
      "injectable": true,
      "self": false,
      "initial": "K",
      "color": "#c4b5fd",
      "limit": "월 50크레딧",
      "role": "spec"
    },
    {
      "id": "opencode",
      "cat": "coding",
      "name": "OpenCode + Browse",
      "en": "OpenCode · MIT",
      "free": "free",
      "badge": "오픈소스 MIT",
      "one": "터미널에서 돌리는 오픈소스 코딩 에이전트. v2.4.0은 내 브라우저 로그인을 그대로 물려받았고, 이번 주 말까지 Hy4 Flash를 전용 무료로 쓴다.",
      "scope": "MIT 오픈소스 무료 · 계정 없이 무료 모델, 로컬 모델·다른 구독 연동 · v2.4.0 내장 데스크톱 브라우저가 Chrome·Edge·Firefox·Safari의 로그인·히스토리를 가져와 내가 열어 둔 탭을 그대로 읽고 조작(프로필 유지, 크로미움 확장 설치) · /automation으로 타이머·크론·MCP 이벤트에 프롬프트·스크립트·셸 명령 실행 · 로그인·2FA·결제는 사용자에게 넘김 · 2026-11-26 공지로 Hy4 Flash 모델이 이번 주 말까지 OpenCode 전용 무료(하루 10T tokens 처리량)로 제공",
      "mission": {
        "title": "OpenCode + Browse로 버그 2건 고치고 화면 확인",
        "goal": "1주 안에 OpenCode로 저장소 버그 2건을 고치고 OpenCode Browse로 로그인된 화면을 직접 확인해 배포한다",
        "context": "MIT 오픈소스 무료, 계정 없이 무료 모델, 하루 1시간, 예산 0원, 로그인·결제는 직접"
      },
      "agentId": "opencode",
      "injectable": true,
      "self": false,
      "initial": "OC",
      "color": "#c4b5fd",
      "limit": "MIT 무료 · 로컬 모델",
      "role": "code",
      "source": "https://opencode.ai/changelog/v2.4.0"
    },
    {
      "id": "devin-desktop",
      "cat": "coding",
      "name": "Devin Desktop",
      "en": "구 Windsurf",
      "free": "free",
      "badge": "무료 $0",
      "one": "Windsurf가 이름을 바꾼 AI 코드 에디터. Tab 자동완성은 무제한이고, 12월 8일까지 새 SWE-2.1 모델을 무료로 쓴다.",
      "scope": "$0 Free 플랜(카드 불필요) · 무제한 Tab 자동완성·인라인 편집 + 일·주간으로 리셋되는 무료 에이전트 할당량(무료는 SWE 계열 모델만) · 2026-11-24 출시 SWE-2.1과 Cerebras 기반 SWE-2.1 Ultrafast가 2026-12-08까지 Devin Desktop과 CLI에서 무료",
      "mission": {
        "title": "Devin Desktop 무료 할당량으로 랜딩 페이지 다듬기",
        "goal": "2주 안에 Devin Desktop Free로 랜딩 페이지 문구와 레이아웃을 다듬고 모바일 화면까지 확인한다",
        "context": "무료 에이전트 할당량, Tab 자동완성 무제한, 평일 저녁 하루 1시간, 예산 0원"
      },
      "agentId": "devin-desktop",
      "injectable": true,
      "self": false,
      "initial": "DD",
      "color": "#c4b5fd",
      "limit": "무료 에이전트 할당량",
      "role": "ide",
      "source": "https://devin.ai/pricing"
    },
    {
      "id": "warp-free",
      "cat": "coding",
      "name": "Warp Free",
      "en": "Warp Agent CLI",
      "free": "free",
      "badge": "무료 $0",
      "one": "명령을 알아서 채워 주는 AI 터미널. 어느 터미널에서든 Warp Agent CLI로 같은 에이전트를 쓴다.",
      "scope": "$0 Free 플랜(카드 불필요) · AI 터미널 + Warp Agent CLI · 내 API 키(BYOK)·ChatGPT 구독으로 추론하고 더 쓸 땐 30일 주기로 정산되는 종량 결제",
      "mission": {
        "title": "Warp Agent CLI로 반복 배포 명령 3개 묶기",
        "goal": "1주 안에 Warp 터미널과 Warp Agent CLI로 반복 배포 명령 3개를 워크플로우로 묶어 실행한다",
        "context": "무료 플랜, 내 API 키(BYOK) 사용, 하루 30분, 예산 0원, 로컬에서만 실행"
      },
      "agentId": "warp-free",
      "injectable": true,
      "self": false,
      "initial": "W",
      "color": "#c4b5fd",
      "limit": "BYOK 무료 · 종량제",
      "role": "ide",
      "source": "https://www.warp.dev/pricing"
    },
    {
      "id": "comet",
      "cat": "browser",
      "name": "Perplexity Comet",
      "en": "Comet",
      "free": "free",
      "badge": "무료 다운로드",
      "one": "탭을 읽고 클릭·입력까지 대신하는 AI 브라우저 에이전트.",
      "scope": "무료로 내려받아 사용 · ChatGPT Work · Claude in Chrome은 유료",
      "mission": {
        "title": "Comet으로 경쟁사 가격 조사 자동화",
        "goal": "1주 안에 경쟁 서비스 5곳의 가격·무료 조건을 Comet으로 훑어 비교표 1장으로 만든다",
        "context": "무료 브라우저, 하루 30분, 예산 0원, 결제·로그인은 하지 않음"
      },
      "agentId": "comet",
      "injectable": true,
      "self": false,
      "initial": "Pe",
      "color": "#60a5fa",
      "limit": "무료 브라우저",
      "role": "browser"
    },
    {
      "id": "browser-use",
      "cat": "browser",
      "name": "Browser Use",
      "en": "browser-use",
      "free": "free",
      "badge": "오픈소스 MIT",
      "one": "파이썬으로 브라우저 조작을 자동화하는 오픈소스 라이브러리.",
      "scope": "MIT 라이선스로 직접 실행 · 클라우드는 가입 시 1달러 무료 크레딧",
      "mission": {
        "title": "Browser Use로 반복 조회 스크립트 만들기",
        "goal": "2주 안에 매일 확인하는 사이트 3곳을 자동으로 조회해 결과를 CSV로 남기는 스크립트를 만든다",
        "context": "오픈소스 MIT, 파이썬, 하루 1시간, 예산 0원, 클라우드는 무료 크레딧만"
      },
      "agentId": "browser-use",
      "injectable": true,
      "self": false,
      "initial": "B",
      "color": "#60a5fa",
      "limit": "오픈소스 · 무료 크레딧 1달러",
      "role": "browser"
    },
    {
      "id": "ollama",
      "cat": "local",
      "name": "Ollama + 오픈 모델",
      "en": "Ollama · Qwen 등",
      "free": "free",
      "badge": "완전 무료 · 로컬",
      "one": "내 PC·맥에서 오픈 모델을 무제한으로 돌리는 로컬 실행기.",
      "scope": "내 PC·맥에서 실행 · API 비용 0원, 모델 크기만큼 메모리 필요",
      "mission": {
        "title": "Ollama 로컬 모델로 블로그 초안 3편 생성",
        "goal": "2주 안에 Ollama와 Qwen 모델로 블로그 초안 3편을 만들고 발행 가능한 수준까지 다듬는다",
        "context": "내 PC에서 실행, API 비용 0원, 하루 1시간, 16GB 메모리"
      },
      "agentId": "ollama",
      "injectable": true,
      "self": false,
      "initial": "O",
      "color": "#fbbf24",
      "limit": "로컬 실행 · API 비용 0원",
      "role": "local"
    },
    {
      "id": "openrouter",
      "cat": "local",
      "name": "OpenRouter 무료 모델",
      "en": "OpenRouter",
      "free": "free",
      "badge": "무료 티어",
      "one": "여러 모델을 한 API로 갈아 쓰는 라우터의 무료 모델.",
      "scope": "무료 모델 기준 분당 20회 · 하루 50회",
      "mission": {
        "title": "OpenRouter 무료 모델로 뉴스 요약 실험",
        "goal": "1주 안에 OpenRouter 무료 모델 2개로 뉴스 요약 품질을 비교하고 쓸 모델 1개를 고른다",
        "context": "분당 20회·일 50회 한도, 하루 30분, 예산 0원"
      },
      "agentId": "openrouter",
      "injectable": true,
      "self": false,
      "initial": "Or",
      "color": "#fbbf24",
      "limit": "분당 20회·하루 50회",
      "role": "research"
    },
    {
      "id": "agent-collab-studio",
      "cat": "local",
      "name": "Agent Collab Studio",
      "en": "이 화면",
      "free": "free",
      "badge": "무료 · 설치 불필요",
      "one": "피클·제미나이 태스크·코덱스가 역할을 나눠 협업하는 다중 에이전트 워크플로우.",
      "scope": "API 키 0원 · 브라우저에서 바로 실행, 대화·결과물은 이 브라우저에만 저장",
      "mission": {
        "title": "Agent Collab Studio로 3자 협업 과제 설계",
        "goal": "이번 주 안에 실제로 진행할 과제 2개를 10턴 협업으로 돌려 실행안과 체크리스트를 뽑는다",
        "context": "API 키 0원, 브라우저만 사용, 하루 30분, 역할 분담은 피클·제미나이 태스크·코덱스"
      },
      "agentId": "agent-collab-studio",
      "injectable": false,
      "self": true,
      "initial": "AC",
      "color": "#5eead4",
      "limit": "",
      "role": "exec"
    },
    {
      "id": "linger",
      "cat": "local",
      "name": "Linger",
      "en": "Linger · 로컬 개인 에이전트",
      "free": "free",
      "badge": "오픈소스 · 로컬 무료",
      "one": "내 PC에서 125B급 모델을 돌려 토큰 비용 0원으로 움직이는 오픈소스 개인 에이전트.",
      "scope": "오픈소스 · PolyStrata 엔진으로 12GB GPU·64GB RAM에서 125B MoE 실행(로컬 추론이라 토큰 비용 0원) · macOS(Apple silicon)·Windows·Linux 패키지, Intel Mac은 Docker Compose · 위키 메모리·Chrome/데스크톱 제어·team.md 멀티 에이전트·백그라운드 위임",
      "mission": {
        "title": "Linger 로컬 모델로 메일 분류 위키 만들기",
        "goal": "2주 안에 Linger를 내 PC에 설치하고 밤마다 메일·회의를 위키 페이지로 정리해 다음 날 검색되는 상태까지 만든다",
        "context": "로컬 추론만 사용(토큰 비용 0원), 12GB GPU·64GB RAM, 하루 1시간, 데이터는 기기 밖으로 내보내지 않음"
      },
      "agentId": "linger",
      "injectable": true,
      "self": false,
      "initial": "L",
      "color": "#fbbf24",
      "limit": "로컬 추론 · 토큰 비용 0원",
      "role": "local",
      "source": "https://github.com/simplexai-labs/linger"
    },
    {
      "id": "ego-lite",
      "cat": "browser",
      "name": "ego(lite)",
      "en": "ego lite · Chromium",
      "free": "free",
      "badge": "무료 · 계정 불필요",
      "one": "이미 로그인된 내 크롬을 그대로 물려받아, 쓰던 사이트에서 에이전트가 대신 클릭·입력하는 무료 크로미움 브라우저.",
      "scope": "무료 앱(계정·구독·태스크 요금 없음, 계정가입 불필요) · macOS(Intel·Apple silicon)·Windows(베타), Linux는 예정 · 크롬 탭·북마크·비밀번호·확장·쿠키·프로필 복사(크롬 원본은 그대로) · /ego-browser 스킬로 Claude Code·Codex·Cursor·Gemini CLI 등 로컬 에이전트 연결, 에이전트마다 별도 Space에서 병렬 실행 · 모델·에이전트 비용은 본인 부담",
      "mission": {
        "title": "ego(lite)로 로그인된 사이트 조사 자동화",
        "goal": "1주 안에 ego lite에 크롬 데이터를 옮기고, 이미 로그인된 사이트 2곳의 자료 조사를 Codex에 /ego-browser로 맡겨 비교표로 받는다",
        "context": "무료 앱, 평일 저녁 하루 30분, 결제·삭제는 직접, 모델 비용은 쓰던 구독 안에서"
      },
      "agentId": "ego-lite",
      "injectable": true,
      "self": false,
      "initial": "E",
      "color": "#60a5fa",
      "limit": "무료 앱 · 모델 비용 별도",
      "role": "browser",
      "source": "https://lite.ego.app"
    },
    {
      "id": "amuse",
      "cat": "assistant",
      "name": "Replit Amuse",
      "en": "Amuse · Apache-2.0",
      "free": "partial",
      "badge": "오픈소스 · 셀프호스트",
      "one": "내 컴퓨터에서 혼자 돌아가는 개인 비서. 웹 조사·실시간 브라우저·알림·작은 앱을 맡고, 보내기·결제 전엔 승인 카드를 띄운다.",
      "scope": "Apache-2.0 오픈소스 · Docker Compose로 내 PC(127.0.0.1 전용, 로그인 없음)에 셀프호스트 · OpenAI API 키(BYOK)와 PostgreSQL 필요, 일 사용량 한도(기본 2,000 units)에서 자동 정지 · 승인 카드, 로컬 암호화 볼트, 웹 조사 출처, 리마인더·백그라운드 점검",
      "mission": {
        "title": "Amuse를 내 PC에 세우고 아침 점검 맡기기",
        "goal": "1주 안에 Docker로 Amuse를 띄우고 매일 아침 사이트 3곳을 확인해 중요한 것만 알려 주는 점검을 붙인다",
        "context": "OpenAI API 키(BYOK), 일 사용량 한도 2,000 units, 127.0.0.1 로컬 실행, 보내기·결제는 승인 카드로 직접"
      },
      "agentId": "amuse",
      "injectable": true,
      "self": false,
      "initial": "Am",
      "color": "#5eead4",
      "limit": "셀프호스트 · OpenAI 키 필요",
      "role": "local",
      "source": "https://github.com/replit/amuse"
    },
    {
      "id": "karpo-browser",
      "cat": "browser",
      "name": "Karpo-browser",
      "en": "Karpo · Apache-2.0",
      "free": "partial",
      "badge": "오픈소스 · System 1+2",
      "one": "클릭·입력 같은 단계는 27B 결정 모델이, 계획과 판단은 내 에이전트가 맡는 오픈소스 브라우저 에이전트.",
      "scope": "Apache-2.0 오픈소스(npm 설치·Chrome/CDP 연결, Node 22.18+) · System 1에 Karpo Decision 27B Act 가중치 공개, System 2는 Claude Code·Codex·MCP 클라이언트 · 공개 벤치마크 Browserbase v2 102개 과제에서 89%·과제당 201초·$0.096 · 결정 모델(System 1)과 System 2 모델 사용료는 본인 키로 지불",
      "mission": {
        "title": "Karpo-browser로 20단계 예약 조사 줄이기",
        "goal": "2주 안에 karpo-browser를 설치해 20단계가 넘는 웹 과제 2건을 돌리고 단계당 시간·비용을 기록한다",
        "context": "오픈소스 무료, System 1은 OpenRouter 결정 모델 키, 로컬 Chrome 연결, 과제당 예산 0.1달러"
      },
      "agentId": "karpo-browser",
      "injectable": true,
      "self": false,
      "initial": "Kp",
      "color": "#60a5fa",
      "limit": "오픈소스 · 모델 비용 별도",
      "role": "browser",
      "source": "https://karpo.ai/blog/karpo-browser"
    },
    {
      "id": "prism-agent",
      "cat": "assistant",
      "name": "Prism Agent",
      "en": "Prism · Apache-2.0",
      "free": "partial",
      "badge": "오픈소스 · BYOK",
      "one": "대화가 끝난 뒤에도 목표를 쫓고 정해 둔 시간에 일하는 오픈소스 개인 에이전트. 코딩은 Claude Code·Codex에 넘긴다.",
      "scope": "Apache-2.0 오픈소스 무료 · 맥·리눅스·윈도우·컨테이너에 설치(DB 없이 런타임 하나에 에이전트·데이터) · 목표가 끝날 때까지 여러 턴 이어 실행, 평문(\"매주 평일 9시\")·크론 스케줄과 하트비트 점검, 웹훅으로 일 받기 · 명령·파일 수정, Claude Code·Codex에 코딩 위임, 웹 읽기, 내 데스크톱·브라우저 조작 · 웹 UI·터미널·Slack·Teams·음성, Google Meet 참여 · 모델은 AWS Bedrock·Microsoft Foundry·OpenAI·Anthropic·OpenRouter·자체 LiteLLM(BYOK), 도구 위험 게이트와 잠금 모드",
      "mission": {
        "title": "Prism Agent로 주간 점검 상주시키기",
        "goal": "2주 안에 Prism을 VPS에 설치해 매주 월요일 9시 사이트 3곳 점검을 돌리고, 새 문제가 있을 때만 Slack으로 알림을 받는다",
        "context": "Apache-2.0 셀프호스트, 모델은 쓰던 OpenRouter·Bedrock 키(BYOK), 하루 30분, 예산 0원(모델 사용료 별도)"
      },
      "agentId": "prism-agent",
      "injectable": true,
      "self": false,
      "initial": "Pa",
      "color": "#5eead4",
      "limit": "셀프호스트 · 모델 BYOK",
      "role": "exec",
      "source": "https://www.mirantis.com/blog/prism-agent-is-open-source-an-ai-agent-that-keeps-working-after-the-conversation-ends/"
    },
    {
      "id": "localcode",
      "cat": "coding",
      "name": "Localcode",
      "en": "Localcode · Apache-2.0",
      "free": "free",
      "badge": "오픈소스 · Mac 로컬",
      "one": "애플 실리콘 맥 안에서만 돌아가는 100% 로컬 자율 코딩 CLI. 파일·테스트·Git까지 스스로 확인한다.",
      "scope": "Apache-2.0 오픈소스 무료 · Apple Silicon Mac(macOS 13+, 통합 메모리 16GB+) 전용, 클라우드 추론·API 키 없이 100% 로컬 · 12종 모델·169개 양자화 내장(Gemma 4 12B 4.7GB ~ DeepSeek V4 Flash 284B-A13B 161.9GB), RAM에 맞는 가장 큰 모델 자동 추천 · localcode 한 명령으로 파일 수정·셸 명령·테스트 실행·Git 작업·자가검증, 대화 넘어 작업 문맥 유지·앱 스캐폴딩·코드 검색 · 파일 내용·수정·실행 로그가 기기 밖으로 나가지 않음",
      "mission": {
        "title": "Localcode로 맥에서 오프라인 버그 수정",
        "goal": "1주 안에 16GB 맥에 Localcode를 설치해 저장소 버그 2건을 인터넷 없이 고치고 테스트 통과까지 확인한다",
        "context": "Apple Silicon Mac 16GB, Gemma 4 12B 로컬 모델, 하루 1시간, 예산 0원, 코드는 기기 밖으로 내보내지 않음"
      },
      "agentId": "localcode",
      "injectable": true,
      "self": false,
      "initial": "Lc",
      "color": "#c4b5fd",
      "limit": "Mac 16GB+ · 모델 비용 0원",
      "role": "code",
      "source": "https://emergent.sh/news/localcode-ships-one-command-local-coding"
    },
    {
      "id": "flashbrowse",
      "cat": "browser",
      "name": "flashbrowse",
      "en": "flashbrowse · Apache-2.0",
      "free": "free",
      "badge": "오픈소스 · Rust",
      "one": "순수 Rust 단일 바이너리 헤드리스 브라우저. 페이지를 접근성 트리로 압축해 에이전트가 읽는 토큰을 크게 줄인다.",
      "scope": "Apache-2.0 오픈소스 무료 · 순수 Rust 단일 바이너리(노드·파이썬·JVM·Playwright 불필요), CLI와 MCP stdio 서버 · CDP로 Chromium 제어, DOM이 조용해지고 접근성 트리가 두 번 같아질 때까지 기다려 같은 페이지는 같은 트리 · 접근성 트리를 문서 순서로 압축(하커뉴스 2,143토큰 vs Playwright 19,269토큰), 표 셀 누락 없이 본문 100% 유지 · Claude Code·Cursor·Codex에 MCP로 연결, --session-id로 여러 단계 유지, flashbrowse doctor 진단 · 이미지·폰트·트래커 차단(스크린샷 요청 때만 이미지 재요청)",
      "mission": {
        "title": "flashbrowse로 뉴스 목록 MCP 붙이기",
        "goal": "1주 안에 flashbrowse MCP를 Claude Code에 붙여 매일 보는 사이트 3곳의 새 글 제목을 토큰 한도 안에서 모아 CSV로 남긴다",
        "context": "오픈소스 무료, Chrome 설치, 하루 30분, 예산 0원"
      },
      "agentId": "flashbrowse",
      "injectable": true,
      "self": false,
      "initial": "Fb",
      "color": "#60a5fa",
      "limit": "오픈소스 · Chrome 필요",
      "role": "browser",
      "source": "https://dev.to/nhrdev/101-stars-building-a-pure-rust-browser-engine-for-llm-agents-f10"
    },
    {
      "id": "go-bot",
      "cat": "assistant",
      "name": "go-bot",
      "en": "go-bot · MIT",
      "free": "partial",
      "badge": "오픈소스 · 셀프호스트",
      "one": "내 서버에 Docker로 세우는 개인 비서. 브라우저·오피스 문서·장기 메모리·예약 작업을 웹과 모바일에서 쓴다.",
      "scope": "MIT 오픈소스 무료 · Go로 만든 셀프호스트 개인 에이전트, Docker(AMD64·ARM64)로 내 PC·서버에 설치 · 모델은 UI에서 OpenAI Responses·Anthropic Messages 호환 서비스로 지정(BYOK) · Chromium 브라우저 자동화·웹 검색, OfficeCLI로 Word·PPT·엑셀 읽기·작성·수정(완성 파일 내려받기), 이미지·영상은 Gemini API 플러그인 · 장기 메모리·대화 넘나드는 회상, 먼저 찾아보고 알려 주는 후속 제안, 예약 작업 · 대화별 실행 권한·사람 승인, 플러그인·스킬·MCP · 웹(영·중)·iOS·Android 클라이언트, Android APK 배포",
      "mission": {
        "title": "go-bot을 집 서버에 세우고 주간 보고 맡기기",
        "goal": "2주 안에 go-bot을 Docker로 띄우고 매주 금요일 매출 엑셀을 정리해 PPT 한 장으로 받아 본다",
        "context": "MIT 오픈소스, 모델은 쓰던 OpenAI·Anthropic 키(BYOK), 집 서버 Docker, 하루 30분, 예산 0원"
      },
      "agentId": "go-bot",
      "injectable": true,
      "self": false,
      "initial": "gb",
      "color": "#5eead4",
      "limit": "셀프호스트 · 모델 BYOK",
      "role": "docs",
      "source": "https://github.com/xyc999-ai/go-bot"
    },
    {
      "id": "dodaios",
      "cat": "local",
      "name": "Dodaios",
      "en": "Dodaios · Apache-2.0",
      "free": "partial",
      "badge": "오픈소스 · 데스크톱",
      "one": "내 컴퓨터를 에이전트로 바꾸는 오픈소스 데스크톱 앱. 화면·브라우저·터미널을 다루고 위험한 일은 먼저 묻는다.",
      "scope": "Apache-2.0 오픈소스 무료(계정·유료 등급 없음) · Windows·macOS·Linux 데스크톱 앱, 화면 없는 서버에서는 브라우저 UI · 모델은 쓰던 구독 로그인·API 키·로컬 모델 중 선택, 채팅·음성·컴퓨터 사용·에이전트마다 다른 제공자 지정 · 화면·마우스·키보드, 브라우저, 터미널, 연결 서비스 47종 플러그인, MCP, 코딩 에이전트 연동 · 긴 작업은 백그라운드 에이전트(격리된 Git 워크트리)로 넘김, 도구 호출마다 위험 등급을 매겨 위험한 것은 승인 요청 · 채팅·메모리·설정은 내 컴퓨터에 저장(승인 게이트는 샌드박스도 되돌리기도 아님)",
      "mission": {
        "title": "Dodaios로 데스크톱 반복 작업 맡기기",
        "goal": "1주 안에 Dodaios를 설치해 매달 반복하는 청구서 정리와 화면 캡처를 백그라운드 작업으로 넘기고, 위험한 단계만 직접 승인한다",
        "context": "Apache-2.0, 쓰던 Claude 구독으로 로그인, Windows 데스크톱, 하루 30분, 예산 0원"
      },
      "agentId": "dodaios",
      "injectable": true,
      "self": false,
      "initial": "Dd",
      "color": "#fbbf24",
      "limit": "셀프호스트 · 모델 BYOK",
      "role": "local",
      "source": "https://ainews.leverageai.com.au/case/dodaios-open-source-desktop-agent"
    },
    {
      "id": "agent-first-browse",
      "cat": "browser",
      "name": "Agent-first-browse",
      "en": "Agent-first-browse · Apache-2.0",
      "free": "free",
      "badge": "오픈소스 · delta snapshot",
      "one": "같은 페이지를 다시 읽지 않고 바뀐 부분만 에이전트에 보내는 오픈소스 브라우저 에이전트.",
      "scope": "Apache-2.0 오픈소스 무료 · 실제 Chromium을 제어하는 파이썬 브라우저 에이전트 · 같은 URL의 다음 단계에는 추가·변경·삭제된 요소와 짧은 요소 참조 목록만 전송(delta snapshot) — 스텝당 토큰 약 55% 절감, README 기준 35~79% · 가려진 링크 가지치기(쿠키 배너·모달 뒤 링크 제외), 페이지가 조용해질 때까지 대기, 비밀번호·OTP·PIN·카드번호 마스킹 · LangGraph 자율 실행 또는 Claude Code·Cursor·VS Code·Gemini CLI·Antigravity에 stdio MCP(7개 도구)로 연결, MCP 모드는 추가 모델 키 불필요 · 클릭 타임아웃 뒤 중복 클릭을 막는 의도 기록(intent journal)",
      "mission": {
        "title": "Agent-first-browse로 반복 조회 토큰 줄이기",
        "goal": "2주 안에 Agent-first-browse를 MCP로 붙여 매일 확인하는 목록 3곳을 돌리고 스텝당 토큰을 절반으로 줄인다",
        "context": "오픈소스 무료, Claude Code 구독으로 MCP 연결, 하루 30분, 예산 0원"
      },
      "agentId": "agent-first-browse",
      "injectable": true,
      "self": false,
      "initial": "Af",
      "color": "#60a5fa",
      "limit": "오픈소스 · 모델 별도",
      "role": "browser",
      "source": "https://mewcp.com/articles/agent-first-browse-shows-browser-agents-only-what-changed-on-the-page-cf1c7e"
    },
    {
      "id": "nod",
      "cat": "assistant",
      "name": "Nod",
      "en": "Nod · Apache-2.0",
      "free": "free",
      "badge": "오픈소스 · 로컬 앱",
      "one": "n8n Labs가 공개한 로컬 개인비서 앱. 샌드박스 브라우저로 송장·회의 준비·구독 해지를 맡고, 결제·발송·게시 전에는 반드시 나에게 확인한다.",
      "scope": "Apache-2.0 오픈소스 무료 · macOS 14+·Windows 11·Linux x64 데스크톱 앱, 내 PC에서 로컬 실행 · 모델은 ChatGPT Plus/Pro 구독 또는 본인 AI 키(BYOK) 연결 · 샌드박스 브라우저에서 송장 정리·회의 준비·구독 해지 같은 일을 여러 단계로 수행 · 결제·발송·게시처럼 되돌릴 수 없는 단계는 실행 전에 사용자 확인을 받음",
      "mission": {
        "title": "Nod로 송장·구독 정리 맡기기",
        "goal": "2주 안에 Nod를 설치해 밀린 송장 5건 정리와 안 쓰는 구독 2건 해지를 맡기고, 결제·해지 단계만 직접 승인한다",
        "context": "Apache-2.0 로컬 앱, ChatGPT Plus 구독으로 모델 연결, 하루 30분, 예산 0원, 결제·발송은 확인 후"
      },
      "agentId": "nod",
      "injectable": true,
      "self": false,
      "initial": "Nd",
      "color": "#5eead4",
      "limit": "오픈소스 · 모델 비용 별도",
      "role": "exec",
      "source": "https://www.opensourceprojects.dev/post/nod"
    },
    {
      "id": "browseros-neo",
      "cat": "browser",
      "name": "BrowserOS neo",
      "en": "BrowserOS neo · AGPL-3.0",
      "free": "free",
      "badge": "오픈소스 · $0",
      "one": "에이전트만을 위해 만든 두 번째 크로미움 브라우저. 쓰던 크롬의 로그인·북마크·확장을 한 번에 가져오고, Claude Code·Codex·Cursor가 MCP로 조종한다.",
      "scope": "AGPL-3.0 오픈소스 무료($0, 본인 AI 플랜·키 사용) · macOS·Windows·Linux · 기존 Chrome의 로그인·북마크·확장을 1클릭으로 가져오는 에이전트 전용 두 번째 Chromium 브라우저 · Claude Code·Codex·Cursor가 MCP로 제어 · 에이전트 작업과 내 브라우징을 분리",
      "mission": {
        "title": "BrowserOS neo로 로그인된 조사 자동화",
        "goal": "1주 안에 크롬 로그인을 BrowserOS neo로 옮기고, 이미 로그인된 사이트 3곳의 자료 조사를 Codex에 MCP로 맡겨 비교표 1장으로 받는다",
        "context": "무료(본인 AI 플랜 사용), 하루 30분, 예산 0원, 결제·게시는 직접"
      },
      "agentId": "browseros-neo",
      "injectable": true,
      "self": false,
      "initial": "BN",
      "color": "#60a5fa",
      "limit": "오픈소스 · 모델 비용 별도",
      "role": "browser",
      "source": "https://ntsot.com/browseros-neo-review/"
    },
    {
      "id": "daiv-3",
      "cat": "coding",
      "name": "DAIV 3.0",
      "en": "DAIV · Apache-2.0",
      "free": "partial",
      "badge": "오픈소스 · 셀프호스트",
      "one": "내 서버에서 GitHub·GitLab 이슈를 읽어 계획을 댓글로 남기고 PR/MR을 만드는 코딩 에이전트. CI가 실패하면 스스로 고친다.",
      "scope": "Apache-2.0 오픈소스 무료 · 자체 서버(Docker Compose)에 셀프호스트 · GitHub·GitLab에서 daiv 라벨이 붙은 이슈를 읽어 계획 댓글을 남긴 뒤 PR/MR 생성 · CI 실패 시 로그를 읽고 자가 수정해 다시 올림 · 모델은 Google·OpenRouter·vLLM/LiteLLM 등 BYOK, MCP 엔드포인트 지원",
      "mission": {
        "title": "DAIV 3.0으로 이슈→PR 자동화",
        "goal": "2주 안에 DAIV를 자체 서버에 띄우고 daiv 라벨 이슈 3건을 계획 댓글과 PR까지 자동으로 끝내고, CI 실패 1건을 스스로 고치게 한다",
        "context": "Docker Compose 셀프호스트, 모델은 OpenRouter 키(BYOK), 주말 하루 2시간, 예산 0원(모델 사용료 별도)"
      },
      "agentId": "daiv-3",
      "injectable": true,
      "self": false,
      "initial": "Dv",
      "color": "#c4b5fd",
      "limit": "셀프호스트 · 모델 BYOK",
      "role": "code",
      "source": "https://daivagent.com/blog/daiv-3/"
    },
    {
      "id": "free-claude-code",
      "cat": "local",
      "name": "Free Claude Code (FCC)",
      "en": "FCC · AGPL-3.0",
      "free": "free",
      "badge": "오픈소스 · 무료 티어 연결",
      "one": "Claude Code·Codex·OpenCode·Cline 등 12개 코딩 도구를 61개 무료 티어 프로바이더에 연결하는 로컬 프록시. 실제 Claude가 아니라 고른 무료 모델로 돌아간다.",
      "scope": "AGPL-3.0 오픈소스 무료 · 내 PC에서 도는 로컬 프록시(Alishahryar1/free-claude-code, 73k stars) · Claude Code·Codex·OpenCode·Cline 등 12개 코딩 도구를 NVIDIA NIM·OpenRouter·Groq·Gemini·Ollama 등 61개 무료 티어 프로바이더로 연결 · 실제 Claude 모델이 아니라 선택한 모델로 동작(도구 이름만 Claude Code)",
      "mission": {
        "title": "FCC로 코딩 도구를 무료 모델에 붙이기",
        "goal": "1주 안에 FCC 프록시를 띄워 Claude Code를 NVIDIA NIM·Gemini 무료 티어로 돌리고, 같은 과제를 두 프로바이더로 비교해 쓸 조합 1개를 고른다",
        "context": "오픈소스 무료, 무료 티어 API 키 1~2개, 하루 1시간, 예산 0원"
      },
      "agentId": "free-claude-code",
      "injectable": true,
      "self": false,
      "initial": "Fc",
      "color": "#fbbf24",
      "limit": "오픈소스 · 무료 티어 키",
      "role": "local",
      "source": "https://www.claudeagents.co/blog/free-claude-code-github"
    }
  ]
};
