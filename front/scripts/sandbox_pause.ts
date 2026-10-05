#!/usr/bin/env tsx
import { parseArgs } from "node:util";
import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { Sandbox } from "e2b";

async function pauseSandbox(sandboxId: string): Promise<void> {
  logger.info({ sandboxId }, "Pausing sandbox");

  const e2bConfig = config.getE2BSandboxConfig();
  const sandbox = await Sandbox.connect(sandboxId, {
    apiKey: e2bConfig.apiKey,
    domain: e2bConfig.domain,
  });

  await sandbox.betaPause();
  logger.info({ sandboxId }, "Sandbox paused successfully");
}

async function resumeSandbox(sandboxId: string): Promise<void> {
  logger.info({ sandboxId }, "Resuming sandbox");

  // Sandbox.connect() automatically resumes paused sandboxes
  const e2bConfig = config.getE2BSandboxConfig();
  await Sandbox.connect(sandboxId, {
    apiKey: e2bConfig.apiKey,
    domain: e2bConfig.domain,
  });

  logger.info({ sandboxId }, "Sandbox resumed successfully");
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      sandboxId: {
        type: "string",
        short: "s",
      },
      resume: {
        type: "boolean",
        short: "r",
        default: false,
      },
    },
  });

  const sandboxId = values.sandboxId;
  const shouldResume = values.resume;

  if (!sandboxId) {
    logger.error("Error: --sandboxId (-s) is required");
    logger.error("Usage: sandbox_pause.ts -s <sandbox-id> [--resume]");
    process.exit(1);
  }

  if (shouldResume) {
    await resumeSandbox(sandboxId);
  } else {
    await pauseSandbox(sandboxId);
  }
}

main().catch((err) => {
  logger.error({ err }, "Fatal error");
  process.exit(1);
});
