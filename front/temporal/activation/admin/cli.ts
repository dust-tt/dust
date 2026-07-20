import { determineEligibleActivationUsers } from "@app/lib/api/activation/orchestrator";
import { emitActivationEvent } from "@app/lib/api/activation/trigger";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
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

  if (dryRun) {
    cliLogger.info("dry run — no activation events sent");
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  // Deduping because we only need to emit one activation event per pod.
  // The configured triggers will determine which users are nudged.
  const uniqueSpaceIds = [...new Set(eligible.map((plan) => plan.spaceId))];
  const pods = await SpaceResource.fetchByIds(auth, uniqueSpaceIds);
  const podBySId = new Map(pods.map((pod) => [pod.sId, pod]));

  for (const spaceId of uniqueSpaceIds) {
    const pod = podBySId.get(spaceId);
    if (!pod) {
      cliLogger.error({ spaceId }, "pod space not found, skipping event");
      continue;
    }

    const result = await emitActivationEvent(auth, pod);
    if (result.isErr()) {
      cliLogger.error(
        { spaceId, error: result.error.message },
        "failed to send activation event"
      );
      continue;
    }

    cliLogger.info({ spaceId }, "activation event sent");
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
