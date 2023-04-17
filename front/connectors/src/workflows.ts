import { proxyActivities } from "@temporalio/workflow";
// Only import the activity types
import type * as slack_activities from "./slack/full_sync";
import { DustConfig, SlackConfig } from "./slack/interface";

const { syncAllChannels } = proxyActivities<typeof slack_activities>({
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 2,
  },
});

/** A workflow that simply calls an activity */
export async function slack_workflow(
  slackConfig: SlackConfig,
  dustConfig: DustConfig
): Promise<void> {
  await syncAllChannels(slackConfig, dustConfig);
}
