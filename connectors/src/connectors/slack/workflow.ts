import { proxyActivities } from "@temporalio/workflow";

import logger from "../../logger/logger";
import type * as activities from "./slack.js"; // purely for type safety

const { getChannels } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

/**
 * Here only for show casing.
 */
export async function printSlackChannelsWorkflow(
  nangoConnectionId: string
): Promise<void> {
  const channels = await getChannels(nangoConnectionId);
  logger.info("channels:", channels);
  return;
}
