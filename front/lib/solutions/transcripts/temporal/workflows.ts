import {
  continueAsNew,
  proxyActivities,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";

import { SolutionsTranscriptsConfigurationResource } from "@app/lib/resources/solutions_transcripts_configuration_resource";
import type { SolutionsTranscriptsProviderType } from "@app/lib/solutions/transcripts/utils/types";

import type * as activities from "./activities";

const {
  retrieveNewTranscriptsActivity,
  summarizeGoogleDriveTranscriptActivity
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function retrieveNewTranscriptsWorkflow(
  userId: number,
  providerId: SolutionsTranscriptsProviderType
) {
  // 15 minutes
  const SECONDS_INTERVAL_BETWEEN_PULLS = 15 * 60;

  do {
    const isActive = await SolutionsTranscriptsConfigurationResource.getIsActive(
      {
        userId,
        provider: providerId,
      }
    )

    if (!isActive) {
      break;
    }

    await retrieveNewTranscriptsActivity(userId, providerId);
    await sleep(SECONDS_INTERVAL_BETWEEN_PULLS * 1000);

    // Temporal becomes slow > 4000 lines so we need to continue as new
    if (workflowInfo().historyLength > 4000) {
      await continueAsNew<typeof retrieveNewTranscriptsWorkflow>(
        userId,
        providerId
      );
    }
    // This is to assure that the workflow will stay alive
    // Linter does not like while(true)
  } while (workflowInfo().historyLength < 5000);
}

export async function summarizeTranscriptWorkflow(
  userId: number,
  fileId: string
) {
  await summarizeGoogleDriveTranscriptActivity(userId, fileId);
}
