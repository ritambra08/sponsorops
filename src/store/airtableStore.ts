import { Lead } from "../types";
import { normalizeCompany } from "../util";
import type { Store } from "./store";

/**
 * Airtable-backed CRM.
 * Create a table (default name "Leads") with these fields, all type "Single line text"
 * except Payload which must be "Long text":
 *   LeadId, Company, Status, Owner, FollowUpAt, Payload
 * The full lead is kept as JSON in Payload; the other columns are for humans to filter/sort.
 */
export class AirtableStore implements Store {
  private recordIds = new Map<string, string>();
  private base: string;

  constructor(private token: string, baseId: string, private table: string) {
    this.base = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
  }

  private async api(url: string, init: RequestInit = {}) {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    return res.json() as Promise<any>;
  }

  private fields(l: Lead) {
    return {
      LeadId: l.id,
      Company: l.company,
      Status: l.status,
      Owner: l.owner,
      FollowUpAt: l.followUpAt ?? "",
      Payload: JSON.stringify(l),
    };
  }

  async create(lead: Lead) {
    const out = await this.api(this.base, {
      method: "POST",
      body: JSON.stringify({ fields: this.fields(lead) }),
    });
    this.recordIds.set(lead.id, out.id);
  }

  async list(): Promise<Lead[]> {
    const leads: Lead[] = [];
    let offset: string | undefined;
    do {
      const url = new URL(this.base);
      url.searchParams.set("pageSize", "100");
      if (offset) url.searchParams.set("offset", offset);
      const out = await this.api(url.toString());
      for (const r of out.records) {
        try {
          const lead = JSON.parse(r.fields.Payload) as Lead;
          this.recordIds.set(lead.id, r.id);
          leads.push(lead);
        } catch {
          /* skip rows a human added by hand */
        }
      }
      offset = out.offset;
    } while (offset);
    return leads;
  }

  async get(id: string) {
    return (await this.list()).find((l) => l.id === id);
  }

  async update(id: string, patch: Partial<Lead>) {
    const current = await this.get(id);
    if (!current) throw new Error(`Lead ${id} not found`);
    const next = { ...current, ...patch };
    const rid = this.recordIds.get(id);
    await this.api(`${this.base}/${rid}`, { method: "PATCH", body: JSON.stringify({ fields: this.fields(next) }) });
    return next;
  }

  async findByCompany(company: string) {
    const n = normalizeCompany(company);
    if (!n) return undefined;
    return (await this.list()).find((l) => l.status !== "rejected" && normalizeCompany(l.company) === n);
  }
}
