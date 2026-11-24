/* 뉴스픽 스튜디오 | 뉴스픽 파트너스 '수익이 많이 발생한 콘텐츠' 어댑터
 *
 * - 한일 님 파트너스 계정에서 확인한 고수익 콘텐츠 20건을 시드로 두고,
 *   KV(`p:hot`)에 더 새로운 목록이 있으면 그것을 먼저 쓴다.
 * - 링크에는 파트너스 추적 파라미터(lcp·cp·utm_source)가 항상 붙는다.
 * - 파트너스 세션/쿠키(환경변수 PARTNERS_COOKIE·PARTNERS_SESSION)나
 *   수동 연동 데이터(POST /api/partners-hot)가 없으면, 고수익형 이슈 큐레이션을
 *   돌려주고 linked:false 로 알린다(화면은 '파트너스 미연동' 배지를 단다).
 */
import { mergePartnerUrl, normalizeSpace, PARTNER_TRACKING } from "./_lib.js";
import { curatedFor } from "./_feedFallback.js";

export const PARTNERS_KV_KEY = "p:hot";
export const PARTNERS_MAX = 20;

/* 2026-11-23 파트너스 '수익이 많이 발생하고 있는 콘텐츠' 20건 (한일 님 계정 확인값) */
export const PARTNERS_SEED = [
  {
    rank: 1,
    title: "리센느 회사 이사님이 찍은 리센느 멤버들",
    nid: "2026112300060010927",
    pn: "593",
    site: "움짤랜드",
    image: "https://images-cdn.newspic.kr/thumb1/2026/11/22/b04d56c0-7f05-4a5e-8eea-5d04d5b8923c.jpg",
    summary: "리센느 회사 이사님이 직접 찍은 멤버들 사진이 화제를 모으고 있어요.",
  },
  {
    rank: 2,
    title: "\"쉰내 올라오는 베개 커버, '이 액체' 한 번만 짜 넣어보세요\"…이렇게 쓸모 있을 줄 몰랐습니다",
    nid: "2026112321000086365",
    pn: "618",
    site: "뉴스클립",
    image: "https://images-cdn.newspic.kr/thumb1/2026/11/23/9dec6e6e-175f-4282-9ea2-5b90e06a30ca.jpg",
    summary: "베개 커버 냄새를 한 번에 잡는 생활 꿀팁이 소개됐어요.",
  },
  {
    rank: 3,
    title: "개드립 글 보고 생각난 트젠 현실 만화",
    nid: "2026102906005131297",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/10/28/9d73a4e4-8c8f-4e47-a92d-a2e8562bf949.jpg",
    summary: "온라인에서 화제가 된 글을 바탕으로 그린 현실 만화예요.",
  },
  {
    rank: 4,
    title: "\"두부 구울 때 계란 2개만 풀어 '이렇게' 부쳐보세요\" 폭신한 식감에 아이들도 잘 먹습니다",
    nid: "2026112319000087001",
    pn: "618",
    site: "뉴스클립",
    image: "https://images-cdn.newspic.kr/thumb1/2026/11/23/1a03555c-58f8-43a0-9a16-4c9d2a83a86f.jpg",
    summary: "두부와 계란으로 폭신한 반찬을 만드는 방법이 소개됐어요.",
  },
  {
    rank: 5,
    title: "일본을 잘 아는 사람이 보면 무서운 만화",
    nid: "2026110520202949592",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/11/05/1a055d32-6b0a-464a-b061-eedce5e89d10.jpg",
    summary: "일본 문화를 아는 사람일수록 더 무섭게 느껴지는 만화예요.",
  },
  {
    rank: 6,
    title: "현재 트위터 화제 짤",
    nid: "2026110809185678181",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/11/08/22c16db2-ec58-47a1-bb4e-bb7816f9208e.jpg",
    summary: "트위터에서 화제가 된 짤이 모여 있어요.",
  },
  {
    rank: 7,
    title: "수녀로 생활하는게 불편한 이유.manhwa",
    nid: "2026100811201478546",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/10/08/ea8b8440-6297-4c2a-a1a3-a0726f444591.jpg",
    summary: "수녀로 지내며 겪는 불편함을 만화로 풀어냈어요.",
  },
  {
    rank: 8,
    title: "세계에서 8번째로 많이 팔린 책이 출판된 계기.jpg",
    nid: "2026103103000208794",
    pn: "573",
    site: "유머픽",
    image: "https://images-cdn.newspic.kr/thumb1/2026/10/30/d627161f-1e7a-4dc3-8241-37abc09a3991.jpg",
    summary: "세계에서 8번째로 많이 팔린 책의 출판 계기를 정리했어요.",
  },
  {
    rank: 9,
    title: "와들와들 블아 2차 창작 대사",
    nid: "2026101219280506588",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/10/12/bb558be0-f8ec-4c00-9347-c5a169f8d726.jpg",
    summary: "게임 캐릭터 2차 창작 대사가 화제를 모았어요.",
  },
  {
    rank: 10,
    title: "효자 아들",
    nid: "2026110101020068290",
    pn: "593",
    site: "움짤랜드",
    image: "https://images-cdn.newspic.kr/thumb1/2026/10/31/372c48bc-3969-4678-8e17-c370ee3cbe43.jpg",
    summary: "짧은 움짤로 웃음을 주는 효자 아들 이야기예요.",
  },
  {
    rank: 11,
    title: "인사팀장 눈에 들어온 S급 인재 (1편)",
    nid: "2026102113420131338",
    pn: "573",
    site: "유머픽",
    image: "https://images-cdn.newspic.kr/thumb1/2026/10/21/70cef4c2-a72d-4e38-940b-76a068e9d047.jpg",
    summary: "인사팀장이 눈여겨본 인재를 다룬 연재 만화 1편이에요.",
  },
  {
    rank: 12,
    title: "요즘 애들이 사람을 그리는 방법 .. . JPG",
    nid: "2026102814285538714",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/10/28/369865d5-cfba-4a40-ac34-47f5f3471911.jpg",
    summary: "요즘 세대의 그림체를 유쾌하게 짚은 짤이에요.",
  },
  {
    rank: 13,
    title: "군인이 귀를 뚫으면 안되는 이유",
    nid: "2026102622023451770",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/10/26/3d45a909-a688-4912-8eb2-dc8f148c75cb.jpg",
    summary: "군 복무 중 귀걸이를 하면 안 되는 이유를 설명해요.",
  },
  {
    rank: 14,
    title: "SSS급 뷰빔용사 만화.manhwa",
    nid: "2026090910250848752",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/09/09/c162e2b1-8a14-4cb2-8a44-16583c26b43a.jpg",
    summary: "인기 설정을 살린 용사 만화가 연재되고 있어요.",
  },
  {
    rank: 15,
    title: "무섭도록 적중하는 심리테스트.jpg",
    nid: "2026110903351978540",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/11/08/4fe133b3-507d-446f-8746-fe1f321286eb.jpg",
    summary: "맞히는 재미가 있는 심리테스트가 화제예요.",
  },
  {
    rank: 16,
    title: "불과 3년전 AI가 그린 화목한 5인 가족.jpg",
    nid: "2026101219514506868",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/10/12/b7ebb82f-8c16-4757-b772-133c13c6f754.jpg",
    summary: "3년 전 AI가 그린 가족 이미지를 돌아봤어요.",
  },
  {
    rank: 17,
    title: "李대통령, 국정원장 강금실 지명...외교 임웅순·통일 홍익표·행안 한준호·문체 강유정",
    nid: "2026112316120286921",
    pn: "564",
    site: "투데이신문",
    image: "https://images-cdn.newspic.kr/thumb1/2026/11/23/7e9132fd-4511-47cd-a4b7-6304d4f0b01f.jpg",
    summary: "국정원장과 외교·통일·행안·문체 인선이 발표됐어요.",
  },
  {
    rank: 18,
    title: "일찍 철든 아이가 위험한 이유",
    nid: "2026111610351211054",
    pn: "591",
    site: "엠봉",
    image: "https://images-cdn.newspic.kr/thumb1/2026/11/16/2f22971d-b5d1-4eb6-a4cc-746ac68ae078.jpg",
    summary: "어른스러운 아이가 겪는 어려움을 짚은 콘텐츠예요.",
  },
  {
    rank: 19,
    title: "의외로 개병1신불효자새끼도 사람으로 만드는 것",
    nid: "2026110323210104363",
    pn: "573",
    site: "유머픽",
    image: "https://images-cdn.newspic.kr/thumb1/2026/11/03/79150cf7-db2e-404c-8337-74d2752f59c2.jpg",
    summary: "사람을 바꾸는 의외의 계기를 다룬 이야기예요.",
  },
  {
    rank: 20,
    title: "인사팀장 눈에 들어온 S급 인재 (2편)",
    nid: "2026102103420239597",
    pn: "573",
    site: "유머픽",
    image: "https://images-cdn.newspic.kr/thumb1/2026/10/20/33f74f57-a6e5-444f-a752-0927e9128b00.jpg",
    summary: "인사팀장과 S급 인재의 후속 이야기 2편이에요.",
  },
];

