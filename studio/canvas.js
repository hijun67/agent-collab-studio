/* 뉴스픽 스튜디오 | 4컷 만화 캔버스 렌더러
 * - 스타일 4종: 실사(photo) · 지브리(ghibli) · 웹툰(webtoon) · 이슈툰(issuetoon)
 * - AI 이미지가 있으면 배경으로 깔고, 없으면(오프라인·실패) 스타일별 Canvas 아트로 폴백
 * - 컷 1장(1080×1080)과 합본(2×2 2160×2700 / 세로 2160×3840)을 같은 페인터로 그린다.
 */

const FONT_STACK = "'Pretendard','Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',system-ui,sans-serif";
const CUT_SIZE = 1080;

export const STYLE_THEMES = {
  photo: {
    id: "photo",
    name: "실사 이미지",
    bg: "#0d1117",
    art: ["#101826", "#1c2b3f", "#3b5066", "#c98b4b"],
    panel: "#0b0f14",
    ink: "#f5f7fa",
    muted: "#a8b3c2",
    accent: "#f0a34a",
    accentInk: "#1a1206",
    bubble: "#0f1720",
    bubbleLine: "#3a4a5f",
    narration: "rgba(8,12,18,0.82)",
    narrationInk: "#f7f9fc",
    skin: "#e6c2a3",
    hair: "#171a20",
  },
  ghibli: {
    id: "ghibli",
    name: "지브리풍",
    bg: "#f7f0df",
    art: ["#bfe0ef", "#e8f2e3", "#f7f0df", "#8fb98a"],
    panel: "#fffdf7",
    ink: "#2f3a34",
    muted: "#7d8a7f",
    accent: "#6c9a6b",
    accentInk: "#ffffff",
    bubble: "#fffdf7",
    bubbleLine: "#c8d3c4",
    narration: "rgba(255,253,247,0.94)",
    narrationInk: "#2f3a34",
    skin: "#f6dcc0",
    hair: "#4a3a30",
  },
  webtoon: {
    id: "webtoon",
    name: "웹툰 스타일",
    bg: "#fff7fb",
    art: ["#dfe9ff", "#ffe6f1", "#fff7fb", "#c9d8ff"],
    panel: "#ffffff",
    ink: "#1d1b25",
    muted: "#7a7286",
    accent: "#ef6a9c",
    accentInk: "#ffffff",
    bubble: "#ffffff",
    bubbleLine: "#f0c2d6",
    narration: "#ffffff",
    narrationInk: "#1d1b25",
    skin: "#ffdcc2",
    hair: "#2c2437",
  },
  issuetoon: {
    id: "issuetoon",
    name: "이슈 툰",
    bg: "#f7f1e1",
    art: ["#f7f1e1", "#e8dfc8", "#d94a3d", "#1f2328"],
    panel: "#f7f1e1",
    ink: "#1f2328",
    muted: "#6b6a63",
    accent: "#d94a3d",
    accentInk: "#fffaf0",
    bubble: "#fffaf0",
    bubbleLine: "#1f2328",
    narration: "#1f2328",
    narrationInk: "#f7f1e1",
    skin: "#f3d3b3",
    hair: "#1f2328",
  },
};

export function styleTheme(styleId) {
  return STYLE_THEMES[styleId] || STYLE_THEMES.photo;
}

export function font(size, weight = 700) {
  return `${weight} ${Math.round(size)}px ${FONT_STACK}`;
}

export function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function wrapLines(ctx, text, maxWidth, maxLines = 4) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return [];
  const lines = [];
  let current = "";
  for (const word of source.split(" ")) {
    const candidate = current ? current + " " + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length >= maxLines) {
    const joined = lines.join(" ");
    if (joined.replace(/\s/g, "").length < source.replace(/\s/g, "").length) {
      let last = lines[lines.length - 1];
      while (last.length > 1 && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
      lines[lines.length - 1] = last + "…";
    }
  }
  return lines;
}

