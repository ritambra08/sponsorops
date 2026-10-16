import { promises as fs } from "fs";
import path from "path";
import { Confidence, Draft } from "../types";
import type { Store } from "../store/store";

/** Client-side tools the agent can call. Web search is a server-side tool added in agent.ts. */
export const clientTools = [
  {
    name: "get_org_context",
    description:
      "Returns the sender's organisation profile: who is sending, what we offer, what we ask for, tone rules. " +
      "Call this once before drafting. Only use facts from here when describing the sender.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "check_duplicate",
    description:
      "Checks whether this company is already in the outreach pipeline. Call once with the company name before drafting.",
    input_schema: {
      type: "object" as const,
      properties: { company: { type: "string", description: "Company name" } },
      required: ["company"],
    },
  },
  {
    name: "submit_draft",
    description:
      "Submit the final researched outreach draft for human approval. This ends the task. " +
      "Call it exactly once, after research. Never send anything yourself.",
    input_schema: {
      type: "object" as const,
      properties: {
        company: { type: "string", description: "Official company name" },
        summary: { type: "string", description: "2-3 sentences: what the company does and why they fit our ask. Facts only." },
        angle: { type: "string", description: "The specific, verifiable hook used to personalise the email (a recent initiative, programme, launch)." },
        subject: { type: "string", description: "Email subject line, under 60 characters" },
        body: { type: "string", description: "Email body, under 150 words, one clear ask, ends with the sender signature from the org context." },
        contactHint: { type: "string", description: "Best role/team to address (e.g. 'CSR head', 'Marketing lead'), or 'unknown'. Never invent a person's name." },
        confidence: { type: "string", enum: ["high", "medium", "low"], description: "high = angle backed by a source you read; low = little verified info found" },
        sources: { type: "array", items: { type: "string" }, description: "URLs that support the summary and angle" },
      },
      required: ["company", "summary", "angle", "subject", "body", "contactHint", "confidence", "sources"],
    },
  },
];

export async function readOrgContext(): Promise<string> {
  const file = path.join(process.cwd(), "knowledge", "org.md");
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "No org profile found. Write a short, generic, honest email and set confidence to low.";
  }
}

export async function checkDuplicate(store: Store, company: string): Promise<string> {
  const hit = await store.findByCompany(company);
  if (!hit) return JSON.stringify({ duplicate: false });
  return JSON.stringify({ duplicate: true, status: hit.status, createdAt: hit.createdAt });
}

/** Guardrail: reject malformed or unsafe drafts so the model must fix them. Returns a Draft or an error string. */
export function validateDraft(input: any): { ok: true; draft: Draft } | { ok: false; error: string } {
  const str = (k: string) => (typeof input?.[k] === "string" ? input[k].trim() : "");
  const required = ["company", "summary", "angle", "subject", "body", "contactHint"];
  for (const k of required) if (!str(k)) return { ok: false, error: `Field "${k}" is missing or empty.` };

  if (!["high", "medium", "low"].includes(input.confidence)) return { ok: false, error: `confidence must be high, medium or low.` };
  if (str("subject").length > 80) return { ok: false, error: "subject is too long (max 80 chars)." };

  const words = str("body").split(/\s+/).length;
  if (words > 200) return { ok: false, error: `body is ${words} words. Cut it to under 150.` };
  if (/\[(name|company|your)[^\]]*\]/i.test(str("subject"))) return { ok: false, error: "subject contains an unfilled placeholder." };

  const sources: string[] = Array.isArray(input.sources) ? input.sources.filter((s: unknown) => typeof s === "string" && /^https?:\/\//.test(s)) : [];
  if (input.confidence === "high" && sources.length === 0)
    return { ok: false, error: 'confidence "high" requires at least one http(s) source URL.' };

  return {
    ok: true,
    draft: {
      company: str("company"),
      summary: str("summary"),
      angle: str("angle"),
      subject: str("subject"),
      body: str("body"),
      contactHint: str("contactHint"),
      confidence: input.confidence as Confidence,
      sources: sources.slice(0, 5),
    },
  };
}
