import { App, LogLevel } from "@slack/bolt";
import { assertSlack, cfg } from "./config";
import { registerHandlers } from "./slack/handlers";
import { startScheduler } from "./scheduler";
import { createStore } from "./store/store";

async function main() {
  assertSlack();

  const app = new App({
    token: cfg.slackBotToken,
    appToken: cfg.slackAppToken,
    socketMode: true, // no public URL or ngrok needed
    logLevel: LogLevel.INFO,
  });

  const store = createStore();
  registerHandlers(app, store);
  startScheduler(app, store);

  app.error(async (err) => console.error("[bolt] unhandled error", err));

  await app.start();
  console.log("⚡ SponsorOps is running. Try /lead help in Slack.");
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
