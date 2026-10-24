import { attackerMode } from "./config.js";
import { info } from "./ui.js";

async function main(): Promise<void> {
  const mode = attackerMode();
  info(`Maelstrom demo attacker starting (mode=${mode})`);
  info("This agent targets ONLY the local sandbox gateway. It is defensive-demo use.");

  if (mode === "llm") {
    const { runLlm } = await import("./llm.js");
    await runLlm();
  } else {
    const { runScripted } = await import("./scripted.js");
    await runScripted();
  }

  info("attacker run complete");
}

main().catch((e) => {
  console.error("attacker fatal error:", e);
  process.exit(1);
});
