# SponsorOps: agentic Slack assistant for outreach pipelines

Type `/lead add Tata Steel` in Slack. An AI agent researches the company on the web, finds a verifiable angle, and drafts a personalised sponsorship email. The draft appears in the channel with **Approve / Edit / Reject** buttons. Nothing is ever sent without a human. Approved leads get a follow-up reminder, and a daily digest summarises the pipeline.

```
/lead add <company>
        |
        v
  Slack Bolt (Socket Mode) --ack in <3s--> placeholder message with live progress
        |
        v
  Claude agent loop (tool use)
     get_org_context  ->  check_duplicate  ->  web_search x2-4  ->  submit_draft
                                                                      |
                                           guardrail validation <-----+ (retry if invalid)
        |
        v
  Store (JSON file or Airtable)  ->  Approval message (Approve / Edit / Reject)
        |
        v
  Scheduler: follow-up DMs, stale-approval nudges, daily digest
```

## Step 1: Prerequisites
- Node.js 20+ (`node -v`)
- An Anthropic API key from https://console.anthropic.com
- A Slack workspace where you can install apps (create a free one at https://slack.com/create if needed)

## Step 2: Install
```bash
cd sponsorops
npm install
cp .env.example .env      # then open .env and fill in values
```

## Step 3: Edit the org profile (important)
Open `knowledge/org.md` and replace every `[BRACKET]` with true facts. The agent only states facts about you that are in this file, so this is what keeps emails honest.

## Step 4: Test the agent in your terminal (no Slack yet)
Put `ANTHROPIC_API_KEY` in `.env`, then:
```bash
npm run cli -- "Tata Steel" "Interested in student entrepreneurship"
```
You should see the agent's tool calls, then a draft with sources. If you get a web search error, set `ENABLE_WEB_SEARCH=false` (drafts will be low confidence) or enable web search in your Anthropic Console.

Offline self-test (no keys needed): `npm run smoke`

## Step 5: Create the Slack app (5 minutes)
1. Go to https://api.slack.com/apps and click **Create New App**, then **From a manifest**.
2. Pick your workspace, paste the contents of `slack-manifest.yml`, and create the app.
3. **Install to Workspace** (Settings > Install App). Copy the **Bot User OAuth Token** (`xoxb-...`) into `SLACK_BOT_TOKEN`.
4. Go to **Basic Information > App-Level Tokens > Generate Token**, name it anything, add the scope `connections:write`. Copy the token (`xapp-...`) into `SLACK_APP_TOKEN`.

## Step 6: Run it
```bash
npm run dev
```
In Slack: create a channel (e.g. `#sponsor-outreach`), run `/invite @SponsorOps`, then:
```
/lead add Tata Steel
/lead add Infosys | they run a campus connect programme
/lead list
/lead stats
```
Click **Approve**, **Edit** or **Reject** on the draft.

## Step 7: Daily digest (optional)
Right-click your channel > View details > copy the Channel ID (starts with `C`) into `DIGEST_CHANNEL`, restart, and the bot posts a digest every day at `DIGEST_CRON` (default 9:00 IST). To test immediately, set `DIGEST_CRON=* * * * *`, wait a minute, then set it back.

## Step 8: Airtable CRM (optional)
1. In Airtable create a base with a table named `Leads` and these fields: `LeadId`, `Company`, `Status`, `Owner`, `FollowUpAt` (all single line text) and `Payload` (long text).
2. Create a personal access token at https://airtable.com/create/tokens with scopes `data.records:read` and `data.records:write` on that base.
3. Set `AIRTABLE_TOKEN` and `AIRTABLE_BASE_ID` (the `app...` part of the base URL) in `.env`. The bot switches from the local JSON file to Airtable automatically.

## Step 9: Keep it running 24/7 (optional)
Socket Mode means no public URL is required, so any always-on host works (Railway, Render, Fly.io, a small VPS):
```bash
npm run build && npm start
```
Set the same environment variables in the host's dashboard. Note: with the JSON store, the file lives on the host's disk, so use Airtable or a persistent volume for anything you care about.

## Guardrails built in
| Risk | Control |
|---|---|
| Emails sent without review | The bot never sends. A human approves, then copies the email into their own inbox |
| Hallucinated facts | Prompt forbids unsourced claims; "high" confidence requires a source URL; low-confidence drafts show a warning |
| Duplicate outreach | Pipeline check before any tokens are spent, plus an agent-side tool |
| Malformed or bloated drafts | `validateDraft` rejects them and the agent must retry |
| Runaway agent | Max turns and a hard timeout (`AGENT_MAX_TURNS`, `AGENT_TIMEOUT_MS`) |
| Prompt injection from web pages | System prompt marks web content as untrusted data |
| Forgotten drafts / leads | Nudge after `APPROVAL_TIMEOUT_HOURS`, follow-up DM after `FOLLOWUP_DAYS` |
| Concurrent button clicks | Serialised JSON writes; handlers ignore already-handled drafts |
| Slack 3-second timeout | Command is acked immediately, agent runs afterwards with live progress updates |

## Project layout
```
src/index.ts           entrypoint (Bolt app + scheduler)
src/agent/agent.ts     Claude tool-use loop
src/agent/tools.ts     tool schemas + draft validation guardrail
src/slack/handlers.ts  /lead command, buttons, edit modal
src/slack/blocks.ts    Slack message layouts
src/scheduler.ts       digest, follow-ups, nudges
src/stats.ts           pipeline metrics
src/store/*            JSON + Airtable storage
knowledge/org.md       sender profile the agent reads
docs/PRD.md            product requirements doc
docs/TEST_LOG.md       template to record real measurements
```

## Troubleshooting
- **`not_in_channel`**: run `/invite @SponsorOps` in the channel.
- **Slash command says "dispatch_failed"**: the app is not running, or Socket Mode is off. Check `npm run dev` output.
- **Buttons do nothing**: confirm Interactivity is on (the manifest enables it) and the app is running.
- **No digest**: `DIGEST_CHANNEL` must be a channel ID, and the bot must be in that channel.
- **Model errors**: set `CLAUDE_MODEL` in `.env` to a model your API key can use.
