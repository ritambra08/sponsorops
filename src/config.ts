import "dotenv/config";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : d;
};

export const cfg = {
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
  enableWebSearch: (process.env.ENABLE_WEB_SEARCH ?? "true") !== "false",

  slackBotToken: process.env.SLACK_BOT_TOKEN ?? "",
  slackAppToken: process.env.SLACK_APP_TOKEN ?? "",
  digestChannel: process.env.DIGEST_CHANNEL ?? "",
  digestCron: process.env.DIGEST_CRON || "0 9 * * *",
  timezone: process.env.TIMEZONE || "Asia/Kolkata",

  followUpDays: num(process.env.FOLLOWUP_DAYS, 5),
  approvalTimeoutHours: num(process.env.APPROVAL_TIMEOUT_HOURS, 24),

  agentMaxTurns: num(process.env.AGENT_MAX_TURNS, 10),
  agentTimeoutMs: num(process.env.AGENT_TIMEOUT_MS, 120_000),

  baselineManualMinutes: num(process.env.BASELINE_MANUAL_MINUTES, 25),
  reviewMinutes: num(process.env.REVIEW_MINUTES, 3),

  airtable: {
    token: process.env.AIRTABLE_TOKEN ?? "",
    baseId: process.env.AIRTABLE_BASE_ID ?? "",
    table: process.env.AIRTABLE_TABLE || "Leads",
  },
};

export function assertAnthropic() {
  if (!cfg.anthropicKey) throw new Error("ANTHROPIC_API_KEY is missing. Copy .env.example to .env and fill it in.");
}

export function assertSlack() {
  assertAnthropic();
  const missing = [
    !cfg.slackBotToken && "SLACK_BOT_TOKEN",
    !cfg.slackAppToken && "SLACK_APP_TOKEN",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}. See README step 4.`);
}
