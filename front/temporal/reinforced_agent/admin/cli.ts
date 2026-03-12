import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import {
  launchReinforcedAgentWorkflow,
  startReinforcedAgentForAgentWorkflow,
  startReinforcedAgentWorkspaceWorkflow,
  stopReinforcedAgentWorkflow,
} from "@app/temporal/reinforced_agent/client";
import { QUEUE_NAME } from "@app/temporal/reinforced_agent/config";
import { runSignal } from "@app/temporal/reinforced_agent/signals";
import { reinforcedAgentWorkflow } from "@app/temporal/reinforced_agent/workflows";
import parseArgs from "minimist";

function usage() {
  console.error(`Usage:
  start                                              Start the cron workflow
  stop                                               Stop the cron workflow
  run-now                                            Trigger the top-level workflow immediately
  run-workspace --workspace-id <sId>                 Run for a specific workspace
  run-agent --workspace-id <sId> --agent-id <sId>    Run for a specific agent`);
}

const main = async () => {
  const argv = parseArgs(process.argv.slice(2), {
    string: ["workspace-id", "agent-id"],
  });

  const [command] = argv._;

  switch (command) {
    case "start":
      await launchReinforcedAgentWorkflow();
      return;
    case "stop":
      await stopReinforcedAgentWorkflow({ stopReason: "Stopped via CLI" });
      return;
    case "run-now": {
      const client = await getTemporalClientForFrontNamespace();
      await client.workflow.signalWithStart(reinforcedAgentWorkflow, {
        workflowId: "reinforced-agent-workflow",
        taskQueue: QUEUE_NAME,
        signal: runSignal,
        signalArgs: undefined,
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
      await startReinforcedAgentWorkspaceWorkflow({ workspaceId });
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
      await startReinforcedAgentForAgentWorkflow({
        workspaceId,
        agentConfigurationId: agentId,
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
