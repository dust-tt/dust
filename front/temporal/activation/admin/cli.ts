import { determineEligibleActivationUsers } from "@app/lib/api/activation/orchestrator";
import logger from "@app/logger/logger";
import parseArgs from "minimist";

const cliLogger = logger.child({ component: "activation.orchestrator.cli" });

function usage() {
  cliLogger.info(`Usage:
  run --workspace <sId> [--dry-run] [--execute] [--user <sId>]

Options:
  --workspace <sId>    Workspace sId to run against (required)
  --dry-run            Print the nudge plan, touch nothing (default)
  --execute            Fire real nudges
  --user <sId>         Restrict to a single user (sId)`);
}

const main = async () => {
  const argv = parseArgs(process.argv.slice(2), {
    string: ["workspace", "user"],
    boolean: ["dry-run", "execute"],
    default: { "dry-run": true, execute: false },
  });

  const [command] = argv._;

  if (command !== "run") {
    usage();
    process.exit(1);
  }

  const workspaceId: string | undefined = argv["workspace"];
  if (!workspaceId) {
    cliLogger.error("--workspace is required");
    usage();
    process.exit(1);
  }

  const userId: string | null = argv["user"] ?? null;
  const dryRun = !argv["execute"];

  cliLogger.info({ workspaceId, userId, dryRun }, "starting run");

  const { eligible, skipped } = await determineEligibleActivationUsers({
    workspaceId,
    userId,
  });

  cliLogger.info(
    {
      workspaceId,
      userId,
      eligibleCount: eligible.length,
      skippedCount: skipped.length,
    },
    "Nudge plan"
  );

  for (const plan of eligible) {
    cliLogger.info(
      { userId: plan.targetUserId, podId: plan.podId },
      "User eligible for nudge"
    );
  }
  for (const s of skipped) {
    cliLogger.info(
      { userId: s.userId, podId: s.podId },
      "User skipped for nudge"
    );
  }
};

main()
  .then(() => {
    cliLogger.info("done");
    process.exit(0);
  })
  .catch((err) => {
    cliLogger.error({ err }, "fatal error");
    process.exit(1);
  });
