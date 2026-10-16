/**
 * Offline smoke test: no API keys needed.
 * Checks store, duplicate detection, guardrail validation, stats and Slack block builders.
 */
import assert from "assert";
import os from "os";
import path from "path";
import { validateDraft } from "../src/agent/tools";
import { JsonStore } from "../src/store/jsonStore";
import { computeStats, formatStats } from "../src/stats";
import { approvedBlocks, digestBlocks, followUpBlocks, listBlocks, pendingBlocks } from "../src/slack/blocks";
import { Lead } from "../src/types";
import { normalizeCompany } from "../src/util";

const file = path.join(os.tmpdir(), `sponsorops-smoke-${Date.now()}.json`);

const mkLead = (id: string, company: string, over: Partial<Lead> = {}): Lead => ({
  id,
  company,
  status: "pending_approval",
  owner: "U123",
  channel: "C123",
  messageTs: "1.1",
  draft: {
    company,
    summary: "Makes things.",
    angle: "Runs a campus programme.",
    subject: "Partnering on APOGEE",
    body: "Hi team, short note.",
    contactHint: "CSR head",
    confidence: "medium",
    sources: ["https://example.com"],
  },
  draftSeconds: 30,
  agentSteps: [],
  edited: false,
  createdAt: new Date().toISOString(),
  ...over,
});

async function main() {
  // normalize
  assert.equal(normalizeCompany("Acme Pvt. Ltd."), normalizeCompany("ACME"));

  // store
  const store = new JsonStore(file);
  await store.create(mkLead("a1", "Acme Pvt. Ltd."));
  assert.ok(await store.findByCompany("acme"), "duplicate should be found");
  await Promise.all([store.update("a1", { edited: true }), store.update("a1", { owner: "U999" })]);
  const a1 = await store.get("a1");
  assert.equal(a1?.edited, true);
  assert.equal(a1?.owner, "U999");
  await store.update("a1", { status: "rejected" });
  assert.equal(await store.findByCompany("acme"), undefined, "rejected leads can be re-added");

  // guardrails
  const good = { ...mkLead("x", "X").draft };
  assert.ok(validateDraft(good).ok);
  assert.ok(!validateDraft({ ...good, body: "word ".repeat(250) }).ok, "long body rejected");
  assert.ok(!validateDraft({ ...good, confidence: "high", sources: [] }).ok, "high confidence needs sources");
  assert.ok(!validateDraft({ ...good, subject: "" }).ok, "empty subject rejected");

  // stats
  const leads = [
    mkLead("1", "A", { status: "approved", approvedAt: new Date().toISOString(), edited: true }),
    mkLead("2", "B", { status: "replied", approvedAt: new Date().toISOString() }),
    mkLead("3", "C", { status: "rejected" }),
    mkLead("4", "D"),
  ];
  const s = computeStats(leads, 25, 3);
  assert.equal(s.total, 4);
  assert.equal(s.approved, 2);
  assert.equal(s.approvalRate, 66.7);
  assert.equal(s.editRate, 50);
  assert.equal(s.replyRate, 50);
  console.log(formatStats(s, 25, 3));

  // blocks
  const l = mkLead("5", "E", { approvedBy: "U1", followUpAt: new Date().toISOString() });
  for (const blocks of [pendingBlocks(l), approvedBlocks(l), followUpBlocks(l), digestBlocks(leads), listBlocks(leads)]) {
    assert.ok(Array.isArray(blocks) && blocks.length > 0);
    assert.ok(JSON.stringify(blocks).length < 50_000);
  }

  console.log("\n✅ Smoke test passed");
}

main().catch((e) => {
  console.error("❌ Smoke test failed:", e);
  process.exit(1);
});
