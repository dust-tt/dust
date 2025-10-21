import parseArgs from "minimist";

import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import {
  launchDataRetentionWorkflow,
  stopDataRetentionWorkflow,
} from "@app/temporal/data_retention/client";
import { QUEUE_NAME } from "@app/temporal/data_retention/config";
import { runSignal } from "@app/temporal/data_retention/signals";
import { dataRetentionWorkflow } from "@app/temporal/data_retention/workflows";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  const [command] = argv._;

  switch (command) {
    case "start":
      await launchDataRetentionWorkflow();
      return;
    case "stop":
      await stopDataRetentionWorkflow();
      return;
    case "run-now":
      const client = await getTemporalClientForFrontNamespace();
      await client.workflow.signalWithStart(dataRetentionWorkflow, {
        workflowId: "data-retention-workflow",
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
