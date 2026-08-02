import { readFile } from "node:fs/promises";

const labelsPath = ".github/issue-labels.json";
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check") || process.env.ISSUE_LABEL_SYNC_CHECK === "true";
const dryRun = args.has("--dry-run") || process.env.ISSUE_LABEL_SYNC_DRY_RUN === "true";

function normalizeColor(color) {
  return String(color || "").replace(/^#/, "").toUpperCase();
}

function validateLabels(labels) {
  const errors = [];
  const seen = new Set();

  if (!Array.isArray(labels)) {
    return ["issue label definitions must be an array."];
  }

  for (const [index, label] of labels.entries()) {
    const prefix = `label[${index}]`;
    const name = String(label?.name || "");
    const color = normalizeColor(label?.color);
    const description = String(label?.description || "");

    if (!name || name.length > 50) {
      errors.push(`${prefix}.name must be 1-50 characters.`);
    }

    if (seen.has(name.toLowerCase())) {
      errors.push(`${prefix}.name is duplicated: ${name}`);
    }

    seen.add(name.toLowerCase());

    if (!/^[0-9A-F]{6}$/.test(color)) {
      errors.push(`${prefix}.color must be a 6 digit hex color without #.`);
    }

    if (!description || description.length > 100) {
      errors.push(`${prefix}.description must be 1-100 characters.`);
    }
  }

  return errors;
}

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required unless --check is used.");
  }

  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "meccha-manual-issue-label-sync",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (response.status === 204) return null;

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = payload?.message || response.statusText;
    throw new Error(`GitHub API ${options.method || "GET"} ${path} failed: HTTP ${response.status} ${message}`);
  }

  return payload;
}

async function listExistingLabels() {
  const labels = [];

  for (let page = 1; page <= 20; page += 1) {
    const payload = await githubRequest(`/labels?per_page=100&page=${page}`);
    labels.push(...payload);
    if (payload.length < 100) break;
  }

  return new Map(labels.map((label) => [label.name.toLowerCase(), label]));
}

async function syncLabels(labels) {
  const existing = await listExistingLabels();
  const actions = [];

  for (const label of labels) {
    const desired = {
      name: label.name,
      color: normalizeColor(label.color),
      description: label.description
    };
    const current = existing.get(desired.name.toLowerCase());

    if (!current) {
      actions.push({ action: "create", label: desired });
      if (!dryRun) {
        await githubRequest("/labels", {
          method: "POST",
          body: JSON.stringify(desired)
        });
      }
      continue;
    }

    const needsUpdate =
      normalizeColor(current.color) !== desired.color ||
      (current.description || "") !== desired.description;

    if (needsUpdate) {
      actions.push({ action: "update", label: desired });
      if (!dryRun) {
        await githubRequest(`/labels/${encodeURIComponent(current.name)}`, {
          method: "PATCH",
          body: JSON.stringify({
            new_name: desired.name,
            color: desired.color,
            description: desired.description
          })
        });
      }
    }
  }

  return actions;
}

const labels = JSON.parse(await readFile(labelsPath, "utf8"));
const errors = validateLabels(labels);

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

if (checkOnly) {
  console.log(`Issue labels OK: ${labels.length} labels checked.`);
  process.exit(0);
}

const actions = await syncLabels(labels);
const mode = dryRun ? "dry-run" : "sync";

if (actions.length === 0) {
  console.log(`Issue label ${mode}: no changes.`);
} else {
  console.log(`Issue label ${mode}: ${actions.length} changes.`);
  for (const action of actions) {
    console.log(`- ${action.action}: ${action.label.name}`);
  }
}
