/* /api/health — 배포 상태·기능 확인 */
import { MAIN_CATEGORY_IDS } from "./feed.js";
import { providers } from "./auth/_session.js";
import { PARTNER_TRACKING, trackingFromEnv } from "./_lib.js";

export async function onRequest(context) {
  const env = (context && context.env) || {};
  const tracking = trackingFromEnv(env);
  const data = {
    ok: true,
    service: "agent-collab-studio",
    version: "2.4.0",
    modes: ["agent", "studio"],
    time: new Date().toISOString(),
    features: {
      unifiedStudio: true,
      collabAi: true,
      collabModels: [
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "@cf/qwen/qwen3.8-27b",
        "@cf/google/gemma-4-26b-a4b-it",
        "@cf/meta/llama-3.1-8b-instruct-fast",
      ],
      collabModes: ["turn", "report"],
      collabFallback: true,
      aiPool: true,
      aiPoolOrder: ["workers-ai", "groq", "gemini", "openrouter", "cerebras", "mistral", "ollama", "local"],
      aiPoolRotation: true,
      aiPoolRoundRobin: true,
      aiPoolPaidAuto: false,
      aiPoolBudgetSplit: true,
      artifactDownloads: ["md", "zip"],
      geminiModels: ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"],
      generateProject: true,
      generateProjectArchetypes: ["pomodoro", "calculator", "todo", "quiz", "notes", "directory", "dashboard"],
      smartFallback: true,
      twoPhasePrompt: true,
      instantBuild: true,
      instantSpeed: true,
      projectFiles: ["index.html", "style.css", "app.js", "README.md"],
      deployGithub: true,
      deployCloudflarePages: true,
      zipDownload: true,
      mirror: true,
      bodyImages: 8,
      kv: Boolean(env.ARCHIVE && typeof env.ARCHIVE.get === "function"),
      freeImage: true,
      workersAi: Boolean(env.AI && typeof env.AI.run === "function"),
      byok: ["groq", "gemini", "openrouter", "cerebras", "mistral", "openai"],
      feed: true,
      feedCategories: ["all", ...MAIN_CATEGORY_IDS],
      feedCategoryCount: MAIN_CATEGORY_IDS.length,
      feedLimit: 20,
      partners: true,
      partnersSeed: 20,
      partnersTracking: tracking,
      trackingDefault: PARTNER_TRACKING,
      cards: [4, 6, 8, 10],
      defaultCards: 8,
      cardLayouts: ["split", "full"],
      cardTitleScale: 0.9,
      cardBodyScale: 0.7,
      imageModes: ["ai", "article"],
      cardImageModes: ["ai", "article"],
      cardImages: true,
      promptBuilder: true,
      promptModels: [
        "@cf/meta/llama-3.1-8b-instruct",
        "@cf/qwen/qwen2.5-7b-instruct",
        "@cf/meta/llama-3.2-3b-instruct",
      ],
      englishOnlyPrompts: true,
      autoGenerate: true,
      channels: 6,
      channelAccounts: true,
      auth: true,
      oauth: providers(env),
    },
  };
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
