import { Lead } from "./types";

export interface Stats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  replied: number;
  approvalRate: number | null; // approved / (approved + rejected)
  editRate: number | null; // edited / approved
  replyRate: number | null; // replied / approved
  avgDraftSeconds: number | null;
  lowConfidence: number;
  estMinutesSaved: number | null;
}

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);

export function computeStats(leads: Lead[], baselineManualMinutes: number, reviewMinutes: number): Stats {
  const everApproved = leads.filter((l) => l.approvedAt);
  const approved = everApproved.length;
  const rejected = leads.filter((l) => l.status === "rejected").length;
  const replied = leads.filter((l) => l.status === "replied").length;
  const pending = leads.filter((l) => l.status === "pending_approval").length;
  const edited = everApproved.filter((l) => l.edited).length;

  const avgDraftSeconds = leads.length
    ? Math.round((leads.reduce((s, l) => s + l.draftSeconds, 0) / leads.length) * 10) / 10
    : null;

  const perLeadSaved =
    avgDraftSeconds === null ? null : baselineManualMinutes - (avgDraftSeconds / 60 + reviewMinutes);

  return {
    total: leads.length,
    pending,
    approved,
    rejected,
    replied,
    approvalRate: pct(approved, approved + rejected),
    editRate: pct(edited, approved),
    replyRate: pct(replied, approved),
    avgDraftSeconds,
    lowConfidence: leads.filter((l) => l.draft.confidence === "low").length,
    estMinutesSaved: perLeadSaved === null ? null : Math.round(perLeadSaved * approved * 10) / 10,
  };
}

export function formatStats(s: Stats, baselineManualMinutes: number, reviewMinutes: number): string {
  const f = (v: number | null, suffix = "") => (v === null ? "n/a" : `${v}${suffix}`);
  return [
    `*Pipeline stats*`,
    `• Leads: *${s.total}* (pending ${s.pending}, approved ${s.approved}, rejected ${s.rejected}, replied ${s.replied})`,
    `• Approval rate: *${f(s.approvalRate, "%")}*   • Edited before approval: *${f(s.editRate, "%")}*`,
    `• Reply rate (of approved): *${f(s.replyRate, "%")}*`,
    `• Avg agent draft time: *${f(s.avgDraftSeconds, "s")}*   • Low-confidence drafts: *${s.lowConfidence}*`,
    `• Est. time saved: *${f(s.estMinutesSaved, " min")}* _(assumes ${baselineManualMinutes} min manual baseline + ${reviewMinutes} min review per lead; set these from your own measurements)_`,
  ].join("\n");
}
