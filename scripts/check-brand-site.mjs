import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const siteRoot = path.join(root, "apps/brand-site/public");
const pages = [
  { file: "index.html", canonical: "https://www.meccha-iiyatsu.com/" },
  { file: "app/index.html", canonical: "https://www.meccha-iiyatsu.com/app" },
  { file: "app/meccha-manual/index.html", canonical: "https://www.meccha-iiyatsu.com/app/meccha-manual" }
];
const errors = [];

for (const page of pages) {
  const html = await readFile(path.join(siteRoot, page.file), "utf8");
  const required = [
    '<html lang="ja">', '<meta name="viewport"', '<meta name="description"',
    `<link rel="canonical" href="${page.canonical}">`, '<meta property="og:title"',
    '<meta property="og:description"', `<meta property="og:url" content="${page.canonical}">`,
    '<meta property="og:image"', '<meta name="twitter:card" content="summary">',
    'class="skip-link"', 'id="main"'
  ];
  for (const snippet of required) {
    if (!html.includes(snippet)) errors.push(`${page.file}: missing ${snippet}`);
  }
  if ((html.match(/<h1(?:\s|>)/g) ?? []).length !== 1) errors.push(`${page.file}: exactly one h1 is required`);

  for (const href of html.matchAll(/(?:href|src)="(\/[^"]+)"/g)) {
    const cleanPath = href[1].split(/[?#]/, 1)[0];
    if (cleanPath === "/") continue;
    const relative = path.extname(cleanPath)
      ? cleanPath.slice(1)
      : path.join(cleanPath.slice(1), "index.html");
    try { await access(path.join(siteRoot, relative)); } catch { errors.push(`${page.file}: local target not found ${cleanPath}`); }
  }
}

const lp = await readFile(path.join(siteRoot, "app/meccha-manual/index.html"), "utf8");
const appUrl = "https://meccha-manual.meccha-iiyatsu.com";
if ((lp.match(new RegExp(appUrl.replaceAll(".", "\\."), "g")) ?? []).length < 2) errors.push("LP: primary and final app CTA are required");
const appIndex = await readFile(path.join(siteRoot, "app/index.html"), "utf8");
if (!appIndex.includes(appUrl)) errors.push("App index: app subdomain link is required");

const headers = await readFile(path.join(siteRoot, "_headers"), "utf8");
for (const header of ["Content-Security-Policy:", "Permissions-Policy:", "Referrer-Policy:", "X-Content-Type-Options:"]) {
  if (!headers.includes(header)) errors.push(`_headers: missing ${header}`);
}
for (const route of ["/\n", "/app\n", "/app/meccha-manual\n", "/assets/*\n"]) {
  if (!headers.includes(route)) errors.push(`_headers: missing cache rule for ${route.trim() || "/"}`);
}

const wrangler = await readFile(path.join(root, "wrangler.brand.jsonc"), "utf8");
for (const snippet of ['"name": "meccha-iiyatsu-web"', '"directory": "./apps/brand-site/public"', '"not_found_handling": "404-page"', '"html_handling": "drop-trailing-slash"']) {
  if (!wrangler.includes(snippet)) errors.push(`wrangler.brand.jsonc: missing ${snippet}`);
}
if (/meccha-iiyatsu\.com/.test(wrangler)) errors.push("wrangler.brand.jsonc: production custom domain must not be enabled without approval");

if (errors.length > 0) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Brand site OK: ${pages.length} pages, metadata, links, CTAs and security headers checked.`);
