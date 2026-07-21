import {
  deleteActivationWorkspaceSchedule,
  ensureActivationWorkspaceSchedules,
  launchEnsureActivationSchedulesWorkflow,
  startActivationWorkspaceSchedule,
  stopAllActivationWorkspaceSchedules,
  stopEnsureActivationSchedulesWorkflow,
  triggerActivationWorkspaceWorkflow,
} from "@app/temporal/activation_scheduler/client";
import parseArgs from "minimist";

function usage() {
  console.error(`Usage:
  start                                        Ensure all workspace schedules (start missing, stop extra)
  stop                                         Stop all running schedules
  start-ensure                                 Start the nightly ensure-schedules workflow (11pm local)
  stop-ensure                                  Stop the nightly ensure-schedules workflow
  start-workspace --workspace-id <sId>         Start the schedule for a specific workspace
  stop-workspace --workspace-id <sId>          Stop the schedule for a specific workspace
  trigger-workspace --workspace-id <sId>       Trigger an activation cycle for a specific workspace on demand`);
}

const main = async () => {
  const argv = parseArgs(process.argv.slice(2), {
    string: ["workspace-id"],
  });

  const [command] = argv._;

  switch (command) {
    case "start":
      await ensureActivationWorkspaceSchedules();
      return;
    case "stop":
      await stopAllActivationWorkspaceSchedules();
      return;
    case "start-ensure":
      await launchEnsureActivationSchedulesWorkflow();
      return;
    case "stop-ensure":
      await stopEnsureActivationSchedulesWorkflow();
      return;
    case "start-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      await startActivationWorkspaceSchedule({ workspaceId });
      return;
    }
    case "stop-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      await deleteActivationWorkspaceSchedule({ workspaceId });
      return;
    }
    case "trigger-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      await triggerActivationWorkspaceWorkflow({ workspaceId });
      return;
    }
    default:
      console.error(`Error: Unknown command "${command}"`);
      usage();
      process.exit(1);
  }
};

main()
  .then(() => {
    console.error("\x1b[32m%s\x1b[0m", `Done`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\x1b[31m%s\x1b[0m", `Error: ${err.message}`);
    console.log(err);
    process.exit(1);
  });
