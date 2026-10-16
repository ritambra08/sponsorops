export type LeadStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "replied"
  | "no_response";

export type Confidence = "high" | "medium" | "low";

export interface Draft {
  company: string;
  summary: string; // what the company does + why it fits
  angle: string; // the personalised hook used in the email
  subject: string;
  body: string;
  contactHint: string; // who to address, or "unknown"
  confidence: Confidence;
  sources: string[];
}

export interface Lead {
  id: string;
  company: string;
  context?: string;
  status: LeadStatus;
  owner: string; // Slack user id of the person who ran /lead add
  channel: string; // channel holding the approval message
  messageTs: string; // ts of the approval message (so we can update it)
  draft: Draft;
  draftSeconds: number; // how long the agent took
  agentSteps: string[]; // audit trail of tool calls
  edited: boolean; // human edited the draft before approving
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedBy?: string;
  followUpAt?: string;
  followUpNotified?: boolean;
  nudgedAt?: string;
}