function uniquePush(list, value) {
  if (!value) return;
  if (!list.some((item) => item.title === value.title && item.nid === value.nid)) list.push(value);
}

/** nid·url 을 정규화하고 추적 파라미터를 붙인다. */
export function normalizePartnerItem(raw, tracking) {
  const source = raw || {};
  const nid = normalizeSpace(source.nid || "") || (() => {
    try {
      return new URL(source.url).searchParams.get("nid") || "";
    } catch (e) {
      return "";
    }
  })();
  const base = normalizeSpace(source.url || "") || (nid ? `https://m.newspic.kr/view.html?nid=${nid}` : "");
  const baseWithPn = (() => {
    if (!base) return "";
    if (!source.pn) return base;
    try {
      const url = new URL(base);
      if (!url.searchParams.get("pn")) url.searchParams.set("pn", normalizeSpace(source.pn));
      return url.toString();
    } catch (e) {
      return base;
    }
  })();
  const tracked = baseWithPn ? mergePartnerUrl(baseWithPn, null, tracking) : "";
  return {
    title: normalizeSpace(source.title || "").slice(0, 200),
    summary: normalizeSpace(source.summary || "").slice(0, 300),
    site: normalizeSpace(source.site || "뉴스픽 파트너스").slice(0, 40),
    image: normalizeSpace(source.image || ""),
    nid,
    pn: normalizeSpace(source.pn || ""),
    url: tracked,
    rank: Number(source.rank) || 0,
    hot: true,
    body: normalizeSpace(source.body || ""),
  };
}

