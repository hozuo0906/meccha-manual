import { readFile } from "node:fs/promises";

const docs = [
  "docs/03-architecture/adrs/ADR-0018-r2-bucket-binding-contract.md",
  "docs/04-data/storage-object-contract.md",
  "docs/08-operations/r2-storage-harness.md"
];
const tableDefinitionsPath = "docs/04-data/table-definitions.md";
const implementationFiles = [
  "apps/worker/src/domain/storage/object-storage.mjs",
  "apps/worker/src/infra/storage/memory-object-storage.mjs",
  "apps/worker/src/infra/storage/r2-object-storage.mjs",
  "scripts/test-r2-storage-stub.mjs"
];

const requiredBindings = [
  "CAPTURE_ASSETS",
  "MANUAL_ASSETS",
  "EXPORTS",
  "AVATARS"
];

const requiredBucketNames = [
  "meccha-manual-capture-assets-staging",
  "meccha-manual-capture-assets-prod",
  "meccha-manual-manual-assets-staging",
  "meccha-manual-manual-assets-prod",
  "meccha-manual-exports-staging",
  "meccha-manual-exports-prod",
  "meccha-manual-avatars-staging",
  "meccha-manual-avatars-prod"
];

const requiredTerms = [
  "production 4 bucketはまだ作成しない",
  "bucket自体はpublicにしない",
  "Worker経由",
  "D1 assetsメタデータ",
  "短期署名URL",
  "保持期間",
  "PII",
  "resource_id",
  "bodyから再計算",
  "完全一致",
  "同じdomain shape",
  "業務assetのreadは毎回Access/D1",
  "Worker proxyに限定",
  "ブラウザへR2の短期署名read URLを配らず",
  "失効後の新しいrequestを拒否",
  "共有cacheへ流さずcache reuse",
  "{workspace_id}/{resource_type}/{resource_id}/{asset_id}.{ext}"
];

const errors = [];
const contents = {};

for (const path of docs) {
  try {
    contents[path] = await readFile(path, "utf8");
  } catch {
    errors.push(`Missing R2 storage policy doc: ${path}`);
  }
}

for (const path of implementationFiles) {
  try {
    contents[path] = await readFile(path, "utf8");
  } catch {
    errors.push(`Missing R2 storage implementation file: ${path}`);
  }
}

try {
  contents[tableDefinitionsPath] = await readFile(tableDefinitionsPath, "utf8");
} catch {
  errors.push(`Missing table definitions: ${tableDefinitionsPath}`);
}

const combined = Object.values(contents).join("\n");

for (const binding of requiredBindings) {
  if (!combined.includes(binding)) {
    errors.push(`Missing R2 binding name in docs: ${binding}`);
  }
}

for (const bucketName of requiredBucketNames) {
  if (!combined.includes(bucketName)) {
    errors.push(`Missing R2 bucket name in docs: ${bucketName}`);
  }
}

for (const term of requiredTerms) {
  if (!combined.includes(term)) {
    errors.push(`Missing R2 policy term: ${term}`);
  }
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function domainKinds(content) {
  const block = content.match(/export const STORAGE_KINDS = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] ?? "";
  return sortedUnique([...block.matchAll(/:\s*"([a-z][a-z0-9_]*)"/g)].map((match) => match[1]));
}

function contractKinds(content) {
  const rows = [...content.matchAll(/^\| `(?:CAPTURE_ASSETS|MANUAL_ASSETS|EXPORTS|AVATARS)` \|[^\n]*\| ([^|]+) \|$/gm)];
  return sortedUnique(rows.flatMap((row) => [...row[1].matchAll(/`([a-z][a-z0-9_]*)`/g)].map((match) => match[1])));
}

function tableKinds(content) {
  const line = content.match(/^- `asset_kind`: ([^\n]+)$/m)?.[1] ?? "";
  return sortedUnique([...line.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((match) => match[1]));
}

const vocabularies = {
  domain: domainKinds(contents[implementationFiles[0]] || ""),
  contract: contractKinds(contents[docs[1]] || ""),
  table: tableKinds(contents[tableDefinitionsPath] || "")
};
if (vocabularies.domain.length === 0 || vocabularies.contract.length === 0 || vocabularies.table.length === 0) {
  errors.push("Asset kind vocabulary could not be parsed from domain, storage contract, or table definitions.");
} else {
  const canonical = JSON.stringify(vocabularies.domain);
  for (const [source, values] of Object.entries(vocabularies)) {
    if (JSON.stringify(values) !== canonical) {
      errors.push(`Asset kind vocabulary differs between domain and ${source}.`);
    }
  }
}

const wrangler = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const r2Buckets = [
  ...(wrangler.r2_buckets || []),
  ...Object.values(wrangler.env || {}).flatMap((environment) => environment.r2_buckets || [])
];

if (!Array.isArray(r2Buckets)) {
  errors.push("wrangler.jsonc r2_buckets must be an array when present.");
}

for (const bucket of r2Buckets) {
  if (!requiredBindings.includes(bucket.binding)) {
    errors.push(`Unexpected R2 binding in wrangler.jsonc: ${bucket.binding}`);
  }

  if (!requiredBucketNames.includes(bucket.bucket_name)) {
    errors.push(`Unexpected R2 bucket_name in wrangler.jsonc: ${bucket.bucket_name}`);
  }
}

if (r2Buckets.length > 0 && wrangler.keep_vars !== true) {
  errors.push("wrangler.jsonc must keep keep_vars=true when R2 bindings are added.");
}

const domainStorage = contents[implementationFiles[0]] || "";
if (/cloudflare|R2Bucket|R2Object/i.test(domainStorage)) {
  errors.push("Domain storage port must not reference Cloudflare or R2 SDK types.");
}
for (const snippet of ["createObjectKey", "createStorageReadResult", "contentType", "sizeBytes", "checksumSha256", "resourceId", "manualId", "stepId", "put", "get", "delete"]) {
  if (!domainStorage.includes(snippet)) errors.push(`Missing storage port contract: ${snippet}`);
}
const storageImplementation = implementationFiles.slice(0, 3).map((path) => contents[path] || "").join("\n");
if (/console\.|logger\.|\.log\(/.test(storageImplementation)) {
  errors.push("Storage implementations must not log object data, identifiers, URLs, or secrets.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("R2 storage policy OK.");
