import type { App, BlockAction, ButtonAction, ViewSubmitAction } from "@slack/bolt";
import { runLeadAgent } from "../agent/agent";
import { cfg } from "../config";
import { computeStats, formatStats } from "../stats";
import type { Store } from "../store/store";
import { Lead } from "../types";
import { addDays, newId } from "../util";
import { approvedBlocks, followUpBlocks, listBlocks, pendingBlocks, rejectedBlocks } from "./blocks";

const HELP =
  "*SponsorOps commands*\n" +
  "• `/lead add <company>` or `/lead add <company> | extra context`: research and draft outreach\n" +
  "• `/lead list`: latest leads\n" +
  "• `/lead stats`: pipeline metrics\n" +
  "_The bot must be invited to the channel first: `/invite @SponsorOps`._";

export function registerHandlers(app: App, store: Store) {
  /* ---------------------------- /lead command ---------------------------- */
  app.command("/lead", async ({ command, ack, respond, client }) => {
    await ack(); // Slack requires an ack within 3s; the agent runs after this.

    const text = command.text.trim();
    const sub = text.split(/\s+/)[0]?.toLowerCase() ?? "";
    const arg = text.slice(sub.length).trim();

    if (sub === "list") {
      await respond({ response_type: "ephemeral", blocks: listBlocks(await store.list()), text: "Leads" });
      return;
    }

    if (sub === "stats") {
      const s = computeStats(await store.list(), cfg.baselineManualMinutes, cfg.reviewMinutes);
      await respond({ response_type: "ephemeral", text: formatStats(s, cfg.baselineManualMinutes, cfg.reviewMinutes) });
      return;
    }

    if (sub !== "add") {
      await respond({ response_type: "ephemeral", text: HELP });
      return;
    }

    const [company, ...ctx] = arg.split("|").map((s) => s.trim());
    const context = ctx.join(" | ") || undefined;
    if (!company) {
      await respond({ response_type: "ephemeral", text: "Usage: `/lead add <company> | optional context`" });
      return;
    }
    if (company.length > 100) {
      await respond({ response_type: "ephemeral", text: "Company name is too long." });
      return;
    }

    // Guardrail 1: duplicate detection before spending any tokens.
    const dup = await store.findByCompany(company);
    if (dup) {
      await respond({
        response_type: "ephemeral",
        text: `⚠️ *${dup.company}* is already in the pipeline (status: ${dup.status.replace("_", " ")}, owner <@${dup.owner}>). Not creating a duplicate.`,
      });
      return;
    }

    // Post a placeholder we can update with live progress, then the final draft.
    let channel = command.channel_id;
    let ts: string;
    try {
      const posted = await client.chat.postMessage({ channel, text: `🔎 <@${command.user_id}> asked me to research *${company}*…` });
      ts = posted.ts as string;
    } catch (e: any) {
      const msg = String(e?.data?.error ?? e?.message);
      await respond({
        response_type: "ephemeral",
        text: msg.includes("not_in_channel") || msg.includes("channel_not_found")
          ? "I'm not in this channel yet. Run `/invite @SponsorOps` and try again."
          : `Could not post: ${msg}`,
      });
      return;
    }

    const progress = (line: string) =>
      void client.chat.update({ channel, ts, text: `🔎 Researching *${company}*…\n${line}` }).catch(() => undefined);

    try {
      const { draft, steps, seconds } = await runLeadAgent({ company, context }, store, progress);

      const lead: Lead = {
        id: newId(),
        company: draft.company || company,
        context,
        status: "pending_approval",
        owner: command.user_id,
        channel,
        messageTs: ts,
        draft,
        draftSeconds: seconds,
        agentSteps: steps,
        edited: false,
        createdAt: new Date().toISOString(),
      };
      await store.create(lead);
      await client.chat.update({ channel, ts, text: `Draft ready for ${lead.company}`, blocks: pendingBlocks(lead) });
    } catch (e: any) {
      console.error("[agent] failed", e);
      await client.chat.update({
        channel,
        ts,
        text: `❌ Could not draft outreach for *${company}*: ${String(e?.message ?? e).slice(0, 300)}\nTry again, or add some context: \`/lead add ${company} | what they do\``,
      });
    }
  });

  /* ------------------------------ Approve ------------------------------ */
  app.action("approve_draft", async ({ ack, body, action, client }) => {
    await ack();
    const b = body as BlockAction;
    const id = (action as ButtonAction).value as string;
    const lead = await store.get(id);
    if (!lead || lead.status !== "pending_approval") {
      await notify(client, b, "This draft was already handled.");
      return;
    }
    const now = new Date();
    const updated = await store.update(id, {
      status: "approved",
      approvedAt: now.toISOString(),
      approvedBy: b.user.id,
      followUpAt: addDays(now, cfg.followUpDays).toISOString(),
      followUpNotified: false,
    });
    await client.chat.update({ channel: lead.channel, ts: lead.messageTs, text: `Approved: ${lead.company}`, blocks: approvedBlocks(updated) });
  });

  /* ------------------------------- Reject ------------------------------ */
  app.action("reject_draft", async ({ ack, body, action, client }) => {
    await ack();
    const b = body as BlockAction;
    const id = (action as ButtonAction).value as string;
    const lead = await store.get(id);
    if (!lead || lead.status !== "pending_approval") {
      await notify(client, b, "This draft was already handled.");
      return;
    }
    const updated = await store.update(id, { status: "rejected", rejectedBy: b.user.id });
    await client.chat.update({ channel: lead.channel, ts: lead.messageTs, text: `Rejected: ${lead.company}`, blocks: rejectedBlocks(updated) });
  });

  /* -------------------------------- Edit ------------------------------- */
  app.action("edit_draft", async ({ ack, body, action, client }) => {
    await ack();
    const b = body as BlockAction;
    const id = (action as ButtonAction).value as string;
    const lead = await store.get(id);
    if (!lead || lead.status !== "pending_approval") {
      await notify(client, b, "This draft was already handled.");
      return;
    }
    await client.views.open({
      trigger_id: b.trigger_id,
      view: {
        type: "modal",
        callback_id: "edit_submit",
        private_metadata: id,
        title: { type: "plain_text", text: "Edit draft" },
        submit: { type: "plain_text", text: "Save" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "subject_b",
            label: { type: "plain_text", text: "Subject" },
            element: { type: "plain_text_input", action_id: "subject_a", initial_value: lead.draft.subject, max_length: 120 },
          },
          {
            type: "input",
            block_id: "body_b",
            label: { type: "plain_text", text: "Body" },
            element: { type: "plain_text_input", action_id: "body_a", multiline: true, initial_value: lead.draft.body, max_length: 2500 },
          },
        ],
      },
    });
  });

  app.view("edit_submit", async ({ ack, view, client }) => {
    await ack();
    const id = view.private_metadata;
    const v = (view as ViewSubmitAction["view"]).state.values;
    const subject = v.subject_b.subject_a.value ?? "";
    const bodyText = v.body_b.body_a.value ?? "";
    const lead = await store.get(id);
    if (!lead || lead.status !== "pending_approval") return;
    const updated = await store.update(id, { draft: { ...lead.draft, subject, body: bodyText }, edited: true });
    await client.chat.update({ channel: lead.channel, ts: lead.messageTs, text: `Draft edited: ${lead.company}`, blocks: pendingBlocks(updated) });
  });

  /* ---------------------------- Follow-up buttons ---------------------------- */
  const followUpResult = async (
    id: string,
    patch: Partial<Lead>,
    label: string,
    b: BlockAction,
    client: App["client"]
  ) => {
    const lead = await store.get(id);
    if (!lead) return;
    await store.update(id, patch);
    if (b.channel?.id && b.message?.ts) {
      await client.chat.update({ channel: b.channel.id, ts: b.message.ts, text: label, blocks: [{ type: "section", text: { type: "mrkdwn", text: `${label} *${lead.company}*` } }] });
    }
  };

  app.action("followup_replied", async ({ ack, body, action, client }) => {
    await ack();
    await followUpResult((action as ButtonAction).value as string, { status: "replied" }, "💬 Marked as replied:", body as BlockAction, client);
  });

  app.action("followup_noreply", async ({ ack, body, action, client }) => {
    await ack();
    await followUpResult((action as ButtonAction).value as string, { status: "no_response" }, "🔕 Closed, no response:", body as BlockAction, client);
  });

  app.action("followup_snooze", async ({ ack, body, action, client }) => {
    await ack();
    await followUpResult(
      (action as ButtonAction).value as string,
      { followUpAt: addDays(new Date(), 3).toISOString(), followUpNotified: false },
      "😴 Snoozed 3 days:",
      body as BlockAction,
      client
    );
  });
}

async function notify(client: App["client"], b: BlockAction, text: string) {
  if (!b.channel?.id) return;
  await client.chat.postEphemeral({ channel: b.channel.id, user: b.user.id, text }).catch(() => undefined);
}

export { followUpBlocks };
