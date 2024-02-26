import mainLogger from "@app/logger/logger";

export async function upsertDocumentActivity(upsertQueueId: string) {
  mainLogger.info({ upsertQueueId }, "Retrieving upsert queue item");

  // TODO: Implement upsert logic
}
