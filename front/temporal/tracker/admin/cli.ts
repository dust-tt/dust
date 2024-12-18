import parseArgs from "minimist";

import { TrackerConfigurationResource } from "@app/lib/resources/tracker_resource";
import {
  launchTrackerNotificationWorkflow,
  stopTrackerNotificationWorkflow,
} from "@app/temporal/tracker/client";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  const [command] = argv._;

  console.log(`Running command: ${command}`);

  switch (command) {
    case "start":
      await launchTrackerNotificationWorkflow();
      return;
    case "stop":
      await stopTrackerNotificationWorkflow();
      return;
    case "notify":
      const workspaceId = argv.workspaceId;
      const trackerId = argv.trackerId;
      if (!workspaceId || !trackerId) {
        console.error("workspaceId and trackerId are required");
        return;
      }
      await launchTrackerNotificationWorkflow([
        {
          workspaceId,
          trackerId,
        },
      ]);
      return;
    default:
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
