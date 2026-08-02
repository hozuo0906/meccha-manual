import { readFile } from "node:fs/promises";

const docs = [
  "docs/03-architecture/adrs/ADR-0018-r2-bucket-binding-contract.md",
  "docs/04-data/storage-object-contract.md",
  "docs/08-operations/r2-storage-harness.md"
];

const requiredBindings = [
  "CAPTURE_ASSETS",
  "MANUAL_ASSETS",
  "EXPORTS",
  "AVATARS"
];

const requiredBucketNames = [
  "meccha-manual-staging-capture-assets",
  "meccha-manual-staging-manual-assets",
  "meccha-manual-staging-exports",
  "meccha-manual-staging-avatars",
  "meccha-manual-production-capture-assets",
  "meccha-manual-production-manual-assets",
  "meccha-manual-production-exports",
  "meccha-manual-production-avatars"
];

const requiredTerms = [
  "R2 bucketはまだ作成しない",
  "bucket自体はpublicにしない",
  "Worker経由",
  "Postgresメタデータ",
  "短期署名URL",
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

const wrangler = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const r2Buckets = wrangler.r2_buckets || [];

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

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("R2 storage policy OK.");