function sortByRank(items) {
  return items
    .map((item, index) => ({ ...item, rank: item.rank || index + 1 }))
    .sort((a, b) => a.rank - b.rank);
}

/** 파트너스 세션/쿠키가 설정돼 있는지 (연동 여부 표시용). */
export function partnersLinked(env) {
  const source = env || {};
  return Boolean(normalizeSpace(source.PARTNERS_COOKIE || "") || normalizeSpace(source.PARTNERS_SESSION || ""));
}

/** KV 또는 시드에서 고수익 목록을 읽는다. */
export async function readPartnerItems(kv, tracking) {
  if (kv) {
    try {
      const raw = await kv.get(PARTNERS_KV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.items) ? parsed.items : [];
        const items = sortByRank(list.map((item) => normalizePartnerItem(item, tracking)).filter((item) => item.title && item.url));
        if (items.length) return { items, source: "kv", updatedAt: parsed && parsed.updatedAt ? parsed.updatedAt : "" };
      }
    } catch (e) {
      /* KV 오류는 시드로 폴백 */
    }
  }
  const items = sortByRank(PARTNERS_SEED.map((item) => normalizePartnerItem(item, tracking)));
  return { items, source: "seed", updatedAt: "" };
}

export async function writePartnerItems(kv, items, tracking) {
  if (!kv) return false;
  const normalized = sortByRank(
    (Array.isArray(items) ? items : []).map((item) => normalizePartnerItem(item, tracking)).filter((item) => item.title && item.url)
  ).slice(0, PARTNERS_MAX);
  if (!normalized.length) return false;
  await kv.put(
    PARTNERS_KV_KEY,
    JSON.stringify({ items: normalized, updatedAt: new Date().toISOString() }),
    { expirationTtl: 60 * 60 * 24 * 120 }
  );
  return true;
}

