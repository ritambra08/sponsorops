import type { KnownBlock } from "@slack/types";
import { Lead } from "../types";
import { slackDate, truncate } from "../util";

const CONF_EMOJI = { high: "🟢", medium: "🟡", low: "🔴" } as const;

function draftSection(lead: Lead): KnownBlock[] {
  const d = lead.draft;
  const sources = d.sources.length ? d.sources.map((s) => `<${s}>`).join("\n") : "_No sources found_";
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${truncate(d.company, 100)}*  ${CONF_EMOJI[d.confidence]} confidence: ${d.confidence}\n` +
          `${truncate(d.summary, 600)}\n\n*Angle:* ${truncate(d.angle, 400)}\n*Address to:* ${truncate(d.contactHint, 100)}`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Subject:* ${truncate(d.subject, 120)}\n\`\`\`${truncate(d.body, 1800)}\`\`\`` },
    },
    { type: "context", elements: [{ type: "mrkdwn", text: `*Sources:*\n${truncate(sources, 600)}` }] },
  ];
}

export function pendingBlocks(lead: Lead): KnownBlock[] {
  const lowWarning: KnownBlock[] =
    lead.draft.confidence === "low"
      ? [{ type: "context", elements: [{ type: "mrkdwn", text: "⚠️ Low confidence: little verified info was found. Check the facts before approving." }] }]
      : [];
  return [
    { type: "header", text: { type: "plain_text", text: "📝 Draft awaiting approval" } },
    ...draftSection(lead),
    ...lowWarning,
    {
      type: "actions",
      elements: [
        { type: "button", style: "primary", text: { type: "plain_text", text: "Approve" }, action_id: "approve_draft", value: lead.id },
        { type: "button", text: { type: "plain_text", text: "Edit" }, action_id: "edit_draft", value: lead.id },
        { type: "button", style: "danger", text: { type: "plain_text", text: "Reject" }, action_id: "reject_draft", value: lead.id },
      ],
    },
    { type: "context", elements: [{ type: "mrkdwn", text: `Requested by <@${lead.owner}> • drafted in ${lead.draftSeconds}s • id \`${lead.id}\`` }] },
  ];
}

export function approvedBlocks(lead: Lead): KnownBlock[] {
  return [
    { type: "header", text: { type: "plain_text", text: "✅ Approved" } },
    ...draftSection(lead),
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text:
            `Approved by <@${lead.approvedBy}>${lead.edited ? " (edited)" : ""}. Copy the email above and send it from your own inbox.\n` +
            `⏰ Follow-up reminder: ${slackDate(lead.followUpAt)} • id \`${lead.id}\``,
        },
      ],
    },
  ];
}

export function rejectedBlocks(lead: Lead): KnownBlock[] {
  return [
    { type: "section", text: { type: "mrkdwn", text: `❌ *${truncate(lead.company, 100)}* draft rejected by <@${lead.rejectedBy}>. Run \`/lead add ${lead.company}\` to try again.` } },
  ];
}

export function followUpBlocks(lead: Lead): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⏰ *Follow up with ${truncate(lead.company, 100)}*\nApproved ${slackDate(lead.approvedAt)}. Any reply yet?`,
      },
    },
    {
      type: "actions",
      elements: [
        { type: "button", style: "primary", text: { type: "plain_text", text: "They replied" }, action_id: "followup_replied", value: lead.id },
        { type: "button", text: { type: "plain_text", text: "Snooze 3 days" }, action_id: "followup_snooze", value: lead.id },
        { type: "button", style: "danger", text: { type: "plain_text", text: "Close: no response" }, action_id: "followup_noreply", value: lead.id },
      ],
    },
  ];
}

export function digestBlocks(leads: Lead[], now = new Date()): KnownBlock[] {
  const dayAgo = now.getTime() - 86_400_000;
  const fresh = leads.filter((l) => new Date(l.createdAt).getTime() > dayAgo);
  const pending = leads.filter((l) => l.status === "pending_approval");
  const overdue = leads.filter((l) => l.status === "approved" && l.followUpAt && new Date(l.followUpAt) <= now);

  const list = (ls: Lead[]) => (ls.length ? ls.map((l) => `• ${truncate(l.company, 60)} (<@${l.owner}>)`).join("\n") : "_none_");
  return [
    { type: "header", text: { type: "plain_text", text: "📊 Daily outreach digest" } },
    { type: "section", text: { type: "mrkdwn", text: `*New in last 24h (${fresh.length})*\n${list(fresh)}` } },
    { type: "section", text: { type: "mrkdwn", text: `*Awaiting approval (${pending.length})*\n${list(pending)}` } },
    { type: "section", text: { type: "mrkdwn", text: `*Follow-ups due (${overdue.length})*\n${list(overdue)}` } },
  ];
}

export function listBlocks(leads: Lead[]): KnownBlock[] {
  if (!leads.length) return [{ type: "section", text: { type: "mrkdwn", text: "No leads yet. Try `/lead add <company>`." } }];
  const icon: Record<string, string> = { pending_approval: "📝", approved: "✅", rejected: "❌", replied: "💬", no_response: "🔕" };
  const lines = leads
    .slice(-15)
    .reverse()
    .map((l) => `${icon[l.status] ?? "•"} *${truncate(l.company, 50)}*: ${l.status.replace("_", " ")} (<@${l.owner}>)`);
  return [{ type: "section", text: { type: "mrkdwn", text: `*Last ${lines.length} leads*\n${lines.join("\n")}` } }];
}
