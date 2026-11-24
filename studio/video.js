/* 뉴스픽 스튜디오 | 8장 카드뉴스 → 9:16 슬라이드쇼 영상(.webm)
 * Canvas + MediaRecorder 로 브라우저에서 바로 만든다. (서버·API 키 불필요)
 */
import { drawCard, ratioInfo } from "./cards.js";

export function videoSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder === "function" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  );
}

function pickMime() {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of candidates) {
    if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(type)) return type;
  }
  return "video/webm";
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * 카드 8장을 순서대로 넘기는 세로 영상.
 * @param {object} opts {cards, theme, imageEl, secondsPerSlide, onProgress, signal}
 * @returns {Promise<Blob>}
 */
export async function recordSlideshow({
  cards,
  theme = "magazine",
  imageEl = null,
  visuals = [],
  layout = "split",
  secondsPerSlide = 2.2,
  onProgress = () => {},
  fps = 30,
  canvas = null,
}) {
  if (!videoSupported()) throw new Error("이 브라우저는 영상 녹화(MediaRecorder)를 지원하지 않습니다.");
  if (!Array.isArray(cards) || !cards.length) throw new Error("카드가 없습니다.");

  const info = ratioInfo("9:16");
  const target = canvas || document.createElement("canvas");
  target.width = info.width;
  target.height = info.height;
  const ctx = target.getContext("2d");

  // 카드별로 미리 렌더 (전환 중 다시 그리지 않도록)
  const frames = cards.map((card, index) => {
    const off = document.createElement("canvas");
    off.width = info.width;
    off.height = info.height;
    const octx = off.getContext("2d");
    const visual = visuals.length ? visuals[index] || (card.kind === "cover" ? imageEl : null) : card.kind === "cover" ? imageEl : null;
    drawCard(octx, info.width, info.height, card, theme, visual, { total: cards.length, layout, index });
    return off;
  });

  const stream = target.captureStream(fps);
  const mimeType = pickMime();
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  const done = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  const totalMs = cards.length * secondsPerSlide * 1000;
  const started = performance.now();
  recorder.start(200);

  await new Promise((resolve) => {
    function tick() {
      const elapsed = performance.now() - started;
      if (elapsed >= totalMs) {
        ctx.clearRect(0, 0, info.width, info.height);
        resolve();
        return;
      }
      const position = elapsed / 1000 / secondsPerSlide;
      const index = Math.min(frames.length - 1, Math.floor(position));
      const localT = Math.min(1, position - index);
      const current = frames[index];
      const next = frames[Math.min(frames.length - 1, index + 1)];
      const transition = localT > 0.82 && index < frames.length - 1 ? (localT - 0.82) / 0.18 : 0;
      const zoom = 1.03 - 0.03 * easeInOut(localT);

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, info.width, info.height);
      ctx.save();
      ctx.globalAlpha = 1;
      const w = info.width * zoom;
      const h = info.height * zoom;
      ctx.drawImage(current, (info.width - w) / 2, (info.height - h) / 2, w, h);
      if (transition > 0) {
        ctx.globalAlpha = easeInOut(transition);
        ctx.drawImage(next, (info.width - w) / 2, (info.height - h) / 2, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // 상단 진행 바
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(0, 0, info.width, 10);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, (info.width * Math.min(1, elapsed / totalMs)), 10);

      onProgress(Math.min(1, elapsed / totalMs));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });

  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  const blob = await done;
  if (!blob.size) throw new Error("영상 데이터가 비어 있습니다. 다시 시도해 주세요.");
  return blob;
}
