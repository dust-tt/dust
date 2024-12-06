import { decrypt } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";

export async function retrieveModjoTranscripts(
  auth: Authenticator,
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  localLogger: Logger
): Promise<string[]> {
  if (!transcriptsConfiguration) {
    localLogger.error(
      {},
      "[retrieveModjoTranscripts] No default transcripts configuration found."
    );
    return [];
  }

  if (!transcriptsConfiguration.apiKey) {
    localLogger.error(
      {},
      "[retrieveModjoTranscripts] No API key found for default configuration. Skipping."
    );
    return [];
  }

  const workspace = auth.getNonNullableWorkspace();
  const modjoApiKey = decrypt(transcriptsConfiguration.apiKey, workspace.sId);

  // TEMP: Get the last 2 weeks if labs_transcripts_modjo_full_storage FF is enabled.
  const flags = await getFeatureFlags(workspace);
  const daysOfHistory = flags.includes("labs_transcripts_modjo_full_storage")
    ? 14
    : 1;

  const fromDateTime = new Date(
    Date.now() - daysOfHistory * 24 * 60 * 60 * 1000
  ).toISOString();

  const fileIdsToProcess = [];
  let page = 1;
  const perPage = 50;

  do {
    try {
      const newTranscripts = await fetch(
        "https://api.modjo.ai/v1/calls/exports",
        {
          method: "POST",
          headers: {
            "X-API-KEY": modjoApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pagination: { page, perPage },
            filters: {
              callStartDateRange: {
                start: fromDateTime,
                end: new Date().toISOString(),
              },
            },
            relations: {
              recording: true,
              highlights: true,
              transcript: true,
              speakers: true,
              tags: true,
            },
          }),
        }
      );

      if (!newTranscripts.ok) {
        localLogger.error(
          { status: newTranscripts.status },
          "[retrieveNewTranscripts] Error fetching new transcripts from Modjo. Stopping."
        );
        return fileIdsToProcess;
      }

      const newTranscriptsData = await newTranscripts.json();

      if (
        !newTranscriptsData?.values ||
        newTranscriptsData.values.length === 0
      ) {
        localLogger.info(
          {},
          "[retrieveNewTranscripts] No new transcripts found from Modjo."
        );
        break;
      }

      // Process current page
      for (const call of newTranscriptsData.values) {
        const fileId = call.callId.toString();
        if (!fileId) {
          localLogger.warn(
            {},
            "[retrieveNewTranscripts] Modjo call does not have an id. Skipping."
          );
          continue;
        }

        const history =
          await transcriptsConfiguration.fetchHistoryForFileId(fileId);
        if (history) {
          localLogger.info(
            { fileId },
            "[retrieveNewTranscripts] call already processed. Skipping."
          );
          continue;
        }

        fileIdsToProcess.push(fileId);
      }

      localLogger.info(
        { page, totalProcessed: fileIdsToProcess.length },
        "[retrieveNewTranscripts] Processed page of Modjo transcripts"
      );

      // Check if we've reached the last page
      if (page >= newTranscriptsData.pagination.lastPage) {
        break;
      }
      page++;
    } catch (error) {
      localLogger.error(
        { error },
        "[retrieveNewTranscripts] Error processing Modjo transcripts page"
      );
      break;
    }
  } while (true);

  return fileIdsToProcess;
}

export async function retrieveModjoTranscriptContent(
  auth: Authenticator,
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  fileId: string,
  localLogger: Logger
): Promise<{
  transcriptTitle: string;
  transcriptContent: string;
  userParticipated: boolean;
} | null> {
  if (!transcriptsConfiguration || !transcriptsConfiguration.apiKey) {
    localLogger.error(
      {
        fileId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
      },
      "[processTranscriptActivity] No API key found. Skipping."
    );
    throw new Error("No API key for transcriptsConfiguration found. Skipping.");
  }

  const workspace = auth.getNonNullableWorkspace();
  const modjoApiKey = decrypt(transcriptsConfiguration.apiKey, workspace.sId);

  const findModjoUser = async () => {
    const user = await transcriptsConfiguration.getUser();
    if (!user) {
      localLogger.error(
        {},
        "[processTranscriptActivity] User not found. Skipping."
      );
      return null;
    }
    return user;
  };

  const call = await fetch("https://api.modjo.ai/v1/calls/exports", {
    method: "POST",
    headers: {
      "X-API-KEY": modjoApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pagination: { page: 1, perPage: 1 },
      filters: {
        callIds: [parseInt(fileId)],
      },
      relations: {
        recording: true,
        highlights: true,
        transcript: true,
        speakers: true,
        tags: true,
      },
    }),
  });

  if (!call.ok) {
    localLogger.error(
      {
        fileId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
      },
      "[processTranscriptActivity] Error fetching call from Modjo. Skipping."
    );
    throw new Error("Error fetching call from Modjo. Skipping.");
  }

  const callData = (await call.json()).values[0];

  if (!callData) {
    localLogger.error(
      {
        fileId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
      },
      "[processTranscriptActivity] Call data not found from Modjo. Skipping."
    );
    return null;
  }

  const user = await findModjoUser();
  const userParticipated = callData.relations.speakers.some(
    (speaker) => speaker.email === user?.email
  );

  const hours = Math.floor(callData.duration / 3600);
  const minutes = Math.floor((callData.duration % 3600) / 60);
  const callDuration = `${hours} hours ${
    minutes < 10 ? "0" + minutes : minutes
  } minutes`;

  const transcriptTitle = callData.title || "Untitled";
  let transcriptContent = `Meeting title: ${
    transcriptTitle || "Untitled"
  }\n\nDate: ${callData.startDate}\n\nDuration: ${callDuration}\n\n`;

  // Add speakers section
  transcriptContent += "Speakers:\n";
  callData.relations.speakers.forEach((speaker: { name: any; type: any }) => {
    transcriptContent += `${speaker.name} (${speaker.type})\n`;
  });
  transcriptContent += "\n";

  // Add transcript content
  callData.relations.transcript.forEach(
    (entry: { speakerId: any; content: any }) => {
      const speaker = callData.relations.speakers.find(
        (s: { speakerId: any }) => s.speakerId === entry.speakerId
      );
      const speakerName = speaker ? speaker.name : `Speaker ${entry.speakerId}`;
      transcriptContent += `${speakerName}: ${entry.content}\n`;
    }
  );

  return { transcriptTitle, transcriptContent, userParticipated };
}
