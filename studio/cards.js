/* 뉴스픽 스튜디오 | 카드뉴스 8장 렌더러
 * - 테마 4종: 매거진 에디토리얼 · 다크 테크 · 경제 인포그래픽 · 파스텔 데일리
 * - 비율 2종: 4:5 (1080×1350, 인스타·쓰레드) / 9:16 (1080×1920, 틱톡·쇼츠)
 * - 카드 종류 8가지(표지·요약·배경·숫자·팩트·쟁점·체크리스트·CTA)에 맞춰 레이아웃을 바꾼다.
 */
import { font, fitText, roundRect, wrapLines } from "./canvas.js";

const FONT_SERIF = "'Nanum Myeongjo','Noto Serif KR',Georgia,serif";

/* v1.2.0 — 제목은 기존의 90%, 본문은 제목의 70% 크기로 그린다. */
export const CARD_SCALES = { title: 0.9, body: 0.7 };

/** 제목 크기에서 본문 크기를 계산한다(행 높이·캔버스 폭 안으로 제한). */
function bodySizeFor(titleSize, rowH, cap) {
  const byTitle = Math.round(titleSize * CARD_SCALES.body);
  const byRow = rowH ? Math.round(rowH / 2.1) : byTitle;
  return Math.max(16, Math.min(cap || 60, byRow, byTitle));
}

export const CARD_THEMES = {
  magazine: {
    id: "magazine",
    name: "매거진 에디토리얼",
    bg: "#f4efe4",
    panel: "#fffdf8",
    ink: "#1b1a17",
    muted: "#7a7466",
    accent: "#c0442c",
    accentInk: "#fff8f2",
    line: "#d8cfbd",
    titleFont: FONT_SERIF,
    pattern: "rule",
  },
  dark: {
    id: "dark",
    name: "다크 테크",
    bg: "#080b11",
    panel: "#101623",
    ink: "#f2f6ff",
    muted: "#8d9ab0",
    accent: "#4ade80",
    accent2: "#38bdf8",
    accentInk: "#04140a",
    line: "#22304a",
    titleFont: "",
    pattern: "grid",
  },
  econ: {
    id: "econ",
    name: "경제 인포그래픽",
    bg: "#ffffff",
    panel: "#f4f7fb",
    ink: "#0d2340",
    muted: "#5c7290",
    accent: "#e11d48",
    accent2: "#1d4ed8",
    accentInk: "#ffffff",
    line: "#d7e1ee",
    titleFont: "",
    pattern: "chart",
  },
  pastel: {
    id: "pastel",
    name: "파스텔 데일리",
    bg: "#fdf3f7",
    panel: "#ffffff",
    ink: "#3b2a37",
    muted: "#9b8494",
    accent: "#e8618f",
    accent2: "#8b7cf6",
    accentInk: "#ffffff",
    line: "#f0dbe5",
    titleFont: "",
    pattern: "blob",
  },
};

export function cardTheme(id) {
  return CARD_THEMES[id] || CARD_THEMES.magazine;
}

export function ratioInfo(ratio) {
  if (ratio === "9:16") return { id: "9:16", width: 1080, height: 1920, label: "9:16 · 틱톡·쇼츠" };
  return { id: "4:5", width: 1080, height: 1350, label: "4:5 · 인스타·쓰레드" };
}

/* ------------------------------------------------------------------ *
 * 공통 장식
 * ------------------------------------------------------------------ */

