import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/upsert_queue/activities";
import type * as audioTranscriptActivities from "@app/temporal/upsert_queue/audio_transcript_activities";

const MAX_UPSERT_ATTEMPTS = 10;

const { upsertDocumentActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: MAX_UPSERT_ATTEMPTS,
  },
});

const { upsertAudioTranscriptionActivity } = proxyActivities<
  typeof audioTranscriptActivities
>({
  startToCloseTimeout: "10 minutes",
  retry: {
    maximumAttempts: MAX_UPSERT_ATTEMPTS,
  },
});

export async function upsertDocumentWorkflow(
  upsertQueueId: string,
  enqueueTimestamp: number
) {
  await upsertDocumentActivity(upsertQueueId, enqueueTimestamp);
}

export async function upsertAudioTranscriptionWorkflow(upsertQueueId: string) {
  await upsertAudioTranscriptionActivity(upsertQueueId);
}
