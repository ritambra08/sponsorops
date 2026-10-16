import cron from "node-cron";
import type { App } from "@slack/bolt";
import { cfg } from "./config";
import type { Store } from "./store/store";
import { digestBlocks, followUpBlocks } from "./slack/blocks";

/** Starts the recurring jobs: daily digest, follow-up reminders, stale-approval nudges. */
export function startScheduler(app: App, store: Store) {
  const opts = { timezone: cfg.timezone };

  // 1) Daily pipeline digest
  if (cfg.digestChannel) {
    cron.schedule(cfg.digestCron, () => void safe("digest", () => postDigest(app, store)), opts);
    console.log(`[scheduler] Digest scheduled "${cfg.digestCron}" (${cfg.timezone}) -> ${cfg.digestChannel}`);
  } else {
    console.log("[scheduler] DIGEST_CHANNEL not set, daily digest disabled");
  }

  // 2) Follow-up reminders + stale approval nudges, every 30 minutes
  cron.schedule("*/30 * * * *", () => void safe("reminders", () => runReminders(app, store)), opts);
  console.log("[scheduler] Reminder sweep every 30 min");
}

export async function postDigest(app: App, store: Store) {
  const leads = await store.list();
  await app.client.chat.postMessage({
    channel: cfg.digestChannel,
    text: "Daily outreach digest",
    blocks: digestBlocks(leads),
  });
}

export async function runReminders(app: App, store: Store) {
  const now = Date.now();
  const leads = await store.list();

  for (const lead of leads) {
    // Follow-up due: DM the owner once (snooze resets the flag).
    if (lead.status === "approved" && lead.followUpAt && !lead.followUpNotified && new Date(lead.followUpAt).getTime() <= now) {
      await app.client.chat.postMessage({
        channel: lead.owner, // posting to a user id opens a DM with the bot
        text: `Follow up with ${lead.company}`,
        blocks: followUpBlocks(lead),
      });
      await store.update(lead.id, { followUpNotified: true });
    }

    // Approval timeout: nudge once in the original thread.
    const ageHours = (now - new Date(lead.createdAt).getTime()) / 3_600_000;
    if (lead.status === "pending_approval" && !lead.nudgedAt && ageHours >= cfg.approvalTimeoutHours) {
      await app.client.chat.postMessage({
        channel: lead.channel,
        thread_ts: lead.messageTs,
        text: `⏳ <@${lead.owner}> this draft for *${lead.company}* has been waiting ${Math.floor(ageHours)}h for approval.`,
      });
      await store.update(lead.id, { nudgedAt: new Date().toISOString() });
    }
  }
}

async function safe(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(`[scheduler] ${name} failed`, e);
  }
}
