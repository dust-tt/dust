import parseArgs from "minimist";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { QUEUE_NAME } from "@app/temporal/drop_pending_agents/config";
import { runSignal } from "@app/temporal/drop_pending_agents/signals";
import { dropPendingAgentsWorkflow } from "@app/temporal/drop_pending_agents/workflows";
import {
  launchDropPendingAgentsWorkflow,
  stopDropPendingAgentsWorkflow,
} from "@app/temporal/drop_pending_agents/client";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  const [command] = argv._;

  switch (command) {
    case "start":
      await launchDropPendingAgentsWorkflow();
      return;
    case "stop":
      await stopDropPendingAgentsWorkflow({ stopReason: "Stopped via CLI" });
      return;
    case "run-now":
      const client = await getTemporalClientForFrontNamespace();
      await client.workflow.signalWithStart(dropPendingAgentsWorkflow, {
        workflowId: "drop-pending-agents-workflow",
        taskQueue: QUEUE_NAME,
        signal: runSignal,
        signalArgs: undefined,
      });
      return;
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
