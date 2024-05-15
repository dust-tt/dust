import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";

export async function retrieveGongTranscripts(transcriptsConfiguration: LabsTranscriptsConfigurationResource, localLogger: Logger): Promise<string[]> {
  // Retrieve recent transcripts from Gong
  // const fromDateTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
   // DEBUG A LOT OF TIME AGO
  const fromDateTime = new Date(Date.now() - 2400 * 60 * 60 * 1000).toISOString();
  const newTranscripts = await fetch(`https://api.gong.io/v2/calls?fromDateTime=${fromDateTime}`, {
    headers: {
      Authorization: `Basic ${transcriptsConfiguration.gongApiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (!newTranscripts.ok) {
    localLogger.error(
      {},
      "[retrieveNewTranscripts] Error fetching new transcripts from Gong. Skipping."
    );
    return [];
  }

  const newTranscriptsData = await newTranscripts.json();

  if (!newTranscriptsData || newTranscriptsData.length === 0) {
    localLogger.info(
      {},
      "[retrieveNewTranscripts] No new transcripts found from Gong."
    );
    return [];
  }

  const fileIdsToProcess = [];

  for (const call of newTranscriptsData.calls) {
    const { id: fileId } = call;
    if (!fileId) {
      localLogger.error(
        {},
        "[retrieveNewTranscripts] call does not have an id. Skipping."
      );
      continue;
    }

    const history = await transcriptsConfiguration.fetchHistoryForFileId(fileId);
    if (history) {
      localLogger.info(
        { fileId },
        "[retrieveNewTranscripts] call already processed. Skipping."
      );
      continue;
    }

    fileIdsToProcess.push(fileId);
  }

  return fileIdsToProcess;
}