function paintPattern(ctx, w, h, theme) {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  if (theme.pattern === "rule") {
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1.5;
    for (let y = 160; y < h; y += 96) {
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.lineTo(w - 64, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(192,68,44,0.07)";
    ctx.beginPath();
    ctx.arc(w * 0.92, h * 0.08, 240, 0, Math.PI * 2);
    ctx.fill();
  } else if (theme.pattern === "grid") {
    ctx.strokeStyle = "rgba(74,222,128,0.08)";
    ctx.lineWidth = 1.5;
    for (let x = 0; x < w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const glow = ctx.createRadialGradient(w * 0.82, h * 0.14, 0, w * 0.82, h * 0.14, 520);
    glow.addColorStop(0, "rgba(56,189,248,0.22)");
    glow.addColorStop(1, "rgba(56,189,248,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  } else if (theme.pattern === "chart") {
    ctx.strokeStyle = "rgba(29,78,216,0.08)";
    ctx.lineWidth = 2;
    for (let y = h * 0.2; y < h; y += 74) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(225,29,72,0.06)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.72);
    for (let x = 0; x <= w; x += w / 8) {
      ctx.lineTo(x, h * (0.72 - 0.18 * Math.sin(x / w * Math.PI * 1.4)));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  } else {
    const g1 = ctx.createRadialGradient(w * 0.15, h * 0.1, 0, w * 0.15, h * 0.1, 420);
    g1.addColorStop(0, "rgba(232,97,143,0.18)");
    g1.addColorStop(1, "rgba(232,97,143,0)");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w, h);
    const g2 = ctx.createRadialGradient(w * 0.9, h * 0.9, 0, w * 0.9, h * 0.9, 480);
    g2.addColorStop(0, "rgba(139,124,246,0.18)");
    g2.addColorStop(1, "rgba(139,124,246,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function drawHeader(ctx, w, pad, theme, card) {
  const y = pad;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  // kicker chip
  ctx.font = font(30, 800);
  const label = (card.kicker || "").toUpperCase();
  const labelText = /^[A-Z0-9 ]+$/.test(label) ? label : card.kicker;
  const chipW = Math.min(w - pad * 2 - 220, ctx.measureText(labelText).width + 56);
  ctx.fillStyle = theme.accent;
  roundRect(ctx, pad, y, chipW, 62, 31);
  ctx.fill();
  ctx.fillStyle = theme.accentInk;
  ctx.fillText(labelText, pad + 28, y + 33);

  ctx.textAlign = "right";
  ctx.fillStyle = theme.muted;
  ctx.font = font(26, 700);
  ctx.fillText("뉴스픽 스튜디오", w - pad, y + 32);
  ctx.restore();
}

function drawFooter(ctx, w, h, pad, theme, card, total = 8) {
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = theme.muted;
  ctx.font = font(24, 600);
  const foot = String(card.footer || "").slice(0, 46);
  ctx.fillText(foot, pad, h - pad * 0.72);

  // 진행 점
  const dotY = h - pad * 0.72;
  const count = total;
  const dotR = 5;
  const gap = 22;
  const startX = w - pad - (count - 1) * gap;
  for (let i = 0; i < count; i += 1) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = i === (card.no || 1) - 1 ? theme.accent : theme.line;
    ctx.fill();
  }

  ctx.textAlign = "right";
  ctx.fillStyle = theme.accent;
  ctx.font = font(26, 800);
  ctx.fillText(String(card.no || 1).padStart(2, "0") + " / " + String(total).padStart(2, "0"), startX - 34, dotY);
  ctx.restore();
}

function drawUnderline(ctx, x, y, width, theme) {
  ctx.fillStyle = theme.accent;
  ctx.fillRect(x, y, Math.min(width, 120), 8);
}

/* ------------------------------------------------------------------ *
 * 카드 종류별 본문
 * ------------------------------------------------------------------ */

function drawCover(ctx, w, h, pad, theme, card, imageEl, opts = {}) {
  if (imageEl && imageEl.naturalWidth) {
    const scale = Math.max(w / imageEl.naturalWidth, h / imageEl.naturalHeight);
    const dw = imageEl.naturalWidth * scale;
    const dh = imageEl.naturalHeight * scale;
    ctx.drawImage(imageEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
    const shade = ctx.createLinearGradient(0, h * 0.2, 0, h);
    shade.addColorStop(0, "rgba(6,10,16,0.12)");
    shade.addColorStop(0.45, "rgba(6,10,16,0.72)");
    shade.addColorStop(1, "rgba(6,10,16,0.94)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);
    theme = { ...theme, ink: "#ffffff", muted: "rgba(255,255,255,0.74)", line: "rgba(255,255,255,0.3)", accent: theme.accent };
  } else {
    // 표지 아트 패널
    const panelTop = pad + 74;
    const panelBottom = h * 0.4;
    const panelH = Math.max(180, panelBottom - panelTop);
    ctx.save();
    ctx.fillStyle = theme.panel;
    ctx.fillRect(pad, panelTop, w - pad * 2, panelH);
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, panelTop, w - pad * 2, panelH);
    ctx.beginPath();
    ctx.rect(pad, panelTop, w - pad * 2, panelH);
    ctx.clip();

    // 큰 숫자 워터마크
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = 0.1;
    ctx.font = font(Math.round(panelH * 0.92), 900);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("08", w - pad - 24, panelTop + panelH * 0.52);
    ctx.globalAlpha = 1;

    // 막대 그래프
    const barBase = panelTop + panelH - 34;
    for (let i = 0; i < 5; i += 1) {
      const barH = 26 + i * (panelH * 0.085);
      ctx.fillStyle = i === 4 ? theme.accent : theme.line;
      ctx.fillRect(pad + 46 + i * 34, barBase - barH, 20, barH);
    }
    // 원 + 대각선
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(pad + 46 + 5 * 34 + 56, barBase - panelH * 0.34, Math.round(panelH * 0.19), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pad, panelTop + panelH * 0.32);
    ctx.lineTo(w - pad, panelTop + panelH * 0.2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const topY = imageEl ? pad + 16 : pad + 18;
  ctx.font = font(27, 800);
  ctx.fillStyle = theme.accent;
  ctx.fillText("CARD NEWS · " + String(opts.total || 8), pad, topY);
  ctx.textAlign = "right";
  ctx.fillStyle = theme.muted;
  ctx.font = font(25, 600);
  ctx.fillText(card.kicker || "뉴스픽", w - pad, topY);
  ctx.textAlign = "left";

  const titleTop = imageEl ? h * 0.4 : h * 0.46;
  const titleSize = Math.round(h * 0.046 * CARD_SCALES.title);
  const title = fitText(ctx, card.title, {
    maxWidth: w - pad * 2,
    maxLines: 3,
    size: titleSize,
    minSize: 38,
    weight: 800,
    ratio: 1.22,
  });
  ctx.fillStyle = theme.ink;
  ctx.textAlign = "left";
  title.lines.forEach((line, i) => {
    ctx.font = theme.titleFont ? `800 ${title.size}px ${theme.titleFont}` : font(title.size, 800);
    ctx.fillText(line, pad, titleTop + i * title.lineHeight);
  });

  let cursor = titleTop + title.lines.length * title.lineHeight + 16;
  drawUnderline(ctx, pad, cursor, 110, theme);
  cursor += 30;

  const sub = fitText(ctx, (card.lines || []).join(" "), {
    maxWidth: w - pad * 2,
    maxLines: 2,
    size: Math.min(46, Math.round(title.size * CARD_SCALES.body)),
    minSize: 22,
    weight: 600,
    ratio: 1.42,
  });
  ctx.fillStyle = imageEl ? "rgba(255,255,255,0.86)" : theme.muted;
  ctx.font = font(sub.size, 600);
  sub.lines.forEach((line, i) => ctx.fillText(line, pad, cursor + i * sub.lineHeight));
  cursor += sub.lines.length * sub.lineHeight;

  if (cursor < h - pad * 2.15) {
    ctx.fillStyle = theme.muted;
    ctx.font = font(26, 700);
    ctx.fillText("옆으로 넘겨서 30초 정리 보기 →", pad, h - pad * 2.05);
  }
  ctx.restore();
}

function drawSummary(ctx, w, h, pad, theme, card) {
  const title = fitText(ctx, card.title, { maxWidth: w - pad * 2, maxLines: 2, size: Math.round(62 * CARD_SCALES.title), minSize: 40, weight: 800 });
  let y = pad + 110;
  ctx.fillStyle = theme.ink;
  ctx.font = font(title.size, 800);
  title.lines.forEach((line, i) => ctx.fillText(line, pad, y + i * title.lineHeight));
  y += title.lines.length * title.lineHeight + 18;
  drawUnderline(ctx, pad, y, 120, theme);
  y += 52;

  const items = card.lines || [];
  const boxH = Math.min(310, (h - y - pad * 1.6) / Math.max(items.length, 1) - 22);
  items.forEach((line, index) => {
    const top = y + index * (boxH + 22);
    ctx.fillStyle = theme.panel;
    roundRect(ctx, pad, top, w - pad * 2, boxH, 26);
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(pad + 64, top + boxH / 2, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.accentInk;
    ctx.font = font(32, 800);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), pad + 64, top + boxH / 2 + 1);
    ctx.textAlign = "left";

    const body = fitText(ctx, line.replace(/^·\s*/, ""), {
      maxWidth: w - pad * 2 - 150,
      maxLines: 3,
      size: bodySizeFor(title.size, boxH),
      minSize: 22,
      weight: 700,
      ratio: 1.32,
    });
    ctx.fillStyle = theme.ink;
    ctx.font = font(body.size, 700);
    const bodyTop = top + boxH / 2 - ((body.lines.length - 1) * body.lineHeight) / 2;
    body.lines.forEach((text, i) => ctx.fillText(text, pad + 120, bodyTop + i * body.lineHeight));
  });
}

function drawLines(ctx, w, h, pad, theme, card, opts = {}) {
  const title = fitText(ctx, card.title, { maxWidth: w - pad * 2, maxLines: 2, size: Math.round(60 * CARD_SCALES.title), minSize: 40, weight: 800 });
  let y = pad + 112;
  ctx.fillStyle = theme.ink;
  ctx.font = font(title.size, 800);
  title.lines.forEach((line, i) => ctx.fillText(line, pad, y + i * title.lineHeight));
  y += title.lines.length * title.lineHeight + 16;
  drawUnderline(ctx, pad, y, 120, theme);
  y += 56;

  const items = (card.lines || []).slice(0, opts.maxItems || 3);
  const area = h - pad * 1.7 - y;
  const gap = 20;
  const rowH = Math.min(300, Math.max(96, (area - gap * (items.length - 1)) / Math.max(items.length, 1)));

  items.forEach((line, index) => {
    const top = y + index * (rowH + gap);
    if (opts.boxed !== false) {
      ctx.fillStyle = theme.panel;
      roundRect(ctx, pad, top, w - pad * 2, rowH, 22);
      ctx.fill();
      ctx.strokeStyle = theme.line;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = theme.accent;
    ctx.fillRect(pad + 6, top + 20, 8, rowH - 40);

    const body = fitText(ctx, String(line).replace(/^✔\s*/, ""), {
      maxWidth: w - pad * 2 - 110,
      maxLines: 3,
      size: bodySizeFor(title.size, rowH),
      minSize: 22,
      weight: 700,
      ratio: 1.34,
    });
    ctx.fillStyle = theme.ink;
    ctx.font = font(body.size, 700);
    const bodyTop = top + rowH / 2 - ((body.lines.length - 1) * body.lineHeight) / 2;
    body.lines.forEach((text, i) => ctx.fillText(text, pad + 44, bodyTop + i * body.lineHeight));
  });
}

function drawNumbers(ctx, w, h, pad, theme, card) {
  const title = fitText(ctx, card.title, { maxWidth: w - pad * 2, maxLines: 2, size: Math.round(58 * CARD_SCALES.title), minSize: 38, weight: 800 });
  let y = pad + 112;
  ctx.fillStyle = theme.ink;
  ctx.font = font(title.size, 800);
  title.lines.forEach((line, i) => ctx.fillText(line, pad, y + i * title.lineHeight));
  y += title.lines.length * title.lineHeight + 16;
  drawUnderline(ctx, pad, y, 120, theme);
  y += 60;

  const numbers = (card.numbers || []).slice(0, 3);
  const area = h - pad * 1.7 - y;
  const gap = 22;
  const rowH = Math.min(300, (area - gap * (numbers.length - 1)) / Math.max(numbers.length, 1));

  numbers.forEach((item, index) => {
    const top = y + index * (rowH + gap);
    ctx.fillStyle = theme.panel;
    roundRect(ctx, pad, top, w - pad * 2, rowH, 24);
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.fillStyle = theme.accent;
    ctx.font = font(Math.min(64, rowH * 0.34), 800);
    ctx.textAlign = "left";
    const value = String(item.highlight || "").slice(0, 12);
    ctx.fillText(value, pad + 40, top + rowH * 0.32);

    const text = fitText(ctx, item.text, {
      maxWidth: w - pad * 2 - 80,
      maxLines: 2,
      size: bodySizeFor(title.size, rowH * 0.62, 44),
      minSize: 20,
      weight: 600,
      ratio: 1.3,
    });
    ctx.fillStyle = theme.muted;
    ctx.font = font(text.size, 600);
    text.lines.forEach((line, i) => ctx.fillText(line, pad + 40, top + rowH * 0.7 + i * text.lineHeight - 6));
  });
}

function drawChecklist(ctx, w, h, pad, theme, card) {
  const title = fitText(ctx, card.title, { maxWidth: w - pad * 2, maxLines: 2, size: Math.round(58 * CARD_SCALES.title), minSize: 38, weight: 800 });
  let y = pad + 112;
  ctx.fillStyle = theme.ink;
  ctx.font = font(title.size, 800);
  title.lines.forEach((line, i) => ctx.fillText(line, pad, y + i * title.lineHeight));
  y += title.lines.length * title.lineHeight + 16;
  drawUnderline(ctx, pad, y, 120, theme);
  y += 60;

  const items = (card.lines || []).slice(0, 4);
  const area = h - pad * 1.7 - y;
  const gap = 22;
  const rowH = Math.min(260, (area - gap * (items.length - 1)) / Math.max(items.length, 1));
  items.forEach((line, index) => {
    const top = y + index * (rowH + gap);
    ctx.fillStyle = theme.panel;
    roundRect(ctx, pad, top, w - pad * 2, rowH, 24);
    ctx.fill();
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 6;
    roundRect(ctx, pad + 32, top + rowH / 2 - 24, 48, 48, 12);
    ctx.stroke();
    // 체크
    ctx.beginPath();
    ctx.moveTo(pad + 44, top + rowH / 2);
    ctx.lineTo(pad + 56, top + rowH / 2 + 12);
    ctx.lineTo(pad + 74, top + rowH / 2 - 14);
    ctx.lineWidth = 6;
    ctx.stroke();

    const body = fitText(ctx, String(line).replace(/^✔\s*/, ""), {
      maxWidth: w - pad * 2 - 150,
      maxLines: 3,
      size: bodySizeFor(title.size, rowH),
      minSize: 22,
      weight: 700,
      ratio: 1.34,
    });
    ctx.fillStyle = theme.ink;
    ctx.font = font(body.size, 700);
    const bodyTop = top + rowH / 2 - ((body.lines.length - 1) * body.lineHeight) / 2;
    body.lines.forEach((text, i) => ctx.fillText(text, pad + 108, bodyTop + i * body.lineHeight));
  });
}

function drawCta(ctx, w, h, pad, theme, card, opts = {}) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.fillStyle = theme.accent;
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.22, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.accentInk;
  ctx.font = font(64, 800);
  ctx.fillText("↓", w / 2, h * 0.22 - 36);

  const title = fitText(ctx, card.title, {
    maxWidth: w - pad * 2,
    maxLines: 3,
    size: Math.round(78 * CARD_SCALES.title),
    minSize: 46,
    weight: 800,
    ratio: 1.22,
  });
  ctx.fillStyle = theme.ink;
  ctx.font = font(title.size, 800);
  const titleTop = h * 0.35;
  title.lines.forEach((line, i) => ctx.fillText(line, w / 2, titleTop + i * title.lineHeight));

  let y = titleTop + title.lines.length * title.lineHeight + 40;
  const lines = card.lines || [];
  const ctaBody = Math.min(46, Math.round(title.size * CARD_SCALES.body));
  ctx.font = font(ctaBody, 600);
  ctx.fillStyle = theme.muted;
  const first = fitText(ctx, lines[0] || "", { maxWidth: w - pad * 2 - 80, maxLines: 2, size: ctaBody, minSize: 22, weight: 600, ratio: 1.36 });
  first.lines.forEach((line, i) => ctx.fillText(line, w / 2, y + i * first.lineHeight));
  y += first.lines.length * first.lineHeight + 34;

  if (lines[1]) {
    const link = wrapLines(ctx, String(lines[1]), w - pad * 2 - 120, 2);
    const boxH = 118;
    ctx.fillStyle = theme.ink;
    roundRect(ctx, pad + 30, y, w - pad * 2 - 60, boxH, 24);
    ctx.fill();
    ctx.fillStyle = theme.bg === "#080b11" ? "#04140a" : "#ffffff";
    ctx.font = font(26, 700);
    link.forEach((line, i) => ctx.fillText(line, w / 2, y + 26 + i * 34));
    y += boxH + 38;
  }

  ctx.fillStyle = theme.muted;
  ctx.font = font(27, 700);
  ctx.fillText("프로필 링크도 같은 기사로 연결됩니다", w / 2, y);

  // 하단 미니 카드 장수 표시
  const stripY = h - pad * 2.55;
  const cardW = 44;
  const gap = 14;
  const total = opts.total || 8;
  const totalW = total * cardW + (total - 1) * gap;
  for (let i = 0; i < total; i += 1) {
    ctx.fillStyle = i === 0 ? theme.accent : theme.line;
    roundRect(ctx, w / 2 - totalW / 2 + i * (cardW + gap), stripY, cardW, 62, 8);
    ctx.fill();
  }

  ctx.restore();
}

function paintPanel(ctx, x, y, w, h, theme) {
  const second = theme.accent2 || theme.accent;
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, theme.accent);
  grad.addColorStop(0.62, second);
  grad.addColorStop(1, "#0b0f16");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  const glow = ctx.createRadialGradient(x + w * 0.18, y + h * 0.16, 0, x + w * 0.18, y + h * 0.16, Math.max(w, h) * 0.8);
  glow.addColorStop(0, "rgba(255,255,255,0.22)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(6,10,16,0.18)";
  ctx.fillRect(x, y, w, h);
  // 컬러풀한 대각선 리본
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 4; i += 1) {
    const rx = x - h * 0.2 + i * w * 0.34;
    ctx.beginPath();
    ctx.moveTo(rx, y + h);
    ctx.lineTo(rx + w * 0.16, y);
    ctx.lineTo(rx + w * 0.24, y);
    ctx.lineTo(rx + w * 0.08, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function paintSideArt(ctx, x, y, w, h, theme, card, opts = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, theme.accent);
  grad.addColorStop(0.55, theme.accent2 || theme.accent);
  grad.addColorStop(1, theme.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // 큰 반투명 숫자/글리프
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font(Math.round(Math.min(w, h) * 0.92), 900);
  ctx.fillText(String(card.no || 1).padStart(2, "0"), x + w / 2, y + h / 2);
  ctx.restore();

  // 동심원
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  for (let i = 1; i <= 4; i += 1) {
    ctx.lineWidth = 2 + i;
    ctx.beginPath();
    ctx.arc(x + w * 0.82, y + h * 0.2, Math.min(w, h) * 0.09 * i, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 하프톤 점
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  const gap = Math.max(14, Math.round(Math.min(w, h) / 26));
  for (let py = y + h * 0.62; py < y + h - gap; py += gap) {
    for (let px = x + gap; px < x + w - gap; px += gap) {
      if ((Math.round(px / gap) + Math.round(py / gap)) % 3 === 0) {
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1.2, gap * 0.1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // 아래 캡션 스트립
  const stripH = Math.max(64, Math.round(h * 0.12));
  ctx.fillStyle = "rgba(6,10,16,0.62)";
  ctx.fillRect(x, y + h - stripH, w, stripH);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const label = fitText(ctx, (card.kicker || "뉴스픽") + " · " + (opts.site || "뉴스픽"), {
    maxWidth: w - stripH * 0.9,
    maxLines: 1,
    size: Math.round(stripH * 0.32),
    minSize: 16,
    weight: 800,
  });
  ctx.font = font(label.size, 800);
  ctx.fillText(label.lines[0] || "뉴스픽", x + stripH * 0.42, y + h - stripH / 2);
  ctx.restore();
}

function splitOrientation(index) {
  const pattern = ["left", "top", "right", "bottom"];
  return pattern[Math.abs(Number(index) || 0) % pattern.length];
}

export function splitOrientationFor(index) {
  return splitOrientation(index);
}

function drawSplitCard(ctx, w, h, card, theme, imageEl, opts = {}) {
  const orientation = opts.orientation || splitOrientation(opts.index || 0);
  const horizontal = orientation === "left" || orientation === "right";
  const visShare = horizontal ? 0.46 : 0.44;
  const vis = horizontal
    ? { x: orientation === "left" ? 0 : w * (1 - visShare), y: 0, w: w * visShare, h }
    : { x: 0, y: orientation === "top" ? 0 : h * (1 - visShare), w, h: h * visShare };
  const text = horizontal
    ? { x: orientation === "left" ? w * visShare : 0, y: 0, w: w * (1 - visShare), h }
    : { x: 0, y: orientation === "top" ? h * visShare : 0, w, h: h * (1 - visShare) };

  // 배경
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);

  // 비주얼 면
  if (imageEl && imageEl.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(vis.x, vis.y, vis.w, vis.h);
    ctx.clip();
    const scale = Math.max(vis.w / imageEl.naturalWidth, vis.h / imageEl.naturalHeight);
    const dw = imageEl.naturalWidth * scale;
    const dh = imageEl.naturalHeight * scale;
    ctx.drawImage(imageEl, vis.x + (vis.w - dw) / 2, vis.y + (vis.h - dh) / 2, dw, dh);
    const shade = ctx.createLinearGradient(vis.x, vis.y, vis.x, vis.y + vis.h);
    shade.addColorStop(0, "rgba(6,10,16,0.06)");
    shade.addColorStop(1, "rgba(6,10,16,0.55)");
    ctx.fillStyle = shade;
    ctx.fillRect(vis.x, vis.y, vis.w, vis.h);
    ctx.restore();
  } else {
    paintSideArt(ctx, vis.x, vis.y, vis.w, vis.h, theme, card, opts);
  }

  // 텍스트 면
  paintPanel(ctx, text.x, text.y, text.w, text.h, theme);
  const pad = Math.round(Math.min(w, h) * 0.05);
  const innerX = text.x + pad;
  const innerW = text.w - pad * 2;
  let cursor = text.y + pad;
  const unitH = text.h;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // 상단: 장수 · 머리말
  ctx.font = font(Math.round(Math.min(text.w * 0.038, unitH * 0.03)), 800);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(`CARD ${String(card.no || 1).padStart(2, "0")} / ${String(opts.total || 8).padStart(2, "0")}`, innerX, cursor);
  ctx.textAlign = "right";
  ctx.fillText("NEWSPIC STUDIO", innerX + innerW, cursor);
  ctx.textAlign = "left";
  cursor += Math.round(unitH * 0.052);

  // 머리말 칩
  const kicker = String(card.kicker || "뉴스픽");
  ctx.font = font(Math.round(unitH * 0.03), 800);
  const chipW = Math.min(innerW, ctx.measureText(kicker).width + pad * 0.9);
  const chipH = Math.round(unitH * 0.058);
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  roundRect(ctx, innerX, cursor, chipW, chipH, 999);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(kicker, innerX + pad * 0.45, cursor + Math.round(chipH * 0.24));
  cursor += Math.round(unitH * 0.085);

  // 제목 (기존의 90% 크기)
  const titleSize = Math.round(Math.min(text.w * 0.115, unitH * 0.085) * CARD_SCALES.title);
  const title = fitText(ctx, card.title || "", {
    maxWidth: innerW,
    maxLines: 3,
    size: titleSize,
    minSize: Math.round(titleSize * 0.56),
    weight: 900,
    ratio: 1.2,
  });
  ctx.fillStyle = "#ffffff";
  ctx.font = font(title.size, 900);
  title.lines.forEach((line, i) => ctx.fillText(line, innerX, cursor + i * title.lineHeight));
  cursor += title.lines.length * title.lineHeight + Math.round(unitH * 0.02);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(innerX, cursor, Math.round(innerW * 0.16), Math.max(4, Math.round(unitH * 0.009)));
  cursor += Math.round(unitH * 0.045);

  // 본문
  const items = (card.lines || []).slice(0, 3);
  const numbers = card.numbers || [];
  const rowGap = Math.round(unitH * 0.018);
  const rowsBottom = text.y + text.h - pad * 2.6;
  const single = items.length === 1 && !(card.kind === "numbers" && numbers.length > 1);
  const rowH = single
    ? Math.max(Math.round(unitH * 0.09), rowsBottom - cursor)
    : Math.min(
        Math.round(unitH * 0.16),
        Math.max(Math.round(unitH * 0.07), (rowsBottom - cursor - rowGap * (items.length - 1)) / Math.max(items.length, 1))
      );
  /* 본문은 제목의 70% 크기 — 행 높이 안에서 자동 줄바꿈·축소되어 캔버스를 넘지 않는다. */
  const bodySize = bodySizeFor(title.size, single ? Math.min(rowH, Math.round(unitH * 0.2)) : rowH, 48);
  items.forEach((line, index) => {
    const top = cursor + index * (rowH + rowGap);
    const markerGap = card.kind === "summary" ? Math.max(56, Math.round(rowH * 0.5)) : Math.min(78, Math.round(text.w * 0.07));
    if (index > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(innerX, top - rowGap / 2);
      ctx.lineTo(innerX + innerW, top - rowGap / 2);
      ctx.stroke();
    }
    if (card.kind === "numbers" && numbers[index]) {
      ctx.fillStyle = "#ffffff";
      ctx.font = font(Math.round(rowH * 0.5), 900);
      ctx.fillText(String(numbers[index].highlight || "").slice(0, 12), innerX, top);
      const body = fitText(ctx, numbers[index].text || "", {
        maxWidth: innerW,
        maxLines: 2,
        size: Math.round(bodySize * 0.72),
        minSize: 15,
        weight: 600,
        ratio: 1.3,
      });
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.font = font(body.size, 600);
      body.lines.forEach((textLine, i) => ctx.fillText(textLine, innerX, top + rowH * 0.55 + i * body.lineHeight));
    } else {
      const textValue = String(line).replace(/^[·✔]\s*/, "");
      const marker = card.kind === "summary" ? String(index + 1) : card.kind === "checklist" ? "✓" : "—";
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      if (card.kind === "summary") {
        ctx.beginPath();
        ctx.arc(innerX + rowH * 0.18, top + rowH * 0.24, rowH * 0.17, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = theme.accent;
        ctx.font = font(Math.round(rowH * 0.24), 900);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(marker, innerX + rowH * 0.18, top + rowH * 0.25);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
      } else {
        ctx.font = font(Math.round(rowH * 0.3), 900);
        ctx.fillText(marker, innerX, top + rowH * 0.02);
      }
      const body = fitText(ctx, textValue, {
        maxWidth: innerW - markerGap,
        maxLines: single ? 3 : 2,
        size: bodySize,
        minSize: Math.max(15, Math.round(bodySize * 0.6)),
        weight: card.kind === "cover" ? 600 : 700,
        ratio: 1.3,
      });
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.font = font(body.size, card.kind === "cover" ? 600 : 700);
      const bodyTop = single ? top + Math.max(0, (rowH - body.lines.length * body.lineHeight) / 2) : top;
      body.lines.forEach((textLine, i) => ctx.fillText(textLine, innerX + markerGap, bodyTop + i * body.lineHeight));
    }
  });

  // 키워드 배지 (바닥 문구와 겹치는 태그는 생략)
  const footText = String(card.footer || "");
  const badges = (card.badges && card.badges.length ? card.badges : [])
    .filter((badge) => badge && !footText.includes(String(badge).replace(/^#/, "")))
    .slice(0, 3);
  if (badges.length) {
    let bx = innerX;
    const by = text.y + text.h - pad * 2.45;
    ctx.font = font(Math.round(Math.min(w, h) * 0.024), 800);
    for (const badge of badges) {
      const label = String(badge).replace(/^#/, "#");
      const bw = Math.min(innerW, ctx.measureText(label).width + pad * 0.8);
      if (bx + bw > innerX + innerW) break;
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      roundRect(ctx, bx, by, bw, Math.round(Math.min(w, h) * 0.05), 999);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillText(label, bx + pad * 0.4, by + Math.round(Math.min(w, h) * 0.011));
      bx += bw + pad * 0.24;
    }
  }

  // 사이트 · 페이지 점
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = font(Math.round(Math.min(w, h) * 0.026), 600);
  ctx.fillText(String(card.footer || "뉴스픽 스튜디오").slice(0, 30), innerX, text.y + text.h - pad * 0.95);
  const total = opts.total || 8;
  const dotR = Math.max(3, Math.round(w * 0.0045));
  const gap = dotR * 4;
  const startX = innerX + innerW - (total - 1) * gap;
  for (let i = 0; i < total; i += 1) {
    ctx.beginPath();
    ctx.arc(startX + i * gap, text.y + text.h - pad * 0.88, dotR, 0, Math.PI * 2);
    ctx.fillStyle = i === (card.no || 1) - 1 ? "#ffffff" : "rgba(255,255,255,0.32)";
    ctx.fill();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 카드 1장
 * ------------------------------------------------------------------ */

function colorWithAlpha(hex, alpha) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!match) return `rgba(0,0,0,${alpha})`;
  const num = parseInt(match[1], 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

/** 전면형 카드의 배경 사진 — 카드마다 다른 이미지를 은은한 질감으로 깔아
 *  패널·제목 글자가 읽히는 대비를 유지한다. */
function paintImageBackdrop(ctx, w, h, theme, imageEl, opts = {}) {
  if (!imageEl || !imageEl.naturalWidth) return false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  const scale = Math.max(w / imageEl.naturalWidth, h / imageEl.naturalHeight);
  const dw = imageEl.naturalWidth * scale;
  const dh = imageEl.naturalHeight * scale;
  ctx.drawImage(imageEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.fillStyle = colorWithAlpha(theme.bg, Number(opts.wash) || 0.56);
  ctx.fillRect(0, 0, w, h);
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  top.addColorStop(0, colorWithAlpha(theme.bg, 0.62));
  top.addColorStop(1, colorWithAlpha(theme.bg, 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.6);
  const bottom = ctx.createLinearGradient(0, h * 0.68, 0, h);
  bottom.addColorStop(0, colorWithAlpha(theme.bg, 0));
  bottom.addColorStop(1, colorWithAlpha(theme.bg, 0.55));
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.68, w, h * 0.32);
  ctx.restore();
  return true;
}

export function drawCard(ctx, w, h, card, themeId, imageEl, opts = {}) {
  const theme = cardTheme(themeId);
  const pad = Math.round(w * 0.075);
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  if ((opts.layout || "split") === "split") {
    drawSplitCard(ctx, w, h, card, theme, imageEl, opts);
    ctx.restore();
    return;
  }

  if (card.kind === "cover") {
    // 표지는 배경을 직접 칠한다
    if (imageEl && imageEl.naturalWidth) {
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, w, h);
    } else {
      paintPattern(ctx, w, h, theme);
    }
    drawCover(ctx, w, h, pad, theme, card, imageEl, opts);
    drawFooter(ctx, w, h, pad, theme, card, opts.total || 8);
    ctx.restore();
    return;
  }

  paintPattern(ctx, w, h, theme);
  if (imageEl && imageEl.naturalWidth) paintImageBackdrop(ctx, w, h, theme, imageEl, opts);
  drawHeader(ctx, w, pad, theme, card);

  if (card.kind === "summary") drawSummary(ctx, w, h, pad, theme, card);
  else if (card.kind === "numbers") drawNumbers(ctx, w, h, pad, theme, card);
  else if (card.kind === "checklist") drawChecklist(ctx, w, h, pad, theme, card);
  else if (card.kind === "cta") drawCta(ctx, w, h, pad, theme, card, opts);
  else drawLines(ctx, w, h, pad, theme, card);

  drawFooter(ctx, w, h, pad, theme, card, opts.total || 8);
  ctx.restore();
}

export function renderCardCanvas(card, themeId, ratio, imageEl, opts = {}) {
  const info = ratioInfo(ratio);
  const canvas = document.createElement("canvas");
  canvas.width = info.width;
  canvas.height = info.height;
  const ctx = canvas.getContext("2d");
  drawCard(ctx, info.width, info.height, card, themeId, imageEl, opts);
  return canvas;
}

export function canvasToBlob(canvas, type = "image/png", quality = 0.95) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

export function canvasToBytes(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      const buffer = await blob.arrayBuffer();
      resolve(new Uint8Array(buffer));
    }, "image/png");
  });
}