export function fitText(ctx, text, { maxWidth, maxLines = 4, size = 46, minSize = 22, weight = 700, ratio = 1.32 }) {
  let current = size;
  for (let guard = 0; guard < 60; guard += 1) {
    ctx.font = font(current, weight);
    const lines = wrapLines(ctx, text, maxWidth, maxLines);
    const joined = lines.join(" ").replace(/…$/, "");
    const complete = joined.replace(/\s/g, "").length >= String(text || "").replace(/\s/g, "").length * 0.9;
    if ((lines.length <= maxLines && complete) || current <= minSize) {
      return { lines, size: current, lineHeight: Math.round(current * ratio) };
    }
    current = Math.max(minSize, current - 2);
  }
  ctx.font = font(minSize, weight);
  return { lines: wrapLines(ctx, text, maxWidth, maxLines), size: minSize, lineHeight: Math.round(minSize * ratio) };
}

function seeded(seed) {
  let value = (Number(seed) || 1) % 2147483647;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/* ------------------------------------------------------------------ *
 * 스타일별 배경 아트 (AI 이미지가 없을 때)
 * ------------------------------------------------------------------ */

function drawPhotoArt(ctx, w, h, theme, rand) {
  const sky = ctx.createLinearGradient(0, 0, w * 0.3, h);
  sky.addColorStop(0, "#0a1220");
  sky.addColorStop(0.45, "#1b2c44");
  sky.addColorStop(0.75, "#5a4a3f");
  sky.addColorStop(1, "#c1874c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 도시 실루엣
  ctx.fillStyle = "rgba(9,13,20,0.86)";
  let x = -40;
  while (x < w + 40) {
    const bw = 40 + rand() * 90;
    const bh = h * (0.18 + rand() * 0.33);
    ctx.fillRect(x, h - bh, bw - 6, bh);
    ctx.fillStyle = "rgba(240,190,120,0.5)";
    for (let wy = h - bh + 16; wy < h - 20; wy += 26) {
      for (let wx = x + 10; wx < x + bw - 16; wx += 22) {
        if (rand() > 0.72) ctx.fillRect(wx, wy, 7, 10);
      }
    }
    ctx.fillStyle = "rgba(9,13,20,0.86)";
    x += bw;
  }

  // 보케
  for (let i = 0; i < 18; i += 1) {
    const bx = rand() * w;
    const by = h * (0.45 + rand() * 0.5);
    const r = 14 + rand() * 42;
    const glow = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    glow.addColorStop(0, "rgba(255,206,140,0.55)");
    glow.addColorStop(1, "rgba(255,206,140,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 인물 실루엣 (림라이트)
  const px = w * 0.68;
  const py = h * 0.62;
  ctx.save();
  ctx.fillStyle = "rgba(6,9,14,0.95)";
  ctx.beginPath();
  ctx.arc(px, py - h * 0.12, w * 0.075, 0, Math.PI * 2);
  ctx.fill();
  roundRect(ctx, px - w * 0.11, py - h * 0.06, w * 0.22, h * 0.42, w * 0.06);
  ctx.fill();
  ctx.strokeStyle = "rgba(240,180,110,0.75)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(px, py - h * 0.12, w * 0.075, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();

  // 필름 그레인 + 비네트
  for (let i = 0; i < 2400; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${rand() * 0.045})`;
    ctx.fillRect(rand() * w, rand() * h, 2, 2);
  }
  const vignette = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.85);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

function drawGhibliArt(ctx, w, h, theme, rand) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, "#9fd0e8");
  sky.addColorStop(0.55, "#cfe7ef");
  sky.addColorStop(1, "#f6efd9");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.75);

  // 해
  const sun = ctx.createRadialGradient(w * 0.24, h * 0.22, 0, w * 0.24, h * 0.22, w * 0.3);
  sun.addColorStop(0, "rgba(255,248,214,0.95)");
  sun.addColorStop(1, "rgba(255,248,214,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // 구름
  for (let i = 0; i < 7; i += 1) {
    const cx = rand() * w;
    const cy = h * (0.08 + rand() * 0.3);
    const size = 60 + rand() * 110;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let b = 0; b < 5; b += 1) {
      ctx.beginPath();
      ctx.arc(cx + b * size * 0.42 - size, cy + Math.sin(b) * size * 0.16, size * (0.5 + rand() * 0.4), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 언덕
  const hillBack = ctx.createLinearGradient(0, h * 0.55, 0, h);
  hillBack.addColorStop(0, "#9cc39a");
  hillBack.addColorStop(1, "#6f9c74");
  ctx.fillStyle = hillBack;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.7);
  ctx.quadraticCurveTo(w * 0.25, h * 0.55, w * 0.55, h * 0.68);
  ctx.quadraticCurveTo(w * 0.8, h * 0.78, w, h * 0.62);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  const hillFront = ctx.createLinearGradient(0, h * 0.75, 0, h);
  hillFront.addColorStop(0, "#7fae7b");
  hillFront.addColorStop(1, "#4d7a56");
  ctx.fillStyle = hillFront;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.86);
  ctx.quadraticCurveTo(w * 0.35, h * 0.74, w * 0.7, h * 0.88);
  ctx.quadraticCurveTo(w * 0.9, h * 0.95, w, h * 0.88);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  // 나무
  for (let i = 0; i < 5; i += 1) {
    const tx = w * (0.08 + rand() * 0.85);
    const ty = h * (0.78 + rand() * 0.12);
    const tr = 22 + rand() * 26;
    ctx.fillStyle = "#3f5f45";
    ctx.fillRect(tx - 4, ty - tr * 0.2, 8, tr * 0.9);
    ctx.fillStyle = "#5b8a5f";
    ctx.beginPath();
    ctx.arc(tx, ty - tr * 0.7, tr, 0, Math.PI * 2);
    ctx.fill();
  }

  // 손그림 질감
  for (let i = 0; i < 900; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${rand() * 0.06})`;
    ctx.beginPath();
    ctx.arc(rand() * w, rand() * h, 1 + rand() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWebtoonArt(ctx, w, h, theme, rand) {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, "#e4ecff");
  bg.addColorStop(0.5, "#ffe8f2");
  bg.addColorStop(1, "#fff8fc");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 집중선
  const cx = w * 0.5;
  const cy = h * 0.42;
  ctx.strokeStyle = "rgba(120,120,170,0.18)";
  for (let i = 0; i < 46; i += 1) {
    const angle = (i / 46) * Math.PI * 2;
    ctx.lineWidth = 2 + rand() * 4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * w * 0.18, cy + Math.sin(angle) * w * 0.18);
    ctx.lineTo(cx + Math.cos(angle) * w * 1.1, cy + Math.sin(angle) * w * 1.1);
    ctx.stroke();
  }
  // 반짝임
  for (let i = 0; i < 26; i += 1) {
    const sx = rand() * w;
    const sy = rand() * h;
    const r = 4 + rand() * 10;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.moveTo(sx, sy - r);
    ctx.quadraticCurveTo(sx, sy, sx + r, sy);
    ctx.quadraticCurveTo(sx, sy, sx, sy + r);
    ctx.quadraticCurveTo(sx, sy, sx - r, sy);
    ctx.quadraticCurveTo(sx, sy, sx, sy - r);
    ctx.fill();
  }
  // 바닥
  ctx.fillStyle = "rgba(214,224,255,0.55)";
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
}

function drawIssuetoonArt(ctx, w, h, theme, rand) {
  ctx.fillStyle = "#f7f1e1";
  ctx.fillRect(0, 0, w, h);

  // 붉은 대각 웨지
  ctx.fillStyle = "#d94a3d";
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w, h * 0.52);
  ctx.lineTo(w * 0.42, 0);
  ctx.closePath();
  ctx.fill();

  // 검은 블록
  ctx.fillStyle = "#1f2328";
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, h * 0.72);
  ctx.lineTo(w * 0.55, h);
  ctx.closePath();
  ctx.fill();

  // 하프톤
  ctx.fillStyle = "rgba(31,35,40,0.35)";
  for (let y = 0; y < h; y += 26) {
    for (let x = 0; x < w; x += 26) {
      if (rand() > 0.55) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // 굵은 선
  ctx.strokeStyle = "#1f2328";
  ctx.lineWidth = 14;
  ctx.strokeRect(24, 24, w - 48, h - 48);
}

const ART_PAINTERS = {
  photo: drawPhotoArt,
  ghibli: drawGhibliArt,
  webtoon: drawWebtoonArt,
  issuetoon: drawIssuetoonArt,
};

/** AI 이미지가 있으면 꽉 차게, 없으면 스타일 아트를 그린다. */
function paintBackground(ctx, w, h, styleId, seed, imageEl, theme) {
  ctx.save();
  if (imageEl && imageEl.naturalWidth) {
    const scale = Math.max(w / imageEl.naturalWidth, h / imageEl.naturalHeight);
    const dw = imageEl.naturalWidth * scale;
    const dh = imageEl.naturalHeight * scale;
    ctx.drawImage(imageEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
    if (styleId === "ghibli" || styleId === "webtoon") {
      ctx.globalAlpha = 0.28;
      const wash = ctx.createLinearGradient(0, 0, w, h);
      wash.addColorStop(0, styleId === "ghibli" ? "#f7f0df" : "#ffe8f2");
      wash.addColorStop(1, styleId === "ghibli" ? "#bfe0ef" : "#e4ecff");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    if (styleId === "issuetoon") {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#f7f1e1";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  } else {
    const painter = ART_PAINTERS[styleId] || drawPhotoArt;
    painter(ctx, w, h, theme, seeded(seed));
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 캐릭터 (스타일별 선 굵기·색만 바꿔 같은 페인터 사용)
 * ------------------------------------------------------------------ */

function drawCharacter(ctx, cx, cy, r, expression, theme, styleId) {
  const line = theme.ink;
  const lineWidth = styleId === "issuetoon" ? r * 0.075 : styleId === "webtoon" ? r * 0.045 : r * 0.035;
  const eyeY = cy - r * 0.06;

  // 몸통
  ctx.fillStyle = styleId === "photo" ? "rgba(10,14,20,0.95)" : theme.hair;
  roundRect(ctx, cx - r * 1.2, cy + r * 0.8, r * 2.4, r * 1.6, r * 0.4);
  ctx.fill();

  // 목
  ctx.fillStyle = theme.skin;
  ctx.fillRect(cx - r * 0.24, cy + r * 0.64, r * 0.48, r * 0.3);

  // 얼굴
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = theme.skin;
  ctx.fill();
  ctx.lineWidth = Math.max(2, lineWidth);
  ctx.strokeStyle = line;
  ctx.stroke();

  // 머리
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 1.02, Math.PI * 1.98);
  ctx.lineTo(cx + r * 0.92, cy - r * 0.16);
  ctx.quadraticCurveTo(cx + r * 0.46, cy - r * 0.52, cx - r * 0.1, cy - r * 0.44);
  ctx.quadraticCurveTo(cx - r * 0.62, cy - r * 0.38, cx - r * 0.92, cy - r * 0.08);
  ctx.closePath();
  ctx.fillStyle = theme.hair;
  ctx.fill();

  const eyeGap = r * 0.38;
  const eyeR = r * 0.1;
  ctx.strokeStyle = line;
  ctx.fillStyle = line;
  ctx.lineWidth = Math.max(2, r * 0.05);

  if (expression === "웃음") {
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dir * eyeGap, eyeY + eyeR * 0.5, eyeR * 0.95, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  } else if (expression === "진지") {
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + dir * eyeGap, eyeY, eyeR * 0.82, eyeR * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + dir * eyeGap - eyeR * 1.2, eyeY - eyeR * 1.7);
      ctx.lineTo(cx + dir * eyeGap + eyeR * 1.1, eyeY - eyeR * 1.5);
      ctx.stroke();
    }
  } else if (expression === "당황") {
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + dir * eyeGap, eyeY + eyeR * 0.2, eyeR * 0.7, eyeR * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + dir * eyeGap - eyeR * 1.3, eyeY - eyeR * 2.1);
      ctx.lineTo(cx + dir * eyeGap + eyeR * 1.2, eyeY - eyeR * 1.1);
      ctx.stroke();
    }
  } else {
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dir * eyeGap, eyeY, eyeR * 1.35, 0, Math.PI * 2);
      ctx.fillStyle = "#FFFFFF";
      ctx.fill();
      ctx.strokeStyle = line;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + dir * eyeGap, eyeY, eyeR * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = line;
      ctx.fill();
    }
  }

  ctx.strokeStyle = line;
  ctx.fillStyle = line;
  ctx.lineWidth = Math.max(2, r * 0.06);
  const mouthY = cy + r * 0.42;
  if (expression === "웃음") {
    ctx.beginPath();
    ctx.arc(cx, mouthY - r * 0.1, r * 0.3, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  } else if (expression === "진지") {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.22, mouthY);
    ctx.lineTo(cx + r * 0.22, mouthY);
    ctx.stroke();
  } else if (expression === "당황") {
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.26, mouthY);
    ctx.quadraticCurveTo(cx - r * 0.08, mouthY - r * 0.12, cx + r * 0.02, mouthY);
    ctx.quadraticCurveTo(cx + r * 0.14, mouthY + r * 0.12, cx + r * 0.26, mouthY - r * 0.02);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, mouthY, r * 0.16, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (expression === "놀람" || expression === "당황") {
    const dx = cx + r * 0.78;
    const dy = cy - r * 0.34;
    ctx.beginPath();
    ctx.moveTo(dx, dy - r * 0.2);
    ctx.quadraticCurveTo(dx + r * 0.15, dy + r * 0.08, dx, dy + r * 0.14);
    ctx.quadraticCurveTo(dx - r * 0.15, dy + r * 0.08, dx, dy - r * 0.2);
    ctx.fillStyle = "#7EC8F2";
    ctx.fill();
  }
}

/* ------------------------------------------------------------------ *
 * 컷 1장
 * ------------------------------------------------------------------ */

/**
 * 컷 하나를 그린다. (좌표계: 컷 폭 1080)
 * ctx 는 이미 box 위치·스케일이 적용된 상태여도 되고, 아니면 {x,y,w,h} 를 넘긴다.
 */
export function drawCut(ctx, box, cut, styleId, imageEl, article = {}) {
  const theme = styleTheme(styleId);
  const s = box.w / CUT_SIZE;
  ctx.save();
  ctx.translate(box.x, box.y);
  ctx.scale(s, s);
  const W = CUT_SIZE;
  const H = (box.h || box.w) / s;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // 배경
  ctx.save();
  roundRect(ctx, 0, 0, W, H, 0);
  ctx.clip();
  paintBackground(ctx, W, H, styleId, 7 + (cut.index || 1) * 131, imageEl, theme);

  // 하단 가독성 그라데이션
  const shade = ctx.createLinearGradient(0, H * 0.42, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(0.62, styleId === "ghibli" || styleId === "webtoon" || styleId === "issuetoon" ? "rgba(20,25,30,0.12)" : "rgba(0,0,0,0.34)");
  shade.addColorStop(1, styleId === "photo" ? "rgba(4,7,12,0.82)" : "rgba(20,25,30,0.46)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 캐릭터 (실사 스타일은 배경 실루엣이 이미 있으니 생략)
  if (styleId !== "photo") {
    const pose = [
      { x: 0.7, y: 0.58, r: 102 },
      { x: 0.74, y: 0.56, r: 116 },
      { x: 0.66, y: 0.62, r: 148 },
      { x: 0.72, y: 0.6, r: 122 },
    ][(cut.index || 1) - 1] || { x: 0.7, y: 0.58, r: 108 };
    drawCharacter(ctx, W * pose.x, H * pose.y, pose.r, cut.expression || "놀람", theme, styleId);
  }

  // 상단 바
  const pad = 44;
  ctx.save();
  ctx.fillStyle = styleId === "issuetoon" ? "rgba(31,35,40,0.92)" : "rgba(10,14,20,0.55)";
  roundRect(ctx, pad, pad, W - pad * 2, 78, 39);
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = font(38, 800);
  ctx.fillStyle = styleId === "issuetoon" ? "#f7f1e1" : theme.accent;
  ctx.fillText(`CUT ${cut.index || 1}`, pad + 30, pad + 40);
  ctx.font = font(32, 600);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(cut.roleLabel || "", pad + 170, pad + 41);
  ctx.textAlign = "right";
  ctx.font = font(28, 600);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText("뉴스픽 스튜디오", W - pad - 30, pad + 41);
  ctx.restore();

  // 나레이션 박스
  const narrW = W - pad * 2;
  const narr = fitText(ctx, cut.narration || "", { maxWidth: narrW - 64, maxLines: 3, size: 54, minSize: 30, weight: 800 });
  const narrH = narr.lines.length * narr.lineHeight + 56;
  const narrY = pad + 104;
  ctx.save();
  ctx.fillStyle = theme.narration;
  roundRect(ctx, pad, narrY, narrW, narrH, 26);
  ctx.fill();
  if (styleId === "issuetoon") {
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  ctx.fillStyle = theme.accent;
  ctx.fillRect(pad, narrY + 18, 8, narrH - 36);
  ctx.fillStyle = theme.narrationInk;
  ctx.font = font(narr.size, 800);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  narr.lines.forEach((line, i) => ctx.fillText(line, pad + 34, narrY + 28 + i * narr.lineHeight));
  ctx.restore();

  // 말풍선
  const bubbleText = cut.dialogue || "";
  if (bubbleText) {
    const bubbleW = Math.min(W - pad * 2 - 30, 660);
    const inner = bubbleW - 76;
    const bub = fitText(ctx, bubbleText, { maxWidth: inner, maxLines: 3, size: 40, minSize: 24, weight: 700 });
    const bubH = bub.lines.length * bub.lineHeight + 84;
    const bx = pad + 18;
    const by = Math.max(narrY + narrH + 24, H - 96 - bubH);
    ctx.save();
    ctx.fillStyle = theme.bubble;
    roundRect(ctx, bx, by, bubbleW, bubH, 32);
    ctx.fill();
    ctx.strokeStyle = theme.bubbleLine;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 꼬리
    ctx.beginPath();
    ctx.moveTo(bx + 60, by + bubH - 2);
    ctx.lineTo(bx + 40, by + bubH + 42);
    ctx.lineTo(bx + 116, by + bubH - 2);
    ctx.closePath();
    ctx.fillStyle = theme.bubble;
    ctx.fill();
    ctx.strokeStyle = theme.bubbleLine;
    ctx.stroke();

    ctx.fillStyle = theme.accent;
    ctx.font = font(26, 800);
    ctx.textBaseline = "top";
    ctx.fillText(cut.speaker || "독자", bx + 34, by + 22);
    ctx.fillStyle = styleId === "photo" ? "#eef2f7" : theme.ink;
    ctx.font = font(bub.size, 700);
    bub.lines.forEach((line, i) => ctx.fillText(line, bx + 34, by + 60 + i * bub.lineHeight));
    ctx.restore();
  }

  // 푸터 스트립
  ctx.save();
  ctx.fillStyle = styleId === "photo" ? "rgba(4,7,12,0.78)" : "rgba(255,253,247,0.88)";
  ctx.fillRect(0, H - 56, W, 56);
  ctx.fillStyle = styleId === "photo" ? "rgba(255,255,255,0.8)" : theme.muted;
  ctx.font = font(24, 700);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`${(article.site || "뉴스픽").slice(0, 22)} · ${theme.name}`, pad, H - 28);
  ctx.textAlign = "right";
  ctx.fillText("© newspic-studio", W - pad, H - 28);
  ctx.restore();

  ctx.restore();
}

/* ------------------------------------------------------------------ *
 * 합본
 * ------------------------------------------------------------------ */

export const CUT_LAYOUTS = {
  grid: { id: "grid", name: "2×2 정사각", width: 2160, height: 2700, cols: 2, rows: 2, header: 180, gutter: 24, pad: 26, footer: 96 },
  vertical: { id: "vertical", name: "세로 4컷", width: 2160, height: 3840, cols: 1, rows: 4, header: 190, gutter: 22, pad: 24, footer: 100 },
};

export function cutLayout(id) {
  return CUT_LAYOUTS[id] || CUT_LAYOUTS.grid;
}

function drawSheetHeader(ctx, layout, article, theme, styleId) {
  const { width, header, pad } = layout;
  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, layout.height);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, width, 8);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = theme.ink;
  const title = fitText(ctx, article.title || "뉴스픽 4컷", {
    maxWidth: width - pad * 2 - 430,
    maxLines: 1,
    size: Math.round(header * 0.28),
    minSize: 24,
    weight: 800,
  });
  ctx.font = font(title.size, 800);
  ctx.fillText(title.lines[0] || "뉴스픽 4컷", pad, header / 2 + 4);
  ctx.textAlign = "right";
  ctx.fillStyle = theme.accent;
  ctx.font = font(Math.round(header * 0.2), 800);
  ctx.fillText("뉴스픽 스튜디오", width - pad, header / 2 - 16);
  ctx.fillStyle = theme.muted;
  ctx.font = font(Math.round(header * 0.15), 600);
  ctx.fillText(styleTheme(styleId).name + " · 4컷", width - pad, header / 2 + 22);
  ctx.restore();
}

export function renderSheet(canvas, { cuts, images = {}, style = "photo", layout = "grid", article = {} }) {
  const conf = cutLayout(layout);
  canvas.width = conf.width;
  canvas.height = conf.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const theme = styleTheme(style);
  drawSheetHeader(ctx, conf, article, theme, style);

  const innerW = conf.width - conf.pad * 2;
  const innerH = conf.height - conf.header - conf.footer - conf.gutter * (conf.rows - 1);
  const cellW = innerW / conf.cols;
  const cellH = innerH / conf.rows;

  cuts.forEach((cut, index) => {
    const col = index % conf.cols;
    const row = Math.floor(index / conf.cols);
    if (row >= conf.rows) return;
    const box = {
      x: conf.pad + col * cellW,
      y: conf.header + row * (cellH + conf.gutter),
      w: cellW,
      h: cellH,
    };
    const image = images[cut.index] || null;
    drawCut(ctx, box, cut, style, image, article);
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x + 1.5, box.y + 1.5, box.w - 3, box.h - 3);
    ctx.restore();
  });

  // 푸터
  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = theme.muted;
  ctx.font = font(30, 600);
  const footY = conf.height - conf.footer / 2;
  ctx.fillText("원문 기사는 첫 댓글 링크에서 · 카드뉴스 8장은 newspic-studio", conf.pad, footY);
  ctx.textAlign = "right";
  ctx.fillStyle = theme.accent;
  ctx.font = font(28, 800);
  ctx.fillText("NEWSPIC STUDIO", conf.width - conf.pad, footY);
  ctx.restore();
}

/** 컷 1장을 1080×1080 오프스크린 캔버스에 그린다. */
export function renderCutCanvas(cut, style, imageEl, article) {
  const canvas = document.createElement("canvas");
  canvas.width = CUT_SIZE;
  canvas.height = CUT_SIZE;
  const ctx = canvas.getContext("2d");
  drawCut(ctx, { x: 0, y: 0, w: CUT_SIZE, h: CUT_SIZE }, cut, style, imageEl, article);
  return canvas;
}

export function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
