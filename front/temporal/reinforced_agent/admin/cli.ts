import {
  launchAllReinforcedAgentWorkspaceCrons,
  launchReinforcedAgentWorkspaceCron,
  startReinforcedAgentForAgentWorkflow,
  startReinforcedAgentWorkspaceWorkflow,
  stopAllReinforcedAgentWorkspaceCrons,
  stopReinforcedAgentWorkspaceCron,
} from "@app/temporal/reinforced_agent/client";
import parseArgs from "minimist";

function usage() {
  console.error(`Usage:
  start                                                                          Start cron workflows for all flagged workspaces
  stop                                                                           Stop cron workflows for all flagged workspaces
  start-workspace --workspace-id <sId>                                          Start the cron workflow for a specific workspace
  stop-workspace --workspace-id <sId>                                           Stop the cron workflow for a specific workspace
  run-workspace --workspace-id <sId> [--batch]                                  Run once for a specific workspace (--batch defaults to false)
  run-agent --workspace-id <sId> --agent-id <sId> [--batch] [--days <n>]       Run for a specific agent (--batch defaults to false, --days defaults to 1)`);
}

const main = async () => {
  const argv = parseArgs(process.argv.slice(2), {
    string: ["workspace-id", "agent-id"],
    boolean: ["batch"],
    default: { batch: false },
  });

  const [command] = argv._;

  switch (command) {
    case "start":
      await launchAllReinforcedAgentWorkspaceCrons();
      return;
    case "stop":
      await stopAllReinforcedAgentWorkspaceCrons();
      return;
    case "start-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      await launchReinforcedAgentWorkspaceCron({ workspaceId });
      return;
    }
    case "stop-workspace": {
      const workspaceId = argv["workspace-id"];
      if (!workspaceId) {
        console.error("Error: --workspace-id is required");
        usage();
        process.exit(1);
      }
      await stopReinforcedAgentWorkspaceCron({
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
      await startReinforcedAgentWorkspaceWorkflow({
        workspaceId,
        useBatchMode: argv["batch"],
      });
      return;
    }
    case "run-agent": {
      const workspaceId = argv["workspace-id"];
      const agentId = argv["agent-id"];
      if (!workspaceId || !agentId) {
        console.error("Error: --workspace-id and --agent-id are required");
        usage();
        process.exit(1);
      }
      const conversationLookbackDays =
        argv["days"] !== undefined ? Number(argv["days"]) : 1;
      await startReinforcedAgentForAgentWorkflow({
        workspaceId,
        agentConfigurationId: agentId,
        useBatchMode: argv["batch"],
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
