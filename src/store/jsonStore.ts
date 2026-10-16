import { promises as fs } from "fs";
import path from "path";
import { Lead } from "../types";
import { normalizeCompany } from "../util";
import type { Store } from "./store";

export class JsonStore implements Store {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private file = path.join(process.cwd(), "data", "leads.json")) {}

  /** Serialises all read-modify-write cycles so concurrent button clicks can't corrupt the file. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async read(): Promise<Lead[]> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8")) as Lead[];
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }

  private async write(leads: Lead[]) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(leads, null, 2));
    await fs.rename(tmp, this.file); // atomic replace
  }

  create(lead: Lead) {
    return this.exclusive(async () => {
      const leads = await this.read();
      leads.push(lead);
      await this.write(leads);
    });
  }

  update(id: string, patch: Partial<Lead>) {
    return this.exclusive(async () => {
      const leads = await this.read();
      const i = leads.findIndex((l) => l.id === id);
      if (i === -1) throw new Error(`Lead ${id} not found`);
      leads[i] = { ...leads[i], ...patch };
      await this.write(leads);
      return leads[i];
    });
  }

  async get(id: string) {
    return (await this.read()).find((l) => l.id === id);
  }

  list() {
    return this.read();
  }

  async findByCompany(company: string) {
    const n = normalizeCompany(company);
    if (!n) return undefined;
    return (await this.read()).find((l) => l.status !== "rejected" && normalizeCompany(l.company) === n);
  }
}
