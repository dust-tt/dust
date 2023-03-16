import { proxyActivities } from '@temporalio/workflow';
// Only import the activity types
import type * as slack_activities from './slack/slack'

const { processChannels } = proxyActivities<typeof slack_activities>({
  startToCloseTimeout: '1 minute',
});

/** A workflow that simply calls an activity */
export async function slack_workflow(slack_token:string): Promise<void> {
  await processChannels(slack_token)
}
