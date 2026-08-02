const DEFAULT_TIMEOUT_MS = 10000;
const MAX_ATTEMPTS = 2;

const notifyEnv = process.env.DISCORD_NOTIFY_ENV || "development";
const required = process.env.DISCORD_NOTIFY_REQUIRED === "true";
const dryRun = process.env.DISCORD_NOTIFY_DRY_RUN === "true" || process.argv.includes("--dry-run");
const componentMode = process.env.DISCORD_NOTIFY_COMPONENTS || "";

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

const channelCandidatesByEnv = {
  development: [
    "DISCORD_NOTIFY_CHANNEL_ID",
    "DISCORD_DEVELOPMENT_CHANNEL_ID"
  ],
  staging: [
    "DISCORD_STAGING_CHANNEL_ID"
  ],
  production: [
    "DISCORD_PRODUCTION_CHANNEL_ID"
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

function selectBotChannel() {
  const candidateNames = channelCandidatesByEnv[notifyEnv] || channelCandidatesByEnv.development;

  for (const name of candidateNames) {
    const value = process.env[name];
    if (value) {
      return { name, value };
    }
  }

  return { name: null, value: null };
}

function statusLabel(status) {
  if (status === "success") return "成功";
  if (status === "failure") return "失敗";
  if (status === "cancelled") return "キャンセル";
  return status || "不明";
}

function statusColor(status) {
  if (status === "success") return 0x2da44e;
  if (status === "failure") return 0xcf222e;
  return 0x9a6700;
}

function environmentLabel(environment) {
  if (environment === "development") return "開発";
  if (environment === "staging") return "ステージング";
  if (environment === "production") return "本番";
  return environment || "不明";
}

function defaultImpression(status, title) {
  if (process.env.DISCORD_NOTIFY_IMPRESSION) {
    return process.env.DISCORD_NOTIFY_IMPRESSION;
  }

  if (status === "success" && title.includes("Auto PR")) {
    return "PRの準備はできています。リンク先で差分とチェック結果を見て、問題なければmerge判断に進めます。";
  }

  if (status === "success") {
    return "自動チェックは通っています。次はPR差分、権限、秘密情報混入がないかを確認します。";
  }

  if (status === "failure") {
    return "対応が必要です。まずActionsログで失敗箇所を確認し、P0/P1ならmerge前に修正します。";
  }

  if (status === "cancelled") {
    return "実行がキャンセルされました。新しいpushや手動再実行があれば、そちらを優先して確認します。";
  }

  return "状態が不明です。GitHub Actionsの実行詳細を確認します。";
}

function parseGitHubPullRequestUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/);
    if (url.hostname !== "github.com" || !match) return null;

    return {
      owner: match[1],
      repo: match[2],
      number: Number(match[3]),
      url: `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`
    };
  } catch {
    return null;
  }
}

function buildPrComponents(pr, interactive) {
  if (!pr) return undefined;

  const buttons = [
    {
      type: 2,
      style: 5,
      label: "PRを開く",
      url: pr.url
    }
  ];

  if (interactive) {
    const ref = `${pr.owner}/${pr.repo}:${pr.number}`;
    buttons.push(
      {
        type: 2,
        style: 2,
        label: "状態確認",
        custom_id: `meccha:pr:status:${ref}`
      },
      {
        type: 2,
        style: 1,
        label: "マージ依頼",
        custom_id: `meccha:pr:merge_request:${ref}`
      }
    );
  }

  return [
    {
      type: 1,
      components: buttons
    }
  ];
}

function buildPayload({ interactivePrButtons = false } = {}) {
  const status = process.env.DISCORD_NOTIFY_STATUS || "unknown";
  const title = process.env.DISCORD_NOTIFY_TITLE || process.env.GITHUB_WORKFLOW || "meccha-manual CI";
  const repository = process.env.GITHUB_REPOSITORY || "unknown repository";
  const refName = process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || "unknown ref";
  const sha = process.env.GITHUB_SHA || "";
  const actor = process.env.GITHUB_ACTOR || "unknown";
  const eventName = process.env.GITHUB_EVENT_NAME || "unknown";
  const runId = process.env.GITHUB_RUN_ID || "";
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const explicitUrl = process.env.DISCORD_NOTIFY_URL || "";
  const description = process.env.DISCORD_NOTIFY_DESCRIPTION || "";
  const impression = defaultImpression(status, title);
  const runUrl = runId && process.env.GITHUB_REPOSITORY
    ? `${serverUrl}/${repository}/actions/runs/${runId}`
    : undefined;
  const targetUrl = explicitUrl || runUrl;
  const pr = parseGitHubPullRequestUrl(process.env.DISCORD_NOTIFY_PR_URL || explicitUrl || description);
  const components = componentMode === "pr"
    ? buildPrComponents(pr, interactivePrButtons)
    : undefined;

  const payload = {
    username: "めっちゃマニュアル 開発Bot",
    allowed_mentions: {
      parse: []
    },
    embeds: [
      {
        title: `${title}: ${statusLabel(status)}`,
        url: targetUrl,
        ...(description ? { description } : {}),
        color: statusColor(status),
        fields: [
          { name: "Codex所感", value: impression, inline: false },
          { name: "環境", value: environmentLabel(notifyEnv), inline: true },
          { name: "リポジトリ", value: repository, inline: true },
          { name: "ブランチ", value: refName, inline: true },
          { name: "実行者", value: actor, inline: true },
          { name: "イベント", value: eventName, inline: true },
          { name: "コミット", value: sha ? sha.slice(0, 7) : "不明", inline: true }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  };

  if (components) {
    payload.components = components;
  }

  return payload;
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

async function sendDiscordBotMessage(botToken, channelId, payload) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          "authorization": `Bot ${botToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (response.ok) return;
      lastError = new Error(`Discord bot notification failed: HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Discord bot notification failed.");
}

const selectedWebhook = selectWebhook();
const selectedBotChannel = selectBotChannel();
const botToken = process.env.DISCORD_BOT_TOKEN || "";
const useBotDelivery = Boolean(botToken && selectedBotChannel.value);
const payload = buildPayload({ interactivePrButtons: useBotDelivery });

if (dryRun) {
  console.log(JSON.stringify({
    status: "dry-run",
    notifyEnv,
    required,
    componentMode,
    delivery: useBotDelivery ? "bot" : "webhook",
    webhookSecretName: selectedWebhook.name,
    botChannelName: selectedBotChannel.name,
    botTokenPresent: Boolean(botToken),
    payload
  }, null, 2));
  process.exit(0);
}

if (useBotDelivery) {
  try {
    await sendDiscordBotMessage(botToken, selectedBotChannel.value, payload);
    console.log(`Discord bot notification sent for ${notifyEnv}.`);
    process.exit(0);
  } catch (error) {
    if (!selectedWebhook.value) {
      throw error;
    }

    await sendDiscordNotification(selectedWebhook.value, buildPayload({ interactivePrButtons: false }));
    console.log(`Discord bot notification failed; webhook fallback sent for ${notifyEnv}.`);
    process.exit(0);
  }
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
