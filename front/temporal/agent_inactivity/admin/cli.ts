import logger from "@app/logger/logger";
import {
  launchArchiveInactiveAgentsSchedule,
  launchArchiveWorkspaceInactiveAgentsWorkflow,
  stopArchiveInactiveAgentsSchedule,
  triggerArchiveInactiveAgentsSchedule,
} from "@app/temporal/agent_inactivity/client";
import parseArgs from "minimist";

const cliLogger = logger.child({ component: "agent_inactivity.cli" });

function usage() {
  cliLogger.info(`Usage:
  start                                Create the nightly archival schedule
  stop                                 Delete the nightly archival schedule
  run-now                              Fire the schedule now: enumeration and fan-out
  run-workspace --workspaceId <sId>    Sweep one workspace, skipping the enumeration`);
}

const main = async () => {
  const argv = parseArgs(process.argv.slice(2), { string: ["workspaceId"] });

  const [command] = argv._;

  switch (command) {
    case "start": {
      const res = await launchArchiveInactiveAgentsSchedule();
      if (res.isErr()) {
        throw res.error;
      }
      return;
    }
    case "stop": {
      const res = await stopArchiveInactiveAgentsSchedule();
      if (res.isErr()) {
        throw res.error;
      }
      return;
    }
    case "run-now": {
      const res = await triggerArchiveInactiveAgentsSchedule();
      if (res.isErr()) {
        throw res.error;
      }
      return;
    }
    case "run-workspace": {
      const { workspaceId } = argv;
      if (!workspaceId) {
        usage();
        process.exit(1);
      }

      const res = await launchArchiveWorkspaceInactiveAgentsWorkflow({
        workspaceId,
      });
      if (res.isErr()) {
        throw res.error;
      }

      cliLogger.info({ workflowId: res.value }, "Started workspace sweep");
      return;
    }
    default:
      usage();
      process.exit(1);
  }
};

main()
  .then(() => {
    cliLogger.info("Done");
    process.exit(0);
  })
  .catch((err) => {
    cliLogger.error({ err }, "Fatal error");
    process.exit(1);
  });
