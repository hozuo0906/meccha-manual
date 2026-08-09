import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const siteRoot = path.join(root, "apps/brand-site/public");
const appDirectories = (await readdir(path.join(siteRoot, "app"), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const appRegistry = JSON.parse(await readFile(path.join(root, "apps/brand-site/apps.json"), "utf8"));
const pages = [
  { file: "index.html", canonical: "https://www.meccha-iiyatsu.com/" },
  { file: "app/index.html", canonical: "https://www.meccha-iiyatsu.com/app" },
  ...appDirectories.map((slug) => ({
    file: `app/${slug}/index.html`,
    canonical: `https://www.meccha-iiyatsu.com/app/${slug}`
  }))
];
const errors = [];

function appCtaTags(html, slug, placement) {
  return [...html.matchAll(/<(?:a|span)\b[^>]*>/g)]
    .map((match) => match[0])
    .filter((tag) => tag.includes(`data-app-slug="${slug}"`) && tag.includes(`data-app-cta="${placement}"`));
}

function linksToOrigin(html, origin) {
  return [...html.matchAll(/href="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((href) => {
      try { return new URL(href, "https://www.meccha-iiyatsu.com").origin === origin; }
      catch { return false; }
    });
}

if (!Array.isArray(appRegistry)) errors.push("apps.json: array is required");
const registrySlugs = Array.isArray(appRegistry) ? appRegistry.map((app) => app.slug).sort() : [];
if (JSON.stringify(registrySlugs) !== JSON.stringify(appDirectories)) {
  errors.push("apps.json: slugs must match every app LP directory exactly");
}

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

const appIndex = await readFile(path.join(siteRoot, "app/index.html"), "utf8");
for (const app of Array.isArray(appRegistry) ? appRegistry : []) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(app.slug ?? "")) errors.push(`apps.json: invalid slug ${app.slug ?? "(missing)"}`);
  if (!["prelaunch", "live"].includes(app.publicationStatus)) errors.push(`apps.json: invalid publicationStatus for ${app.slug}`);
  if (app.appUrl !== `https://${app.slug}.meccha-iiyatsu.com`) errors.push(`apps.json: invalid appUrl for ${app.slug}`);
  if (!appIndex.includes(`href="/app/${app.slug}"`)) errors.push(`App index: LP link is required for ${app.slug}`);

  const lp = await readFile(path.join(siteRoot, `app/${app.slug}/index.html`), "utf8");
  const combinedHtml = `${appIndex}\n${lp}`;
  const ctas = [
    ...appCtaTags(appIndex, app.slug, "index"),
    ...appCtaTags(lp, app.slug, "primary"),
    ...appCtaTags(lp, app.slug, "final")
  ];
  const appOrigin = new URL(app.appUrl).origin;
  if (app.publicationStatus === "prelaunch") {
    if (linksToOrigin(combinedHtml, appOrigin).length > 0) errors.push(`${app.slug}: prelaunch pages must not link anywhere on the unverified app origin`);
    if (ctas.length !== 3 || ctas.some((tag) => !tag.startsWith("<span") || !tag.includes('aria-disabled="true"'))) {
      errors.push(`${app.slug}: index, primary and final prelaunch CTAs must each be a disabled span`);
    }
  } else if (ctas.length !== 3 || ctas.some((tag) => !tag.startsWith("<a") || !tag.includes(`href="${app.appUrl}"`))) {
    errors.push(`${app.slug}: index, primary and final live CTAs must each link to the exact app URL`);
  }
}

const headers = await readFile(path.join(siteRoot, "_headers"), "utf8");
for (const header of ["Content-Security-Policy:", "Permissions-Policy:", "Referrer-Policy:", "X-Content-Type-Options:"]) {
  if (!headers.includes(header)) errors.push(`_headers: missing ${header}`);
}
for (const route of ["/\n", "/app\n", ...appDirectories.map((slug) => `/app/${slug}\n`), "/assets/*\n"]) {
  if (!headers.includes(route)) errors.push(`_headers: missing cache rule for ${route.trim() || "/"}`);
}

const wrangler = await readFile(path.join(root, "wrangler.brand.jsonc"), "utf8");
for (const snippet of ['"name": "meccha-iiyatsu-web"', '"directory": "./apps/brand-site/public"', '"not_found_handling": "404-page"', '"html_handling": "drop-trailing-slash"']) {
  if (!wrangler.includes(snippet)) errors.push(`wrangler.brand.jsonc: missing ${snippet}`);
}
if (/meccha-iiyatsu\.com/.test(wrangler)) errors.push("wrangler.brand.jsonc: production custom domain must not be enabled without approval");

if (errors.length > 0) { console.error(errors.join("\n")); process.exit(1); }
console.log(`Brand site OK: ${pages.length} pages, metadata, links, CTAs and security headers checked.`);
