/** Lowercase, strip punctuation and common suffixes so "Acme Pvt. Ltd." == "acme". */
export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(pvt|private|ltd|limited|inc|llc|corp|corporation|co|company|india)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** Slack renders this in each viewer's own timezone. */
export function slackDate(iso: string | undefined): string {
  if (!iso) return "n/a";
  const unix = Math.floor(new Date(iso).getTime() / 1000);
  return `<!date^${unix}^{date_short_pretty} {time}|${iso.slice(0, 10)}>`;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}
