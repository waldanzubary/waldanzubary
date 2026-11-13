import fs from "node:fs/promises";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import gifenc from "gifenc";

const { GIFEncoder, applyPalette, quantize } = gifenc;

const ROOT = new URL("..", import.meta.url);
const LOGIN = "waldanzubary";
const REPO = "waldanzubary/waldanzubary";
const EMBED = process.env.EMBED_URL || "https://www.waldan.my.id/embed/sea";

function wibDay() {
  const offset = 7 * 60 * 60 * 1000;
  const now = new Date();
  const local = new Date(now.getTime() + offset);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset;
  return {
    from: new Date(start).toISOString(),
    to: new Date(start + 24 * 60 * 60 * 1000).toISOString(),
    label: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
  };
}

async function countCommits() {
  if (process.env.FISH_COMMITS) return Number(process.env.FISH_COMMITS);
  const token = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Missing PROFILE_TOKEN or GITHUB_TOKEN");
  const { from, to } = wibDay();
  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          commitContributionsByRepository(maxRepositories: 100) {
            contributions(first: 1) { totalCount }
          }
        }
      }
    }
  `;
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "fish-profile-updater",
    },
    body: JSON.stringify({ query, variables: { login: LOGIN, from, to } }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(`GitHub GraphQL failed: ${JSON.stringify(payload.errors ?? payload)}`);
  }
  const repos = payload.data?.user?.contributionsCollection?.commitContributionsByRepository ?? [];
  return repos.reduce((sum, item) => sum + (item.contributions?.totalCount ?? 0), 0);
}

function mood(commits) {
  if (commits < 5) return { text: "lapar... commit dulu", scale: 0.7 };
  if (commits <= 10) return { text: "lumayan...", scale: 0.9 };
  if (commits <= 20) return { text: "kenyang", scale: 1.1 };
  return { text: "wareg banget", scale: 1.3 };
}

async function record(page, theme, commits) {
  const url = `${EMBED}?commits=${commits}&theme=${theme}&v=${Date.now()}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("#sea-canvas", { timeout: 10000 });
  await page.waitForTimeout(900);

  const frames = [];
  for (let index = 0; index < 18; index += 1) {
    const buffer = await page.screenshot({ type: "png", animations: "allow" });
    frames.push(PNG.sync.read(Buffer.from(buffer)));
    await page.waitForTimeout(85);
  }

  const palette = quantize(frames[0].data, 256);
  const gif = GIFEncoder();
  frames.forEach((frame, index) => {
    const indexed = applyPalette(frame.data, palette);
    gif.writeFrame(indexed, frame.width, frame.height, {
      ...(index === 0 ? { palette } : {}),
      delay: 85,
      repeat: 0,
    });
  });
  gif.finish();
  return gif.bytes();
}

function readmeBlock(commits, date) {
  const v = `${date.replaceAll("-", "")}-${commits}`;
  const base = `https://raw.githubusercontent.com/${REPO}/main/assets`;
  return `<!-- FISH:START -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="${base}/fish-dark.gif?v=${v}">
    <source media="(prefers-color-scheme: light)" srcset="${base}/fish-light.gif?v=${v}">
    <img src="${base}/fish-light.gif?v=${v}" alt="Waldan's animated sea with ${commits} commits today" width="1000">
  </picture>
</p>
<!-- FISH:END -->`;
}

const day = wibDay();
const commits = await countCommits();
const state = mood(commits);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 1000, height: 420 },
  deviceScaleFactor: 1,
});

try {
  const dark = await record(page, "dark", commits);
  const light = await record(page, "light", commits);
  await fs.writeFile(new URL("assets/fish-dark.gif", ROOT), dark);
  await fs.writeFile(new URL("assets/fish-light.gif", ROOT), light);
} finally {
  await browser.close();
}

const readmePath = new URL("README.md", ROOT);
let readme = await fs.readFile(readmePath, "utf8");
const block = readmeBlock(commits, day.label);
readme = readme.includes("<!-- FISH:START -->")
  ? readme.replace(/<!-- FISH:START -->[\s\S]*?<!-- FISH:END -->/, block)
  : `${block}\n\n${readme}`;
await fs.writeFile(readmePath, readme);

console.log(`gif updated: ${commits} commits on ${day.label} WIB (${state.text})`);