/** 파트너스 미연동일 때 보여 줄 '고수익형 이슈' 큐레이션 (실제 기사 아님). */
export function curatedHotItems(tracking) {
  const picks = [];
  const pools = [
    ["life", [0, 1, 4]],
    ["economy", [0, 2]],
    ["entertain", [0, 5]],
    ["health", [1, 5]],
    ["realestate", [1, 4]],
    ["society", [2, 4]],
  ];
  for (const [category, indexes] of pools) {
    const pool = curatedFor(category, 8);
    for (const index of indexes) {
      const item = pool[index];
      if (item) uniquePush(picks, item);
    }
  }
  return picks.slice(0, PARTNERS_MAX).map((item, index) => ({
    rank: index + 1,
    title: item.title,
    summary: item.summary,
    site: item.site,
    image: item.image || "",
    nid: "",
    pn: "",
    url: "",
    body: item.body,
    hot: true,
    curated: true,
    tracking: tracking || PARTNER_TRACKING,
  }));
}

/** /api/partners-hot 과 /api/feed?category=partners 가 함께 쓰는 응답. */
export async function buildPartnersHot({ env, kv, pn, tracking, limit = PARTNERS_MAX } = {}) {
  const linked = partnersLinked(env) || Boolean(kv);
  const { items, source, updatedAt } = await readPartnerItems(kv, tracking);
  const usercode = normalizeSpace(pn || "");
  const mapped = items.slice(0, limit).map((item, index) => {
    const partnerUrl = usercode && item.url ? mergePartnerUrl(item.url, { code: usercode }, tracking) : item.url;
    return {
      id: "ph" + (item.nid || index + 1),
      rank: item.rank || index + 1,
      title: item.title,
      summary: item.summary,
      url: item.url,
      partnerUrl,
      partnerApplied: Boolean(usercode && partnerUrl !== item.url),
      site: item.site,
      image: item.image,
      publishedAt: "",
      nid: item.nid,
      pn: item.pn,
      category: "partners",
      source,
      hot: true,
      isFallback: false,
      linked: true,
    };
  });
  if (mapped.length) {
    return {
      ok: true,
      category: "partners",
      linked: true,
      source,
      updatedAt,
      items: mapped,
      count: mapped.length,
      note: linked ? "뉴스픽 파트너스 고수익 콘텐츠" : "파트너스 시드 목록(로그인 연동 시 실시간 갱신)",
    };
  }
  const curated = curatedHotItems(tracking).slice(0, limit);
  return {
    ok: true,
    category: "partners",
    linked: false,
    source: "curated",
    updatedAt: "",
    items: curated.map((item, index) => ({
      id: "pc" + index,
      rank: index + 1,
      title: item.title,
      summary: item.summary,
      url: "",
      partnerUrl: "",
      partnerApplied: false,
      site: item.site,
      image: "",
      publishedAt: "",
      nid: "",
      pn: "",
      category: "partners",
      source: "curated",
      hot: true,
      isFallback: true,
      linked: false,
      body: item.body,
    })),
    count: curated.length,
    note: "파트너스 계정이 연동되지 않아 고수익형 이슈 큐레이션을 보여 줍니다.",
  };
}
