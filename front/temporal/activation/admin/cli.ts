import {
  determineEligibleActivationUsers,
} from "@app/lib/api/activation/orchestrator";
import logger from "@app/logger/logger";
import parseArgs from "minimist";

const cliLogger = logger.child({ component: "activation.orchestrator.cli" });

function usage() {
  console.error(`Usage:
  run --workspace <sId> [--dry-run] [--execute] [--user <userId>]

Options:
  --workspace <sId>    Workspace sId to run against (required)
  --dry-run            Print the nudge plan, touch nothing (default)
  --execute            Fire real nudges
  --user <userId>     Restrict to a single user (model id)`);
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
    console.error("Error: --workspace is required");
    usage();
    process.exit(1);
  }

  const userIdFilter: number | null =
    argv["user"] != null ? parseInt(argv["user"], 10) : null;
  const dryRun = !argv["execute"];

  cliLogger.info({ workspaceId, userIdFilter, dryRun }, "starting run");

  const { eligible, skipped } = await determineEligibleActivationUsers({
    workspaceId,
    userIdFilter,
  });

  cliLogger.info(
    { workspaceId, userIdFilter, eligibleCount: eligible.length, skippedCount: skipped.length },
    "Nudge plan"
  );

  for (const plan of eligible) {
    cliLogger.info({ userId: plan.targetUserId, podId: plan.podId }, "User eligible for nudge");
  }
  for (const s of skipped) {
    cliLogger.info({ userId: s.userId, podId: s.podId }, "User skipped for nudge");
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
