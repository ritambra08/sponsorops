import { Lead } from "../types";
import { cfg } from "../config";
import { JsonStore } from "./jsonStore";
import { AirtableStore } from "./airtableStore";

export interface Store {
  create(lead: Lead): Promise<void>;
  update(id: string, patch: Partial<Lead>): Promise<Lead>;
  get(id: string): Promise<Lead | undefined>;
  list(): Promise<Lead[]>;
  /** Finds a non-rejected lead whose normalized company name matches. */
  findByCompany(company: string): Promise<Lead | undefined>;
}

export function createStore(): Store {
  if (cfg.airtable.token && cfg.airtable.baseId) {
    console.log("[store] Using Airtable CRM");
    return new AirtableStore(cfg.airtable.token, cfg.airtable.baseId, cfg.airtable.table);
  }
  console.log("[store] Using local JSON file (data/leads.json)");
  return new JsonStore();
}
