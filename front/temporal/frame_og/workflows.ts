import type * as activities from "@app/temporal/frame_og/activities";
import { proxyActivities } from "@temporalio/workflow";

const { generateFrameOgImageActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "3 minutes",
  retry: {
    maximumAttempts: 5,
    initialInterval: "5s",
    backoffCoefficient: 2,
    maximumInterval: "1m",
  },
});

export async function generateFrameOgImageWorkflow({
  workspaceId,
  frameId,
}: {
  workspaceId: string;
  frameId: string;
}): Promise<void> {
  await generateFrameOgImageActivity({ workspaceId, frameId });
}
