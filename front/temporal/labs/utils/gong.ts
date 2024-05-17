import { getAccessTokenFromNango } from "@app/lib/labs/transcripts/utils/helpers";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";

export async function retrieveGongTranscripts(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  localLogger: Logger
): Promise<string[]> {
  // Retrieve recent transcripts from Gong
  // const fromDateTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  // DEBUG A LOT OF TIME AGO
  const fromDateTime = new Date(
    Date.now() - 2400 * 60 * 60 * 1000
  ).toISOString();

  if (!transcriptsConfiguration.connectionId) {
    localLogger.error(
      {},
      "[retrieveGongTranscripts] No connectionId found. Skipping."
    );
    return [];
  }

  const gongAccessToken = await getAccessTokenFromNango(
    "gong-dev",
    transcriptsConfiguration.connectionId
  );

  const newTranscripts = await fetch(
    `https://api.gong.io/v2/calls?fromDateTime=${fromDateTime}`,
    {
      headers: {
        Authorization: `Bearer ${gongAccessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

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

    const history = await transcriptsConfiguration.fetchHistoryForFileId(
      fileId
    );
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

export async function retrieveGongTranscriptContent(
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  fileId: string,
  localLogger: Logger
): Promise<{ transcriptTitle: string; transcriptContent: string }> {
  const gongAccessToken = await getAccessTokenFromNango(
    "gong-dev",
    transcriptsConfiguration.connectionId
  );

  const transcript = await fetch(`https://api.gong.io/v2/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gongAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      callIds: [fileId],
    }),
  });

  if (!transcript.ok) {
    localLogger.error(
      {},
      "[processTranscriptActivity] Error fetching transcript from Gong. Skipping."
    );
    //console log the error message
    console.log(transcript);
    throw new Error("Error fetching transcript from Gong. Skipping.");
  }

  const transcriptData = await transcript.json();

  if (!transcriptData || transcriptData.length === 0) {
    localLogger.info(
      {},
      "[processTranscriptActivity] No transcript content found from Gong."
    );
    return { transcriptTitle: "", transcriptContent: "" };
  }

  const transcriptTitle = transcriptData.call.title || "Untitled";
  const transcriptContent = transcriptData.call.transcript;

  return { transcriptTitle, transcriptContent };
}
