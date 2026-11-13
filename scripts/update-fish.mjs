import fs from "node:fs/promises";

const ROOT = new URL("..", import.meta.url);
const ART = JSON.parse(await fs.readFile(new URL("fish-art.json", ROOT), "utf8"));
const LOGIN = "waldanzubary";
const REPO = "waldanzubary/waldanzubary";

const THEMES = {
  dark: {
    bg: "#04121C",
    panel: "#061A24",
    border: "#1B4B54",
    text: "#EAF4F6",
    muted: "#7FA6B2",
    accent: "#59F1E3",
    shade: "#2E8C87",
    fins: "#1B6B72",
    outline: "#5EEAD4",
    eyes: "#CFFBF7",
  },
  light: {
    bg: "#F3FBF9",
    panel: "#FFFFFF",
    border: "#B8D8D2",
    text: "#062A33",
    muted: "#4E6E74",
    accent: "#0B7A73",
    shade: "#7DB8AE",
    fins: "#2E6E72",
    outline: "#0B6B66",
    eyes: "#04121C",
  },
};

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
  if (commits < 5) return { text: "lapar... commit dulu", scale: 0.62 };
  if (commits <= 10) return { text: "lumayan...", scale: 0.86 };
  if (commits <= 20) return { text: "kenyang", scale: 1.08 };
  return { text: "wareg banget", scale: 1.32 };
}

function dots(layer, color, radius = 0.68) {
  return `<g fill="${color}">${ART.layers[layer]
    .map(([x, y]) => `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="${radius}"/>`)
    .join("")}</g>`;
}

function svg(theme, commits, date) {
  const t = THEMES[theme];
  const state = mood(commits);
  const s = 4 * state.scale;
  const countLabel = String(commits).padStart(2, "0");
  const escapedMood = state.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 900 300" role="img" aria-label="Waldan Zubary fish: ${commits} commits today">
  <rect width="900" height="300" rx="14" fill="${t.bg}"/>
  <rect x="1" y="1" width="898" height="298" rx="13" fill="none" stroke="${t.border}" opacity=".75"/>
  <text x="42" y="52" fill="${t.accent}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="22" font-weight="700" letter-spacing="3">&gt;&lt;&gt; WALDAN ZUBARY</text>
  <text x="42" y="78" fill="${t.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12" letter-spacing="1.5">AI ENGINEER · SOFTWARE ENGINEER</text>

  <g>
    <animateTransform attributeName="transform" type="translate" values="248 190;248 185;248 190;248 195;248 190" keyTimes="0;0.25;0.5;0.75;1" dur="6s" repeatCount="indefinite"/>
    <g transform="scale(${s}) translate(-32 -16)">
      ${dots("shade", t.shade)}
      <g>
        <animateTransform attributeName="transform" type="rotate" values="0 40 16;3 40 16;0 40 16;-3 40 16;0 40 16" keyTimes="0;0.25;0.5;0.75;1" dur="2.4s" repeatCount="indefinite"/>
        ${dots("fins", t.fins)}
      </g>
      ${dots("outline", t.outline, 0.76)}
      <g>
        <animate attributeName="opacity" values="1;1;0;1;1" keyTimes="0;0.7;0.72;0.74;1" dur="5.5s" repeatCount="indefinite"/>
        ${dots("eyes", t.eyes, 0.8)}
      </g>
    </g>
  </g>

  <g fill="${t.accent}" opacity=".22">
    <circle cx="94" cy="246" r="1.4"><animate attributeName="cy" values="246;230;214" dur="4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".4;.15;0" dur="4s" repeatCount="indefinite"/></circle>
    <circle cx="116" cy="250" r="1"><animate attributeName="cy" values="250;236;222" dur="5s" repeatCount="indefinite"/><animate attributeName="opacity" values=".35;.12;0" dur="5s" repeatCount="indefinite"/></circle>
    <circle cx="366" cy="112" r="1.2"><animate attributeName="cy" values="112;98;84" dur="3.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".4;.15;0" dur="3.6s" repeatCount="indefinite"/></circle>
  </g>

  <path d="M470 126 L440 142 L470 158 Z" fill="${t.panel}" stroke="${t.border}"/>
  <rect x="468" y="92" width="390" height="102" rx="8" fill="${t.panel}" stroke="${t.border}"/>
  <text x="490" y="126" fill="${t.text}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="15">"${escapedMood}"</text>
  <text x="490" y="154" fill="${t.accent}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13" letter-spacing="1">COMMITS TODAY: ${countLabel}</text>
  <text x="490" y="176" fill="${t.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="10" letter-spacing="1">${date} · WIB</text>

  <path d="M42 264 C150 252 220 276 310 264 S470 252 560 264 S760 276 858 258" fill="none" stroke="${t.accent}" stroke-width="1" opacity=".25"/>
  <g fill="${t.accent}" opacity=".28" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="10">
    <text x="42" y="286">~ ≈ · ~ ≈ · ~ ≈ ·</text>
    <text x="760" y="286">· ~ ≈ ~</text>
  </g>
</svg>`;
}

function readmeBlock(commits, date) {
  const v = `${date.replaceAll("-", "")}-${commits}`;
  const base = `https://raw.githubusercontent.com/${REPO}/main/assets`;
  return `<!-- FISH:START -->
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="${base}/fish-dark.svg?v=${v}">
    <source media="(prefers-color-scheme: light)" srcset="${base}/fish-light.svg?v=${v}">
    <img src="${base}/fish-light.svg?v=${v}" alt="Waldan's animated fish with ${commits} commits today" width="900">
  </picture>
</p>
<!-- FISH:END -->`;
}

const day = wibDay();
const commits = await countCommits();
const state = mood(commits);

await fs.writeFile(new URL("assets/fish-dark.svg", ROOT), svg("dark", commits, day.label));
await fs.writeFile(new URL("assets/fish-light.svg", ROOT), svg("light", commits, day.label));

const readmePath = new URL("README.md", ROOT);
let readme = await fs.readFile(readmePath, "utf8");
const block = readmeBlock(commits, day.label);
readme = readme.includes("<!-- FISH:START -->")
  ? readme.replace(/<!-- FISH:START -->[\s\S]*?<!-- FISH:END -->/, block)
  : `${block}\n\n${readme}`;
await fs.writeFile(readmePath, readme);

console.log(`fish updated: ${commits} commits on ${day.label} WIB (${state.text})`);
