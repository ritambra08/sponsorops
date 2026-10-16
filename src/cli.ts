/**
 * Test the agent from the terminal, no Slack needed:
 *   npm run cli -- "Company Name" "optional extra context"
 */
import { runLeadAgent } from "./agent/agent";
import { createStore } from "./store/store";

async function main() {
  const [company, context] = process.argv.slice(2);
  if (!company) {
    console.error('Usage: npm run cli -- "Company Name" "optional context"');
    process.exit(1);
  }
  const store = createStore();
  console.log(`\nResearching ${company}...\n`);
  const { draft, steps, seconds } = await runLeadAgent({ company, context }, store, (s) => console.log("  ", s));

  console.log(`\n=== DRAFT (${seconds}s, confidence: ${draft.confidence}) ===`);
  console.log(`Company:  ${draft.company}`);
  console.log(`Summary:  ${draft.summary}`);
  console.log(`Angle:    ${draft.angle}`);
  console.log(`Address:  ${draft.contactHint}`);
  console.log(`Sources:  ${draft.sources.join("\n          ") || "none"}`);
  console.log(`\nSubject: ${draft.subject}\n\n${draft.body}\n`);
  console.log(`Tool calls: ${steps.length}`);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
