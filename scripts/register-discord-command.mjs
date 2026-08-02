const dryRun = process.argv.includes("--dry-run") || process.env.DISCORD_REGISTER_DRY_RUN === "true";
const applicationId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
const allowGlobal = process.env.DISCORD_REGISTER_GLOBAL === "true";

const command = {
  name: "meccha",
  description: "Send a Meccha Manual development request to GitHub Issues",
  type: 1,
  options: [
    {
      name: "task",
      description: "Create a GitHub Issue for a development request",
      type: 1,
      options: [
        {
          name: "title",
          description: "Issue title",
          type: 3,
          required: true,
          max_length: 120
        },
        {
          name: "body",
          description: "Request body",
          type: 3,
          required: false,
          max_length: 4000
        },
        {
          name: "priority",
          description: "Priority",
          type: 3,
          required: false,
          choices: [
            { name: "P0", value: "P0" },
            { name: "P1", value: "P1" },
            { name: "P2", value: "P2" },
            { name: "P3", value: "P3" }
          ]
        }
      ]
    }
  ]
};

function requireValue(value, name) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function registrationUrl() {
  const appId = requireValue(applicationId, "DISCORD_APPLICATION_ID");
  if (guildId) {
    return `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`;
  }

  if (!allowGlobal) {
    throw new Error("DISCORD_GUILD_ID is required unless DISCORD_REGISTER_GLOBAL=true.");
  }

  return `https://discord.com/api/v10/applications/${appId}/commands`;
}

if (dryRun) {
  console.log(JSON.stringify({
    status: "dry-run",
    scope: guildId ? "guild" : allowGlobal ? "global" : "blocked",
    guildIdPresent: Boolean(guildId),
    globalRegistrationAllowed: allowGlobal,
    registrationWouldFail: !guildId && !allowGlobal,
    command
  }, null, 2));
  process.exit(0);
}

requireValue(botToken, "DISCORD_BOT_TOKEN");

const response = await fetch(registrationUrl(), {
  method: "POST",
  headers: {
    "authorization": `Bot ${botToken}`,
    "content-type": "application/json"
  },
  body: JSON.stringify(command)
});

if (!response.ok) {
  throw new Error(`Discord command registration failed: HTTP ${response.status}`);
}

const payload = await response.json();
console.log(JSON.stringify({
  status: "ok",
  commandId: payload.id,
  name: payload.name,
  scope: guildId ? "guild" : "global"
}, null, 2));
