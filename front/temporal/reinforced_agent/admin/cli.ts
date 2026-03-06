import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import {
  launchReinforcedAgentWorkflow,
  stopReinforcedAgentWorkflow,
} from "@app/temporal/reinforced_agent/client";
import { QUEUE_NAME } from "@app/temporal/reinforced_agent/config";
import { runSignal } from "@app/temporal/reinforced_agent/signals";
import { reinforcedAgentWorkflow } from "@app/temporal/reinforced_agent/workflows";
import parseArgs from "minimist";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

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
    default:
      console.error("\x1b[31m%s\x1b[0m", `Error: Unknown command`);
      return;
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
