import {
  launchAllReinforcedSkillsWorkspaceCrons,
  launchReinforcementWorkspaceCron,
  startReinforcementWorkspaceWorkflow,
  stopAllReinforcedSkillsWorkspaceCrons,
  stopReinforcementWorkspaceCron,
} from "@app/temporal/reinforcement/client";
import parseArgs from "minimist";

function usage() {
  console.error(`Usage:
  start                                                                          Start cron workflows for all flagged workspaces
  stop                                                                           Stop cron workflows for all flagged workspaces
  start-workspace --workspace-id <sId>                                          Start the cron workflow for a specific workspace
  stop-workspace --workspace-id <sId>                                           Stop the cron workflow for a specific workspace
  run-workspace --workspace-id <sId> [--batch] [--skill-id <sId>] [--days <n>] Run once for a specific workspace
  run-skill --workspace-id <sId> --skill-id <sId> [--batch] [--days <n>]       Run for a specific skill (shorthand)`);
}

const main = async () => {
  const argv = parseArgs(process.argv.slice(2), {
    string: ["workspace-id", "skill-id"],
    boolean: ["batch"],
    default: { batch: false },
  });

  const [command] = argv._;

  switch (command) {
    case "start":
      await launchAllReinforcedSkillsWorkspaceCrons();
      return;
    case "stop":
      await stopAllReinforcedSkillsWorkspaceCrons();
      return;
    case "start-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      await launchReinforcementWorkspaceCron({ workspaceId });
      return;
    }
    case "stop-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      await stopReinforcementWorkspaceCron({
        workspaceId,
        stopReason: "Stopped via CLI",
      });
      return;
    }
    case "run-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      const conversationLookbackDays =
        argv["days"] !== undefined ? Number(argv["days"]) : undefined;
      await startReinforcementWorkspaceWorkflow({
        workspaceId,
        useBatchMode: argv["batch"],
        skillId: argv["skill-id"],
        conversationLookbackDays,
      });
      return;
    }
    case "run-skill": {
      const workspaceId = argv["workspace-id"];
      const skillId = argv["skill-id"];
      if (!workspaceId || !skillId) {
        console.error("Error: --workspace-id and --skill-id are required");
        usage();
        process.exit(1);
      }
      const conversationLookbackDays =
        argv["days"] !== undefined ? Number(argv["days"]) : undefined;
      await startReinforcementWorkspaceWorkflow({
        workspaceId,
        useBatchMode: argv["batch"],
        skillId,
        conversationLookbackDays,
      });
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
