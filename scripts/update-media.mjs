import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import gifenc from "gifenc";

const { GIFEncoder, applyPalette, quantize } = gifenc;
const ROOT = new URL("..", import.meta.url);
const LOGIN = "waldanzubary";
const REPO = "waldanzubary/waldanzubary";
const EMBED = process.env.EMBED_URL || "https://www.waldan.my.id/embed/sea";
const SECONDS = Math.max(5, Number(process.env.FISH_SECONDS) || 60);
const FPS = Math.max(4, Number(process.env.FISH_FPS) || 6);
const FRAME_COUNT = Math.round(SECONDS * FPS);
const FRAME_DELAY = Math.round(1000 / FPS);

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

function speechLines(commits) {
  if (commits < 5) return ["lapar...", "commit dulu...", "blub blub", "cari makan..."];
  if (commits <= 10) return ["lumayan...", "enak juga", "blub...", "oke juga"];
  if (commits <= 20) return ["kenyang", "wareg", "mantap", "nyam nyam"];
  return ["wareg banget", "kekenyangan", "susah gerak...", "blub..."];
}

async function capture(page, commits, dir) {
  await page.goto(`${EMBED}?commits=${commits}&theme=dark&v=${Date.now()}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForSelector("#sea-canvas", { timeout: 10000 });
  await page.waitForTimeout(900);

  const files = [];
  for (let index = 0; index < FRAME_COUNT; index += 1) {
    const file = path.join(dir, `frame-${String(index).padStart(4, "0")}.png`);
    await page.screenshot({ path: file, type: "png", animations: "allow" });
    files.push(file);
    await page.waitForTimeout(FRAME_DELAY);
  }
  return files;
}

function encodeGif(files) {
  const step = Math.max(1, Math.floor(files.length / 96));
  const sample = files.filter((_, index) => index % step === 0).slice(0, 96);
  const gif = GIFEncoder();
  let palette;
  sample.forEach((file, index) => {
    const frame = PNG.sync.read(readFileSync(file));
    if (!palette) palette = quantize(frame.data, 256);
    const indexed = applyPalette(frame.data, palette);
    gif.writeFrame(indexed, frame.width, frame.height, {
      ...(index === 0 ? { palette } : {}),
      delay: FRAME_DELAY,
      repeat: 0,
    });
  });
  gif.finish();
  return gif.bytes();
}

function readmeBlock(commits, date) {
  const v = `${date.replaceAll("-", "")}-${commits}-${FRAME_COUNT}`;
  const base = `https://raw.githubusercontent.com/${REPO}/main/assets`;
  return `<!-- FISH:START -->
<p align="center">
  <picture>
    <source type="image/webp" srcset="${base}/fish.webp?v=${v}">
    <img src="${base}/fish.gif?v=${v}" alt="Waldan's animated sea with ${commits} commits today" width="800">
  </picture>
</p>
<!-- FISH:END -->`;
}

function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchBlog() {
  const response = await fetch("https://www.waldan.my.id/rss.xml", {
    headers: { "User-Agent": "fish-profile-updater" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`RSS ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((match) => {
      const item = match[1];
      const title = decodeXml(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim();
      const link = decodeXml(item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
      const pubDate = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
      return { title, link, date: pubDate ? new Date(pubDate) : null };
    })
    .filter((item) => item.title && item.link)
    .slice(0, 6);
}

async function fetchCommits() {
  const token = process.env.PROFILE_TOKEN || process.env.GITHUB_TOKEN;
  const response = await fetch(
    "https://api.github.com/search/commits?q=author:waldanzubary&sort=committer-date&order=desc&per_page=7",
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: "application/vnd.github+json",
        "User-Agent": "fish-profile-updater",
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error(`commit search ${response.status}`);
  const payload = await response.json();
  return (payload.items ?? [])
    .filter((item) => item.repository && !item.repository.private)
    .slice(0, 7)
    .map((item) => ({
      repo: item.repository.full_name,
      message: (item.commit?.message ?? "").split("\n")[0],
      url: item.html_url,
      date: item.commit?.committer?.date ? new Date(item.commit.committer.date) : null,
    }));
}

function dateLabel(value) {
  if (!value || Number.isNaN(value.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(value);
}

function cell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function updatesBlock(posts, commits) {
  const rows = [
    ...posts.map((post) => ({
      type: "note",
      text: `[${cell(post.title)}](${post.link})`,
      date: post.date,
    })),
    ...commits.map((commit) => ({
      type: "commit",
      text: `[${cell(commit.repo)} — ${cell(commit.message).slice(0, 64)}](${commit.url})`,
      date: commit.date,
    })),
  ];
  if (!rows.length) return "<!-- UPDATES:START -->\n_No updates yet._\n<!-- UPDATES:END -->";
  const table = rows
    .map(
      (row, index) =>
        `| ${String(index + 1).padStart(2, "0")} | ${row.text} | ${row.type} | ${dateLabel(row.date)} |`,
    )
    .join("\n");
  return `<!-- UPDATES:START -->
| # | Update | Type | Date |
|---:|---|---|---|
${table}
<!-- UPDATES:END -->`;
}

function replaceBlock(readme, name, block) {
  return readme.replace(new RegExp(`<!-- ${name}:START -->[\\s\\S]*?<!-- ${name}:END -->`), block);
}

const day = wibDay();
const commits = await countCommits();
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fish-frames-"));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  args: ["--no-sandbox"],
});
const page = await browser.newPage({
  viewport: { width: 800, height: 336 },
  deviceScaleFactor: 1,
});

try {
  const frames = await capture(page, commits, dir);
  const webpPath = path.join(dir, "fish.webp");
  execFileSync(
    process.env.IMG2WEBP || "img2webp",
    ["-loop", "0", "-lossy", "-q", "60", "-m", "6", "-d", String(FRAME_DELAY), "-o", webpPath, ...frames],
    { stdio: "inherit" },
  );
  const gif = encodeGif(frames);
  await fs.copyFile(webpPath, new URL("assets/fish.webp", ROOT));
  await fs.writeFile(new URL("assets/fish.gif", ROOT), gif);

  const readmePath = new URL("README.md", ROOT);
  let readme = await fs.readFile(readmePath, "utf8");
  const block = readmeBlock(commits, day.label);
  readme = readme.includes("<!-- FISH:START -->")
    ? readme.replace(/<!-- FISH:START -->[\s\S]*?<!-- FISH:END -->/, block)
    : `${block}\n\n${readme}`;

  let posts = [];
  let latestCommits = [];
  try {
    posts = await fetchBlog();
  } catch (error) {
    console.warn(`blog table skipped: ${error.message}`);
  }
  try {
    latestCommits = await fetchCommits();
  } catch (error) {
    console.warn(`commit table skipped: ${error.message}`);
  }
  readme = replaceBlock(readme, "UPDATES", updatesBlock(posts, latestCommits));

  await fs.writeFile(readmePath, readme);
  console.log(`media updated: ${commits} commits, ${FRAME_COUNT} frames, ${SECONDS}s @ ${FPS}fps`);
} finally {
  await browser.close();
  await fs.rm(dir, { recursive: true, force: true });
}

