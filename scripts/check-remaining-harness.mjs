import { readFile } from "node:fs/promises";

const requiredDocs = {
  "docs/08-operations/remaining-harness-plan.md": [
    "R2 Storage",
    "Staging/Production分離",
    "Stripe課金",
    "DB migration安全",
    "Browser Run / Session"
  ],
  "docs/08-operations/environments-and-delivery.md": [
    "GitHub Environment",
    "Cloudflare Worker環境",
    "Supabase project",
    "Stripe",
    "main` mergeはリリース候補",
    "required reviewer"
  ],
  "docs/08-operations/stripe-billing-harness.md": [
    "BILLING_FEATURE_ENABLED=false",
    "署名",
    "重複",
    "順不同",
    "entitlement",
    "席数",
    "返金"
  ],
  "docs/08-operations/db-migration-safety-harness.md": [
    "npm run migrations:check",
    "RLS negative test",
    "production",
    "実DB migration"
  ],
  "docs/08-operations/browser-session-harness.md": [
    "Durable Object",
    "Live View",
    "SSRF",
    "入力値は保存しない",
    "スクリーンショット",
    "監査ログ"
  ],
  "docs/08-operations/environment-variables.md": [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_PRO_MONTHLY",
    "STRIPE_PAYMENT_LINK_PRO_MONTHLY",
    "BILLING_FEATURE_ENABLED"
  ]
};

const forbiddenConfiguredResources = [
  '"r2_buckets"',
  '"browser"',
  '"durable_objects"'
];

const errors = [];

for (const [path, terms] of Object.entries(requiredDocs)) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    errors.push(`Missing remaining harness doc: ${path}`);
    continue;
  }

  for (const term of terms) {
    if (!content.includes(term)) {
      errors.push(`Missing harness policy term in ${path}: ${term}`);
    }
  }
}

const wrangler = await readFile("wrangler.jsonc", "utf8");
for (const key of forbiddenConfiguredResources) {
  if (wrangler.includes(key)) {
    errors.push(`External harness resource must not be configured yet in wrangler.jsonc: ${key}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Remaining harness policy OK; no external resources or secrets were accessed.");
