import parseArgs from "minimist";

import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import {
  launchDowngradeFreeEndedWorkspacesWorkflow,
  stopDowngradeFreeEndedWorkspacesWorkflow,
} from "@app/temporal/scrub_workspace/client";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  const [command] = argv._;

  switch (command) {
    case "log-free-ended-workspaces":
      const { workspaces } =
        await SubscriptionResource.internalFetchWorkspacesWithFreeEndedSubscriptions();
      console.log(`Found ${workspaces.length} free ended workspaces:`);
      console.log(workspaces.map((w) => w.sId));
      return;
    case "lauch-workflow-to-downgrade-free-ended-workspaces":
      await launchDowngradeFreeEndedWorkspacesWorkflow();
      return;
    case "stop-workflow-to-downgrade-free-ended-workspaces":
      await stopDowngradeFreeEndedWorkspacesWorkflow({
        stopReason: "Stopped via CLI",
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
