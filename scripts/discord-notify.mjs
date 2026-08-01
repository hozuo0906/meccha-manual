const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 2;

const notifyEnv = process.env.DISCORD_NOTIFY_ENV || "development";
const required = process.env.DISCORD_NOTIFY_REQUIRED === "true";
const dryRun = process.env.DISCORD_NOTIFY_DRY_RUN === "true" || process.argv.includes("--dry-run");

const webhookCandidatesByEnv = {
  development: [
    "DISCORD_WEBHOOK_URL",
    "MECCHA_DISCORD_WEBHOOK_URL",
    "DISCORD_DEVELOPMENT_WEBHOOK_URL"
  ],
  staging: [
    "DISCORD_STAGING_WEBHOOK_URL"
  ],
  production: [
    "DISCORD_PRODUCTION_WEBHOOK_URL"
  ]
};

function selectWebhook() {
  const candidateNames = webhookCandidatesByEnv[notifyEnv] || webhookCandidatesByEnv.development;

  for (const name of candidateNames) {
    const value = process.env[name];
    if (value) {
      return { name, value };
    }
  }

  return { name: null, value: null };
}

function statusLabel(status) {
  if (status === "success") return "success";
  if (status === "failure") return "failure";
  if (status === "cancelled") return "cancelled";
  return status || "unknown";
}

function statusColor(status) {
  if (status === "success") return 0x2da44e;
  if (status === "failure") return 0xcf222e;
  return 0x9a6700;
}

function buildPayload() {
  const status = process.env.DISCORD_NOTIFY_STATUS || "unknown";
  const title = process.env.DISCORD_NOTIFY_TITLE || process.env.GITHUB_WORKFLOW || "meccha-manual CI";
  const repository = process.env.GITHUB_REPOSITORY || "unknown repository";
  const refName = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || "unknown ref";
  const sha = process.env.GITHUB_SHA || "";
  const actor = process.env.GITHUB_ACTOR || "unknown";
  const eventName = process.env.GITHUB_EVENT_NAME || "unknown";
  const runId = process.env.GITHUB_RUN_ID || "";
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const runUrl = runId && process.env.GITHUB_REPOSITORY
    ? `${serverUrl}/${repository}/actions/runs/${runId}`
    : undefined;

  return {
    username: "meccha-manual Dev Bot",
    allowed_mentions: {
      parse: []
    },
    embeds: [
      {
        title: `${title}: ${statusLabel(status)}`,
        url: runUrl,
        color: statusColor(status),
        fields: [
          { name: "Environment", value: notifyEnv, inline: true },
          { name: "Repository", value: repository, inline: true },
          { name: "Ref", value: refName, inline: true },
          { name: "Actor", value: actor, inline: true },
          { name: "Event", value: eventName, inline: true },
          { name: "Commit", value: sha ? sha.slice(0, 7) : "unknown", inline: true }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  };
}

async function postWithTimeout(webhookUrl, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    return await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function sendDiscordNotification(webhookUrl, payload) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await postWithTimeout(webhookUrl, payload);
      if (response.ok) return;

      lastError = new Error(`Discord notification failed: HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Discord notification failed.");
}

const selectedWebhook = selectWebhook();
const payload = buildPayload();

if (dryRun) {
  console.log(JSON.stringify({
    status: "dry-run",
    notifyEnv,
    required,
    webhookSecretName: selectedWebhook.name,
    payload
  }, null, 2));
  process.exit(0);
}

if (!selectedWebhook.value) {
  const message = `Discord webhook secret is not configured for ${notifyEnv}.`;
  if (required) {
    throw new Error(message);
  }

  console.log(`${message} Skipping notification.`);
  process.exit(0);
}

await sendDiscordNotification(selectedWebhook.value, payload);
console.log(`Discord notification sent for ${notifyEnv}.`);
