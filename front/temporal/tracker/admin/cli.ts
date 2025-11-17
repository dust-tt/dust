import parseArgs from "minimist";

import { processTrackerNotification } from "@app/lib/api/tracker";
import logger from "@app/logger/logger";
import {
  launchTrackerNotificationWorkflow,
  stopTrackerNotificationWorkflow,
} from "@app/temporal/tracker/client";

const main = async () => {
  const argv = parseArgs(process.argv.slice(2));

  const [command] = argv._;

  const workspaceId = argv.workspaceId;
  const trackerId = argv.trackerId;

  switch (command) {
    case "start":
      await launchTrackerNotificationWorkflow();
      return;
    case "stop":
      await stopTrackerNotificationWorkflow();
      return;
    case "run-workflow-for-tracker":
      // This is a debug command to run the tracker notification workflow for a specific tracker.
      // This will run the workflow immediately with this tracker signaled.
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
    case "run-tracker-notification-manually":
      // This is a debug command to run the tracker notification for a specific tracker.
      // This does not run the workflow, but just the notification logic.
      if (!workspaceId || !trackerId) {
        console.error("workspaceId and trackerId are required");
        return;
      }
      await processTrackerNotification({
        trackerId: argv.trackerId,
        workspaceId: argv.workspaceId,
        currentRunMs: Date.now(),
        localLogger: logger,
      });
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
