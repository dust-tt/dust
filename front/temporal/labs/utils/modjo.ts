import { decrypt } from "@dust-tt/types";
import { either } from "fp-ts";
import { pipe } from "fp-ts/function";
import * as t from "io-ts";

import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";

const ModjoSpeaker = t.type({
  contactId: t.union([t.number, t.undefined]),
  userId: t.union([t.number, t.undefined]),
  email: t.union([t.string, t.null]),
  name: t.string,
  phoneNumber: t.union([t.string, t.null, t.undefined]),
  speakerId: t.number,
  type: t.string,
});

const ModjoTopic = t.type({
  topicId: t.number,
  name: t.string,
});

const ModjoTranscriptEntry = t.type({
  startTime: t.number,
  endTime: t.number,
  speakerId: t.number,
  content: t.string,
  topics: t.array(ModjoTopic),
});

const ModjoTag = t.type({
  name: t.string,
});

const ModjoRecording = t.type({
  url: t.string,
});

const ModjoHighlight = t.union([
  t.type({
    content: t.string,
  }),
  t.null,
]);

const ModjoRelations = t.type({
  recording: ModjoRecording,
  highlights: ModjoHighlight,
  speakers: t.array(ModjoSpeaker),
  transcript: t.array(ModjoTranscriptEntry),
  tags: t.array(ModjoTag),
});

const ModjoCall = t.type({
  callId: t.number,
  title: t.string,
  startDate: t.string,
  duration: t.number,
  provider: t.string,
  language: t.string,
  callCrmId: t.union([t.string, t.null]),
  relations: ModjoRelations,
});

const ModjoPagination = t.type({
  totalValues: t.number,
  lastPage: t.number,
});

const ModjoApiResponse = t.type({
  pagination: ModjoPagination,
  values: t.array(ModjoCall),
});

type ModjoApiResponseType = t.TypeOf<typeof ModjoApiResponse>;

function validateModjoResponse(
  data: unknown
): either.Either<Error, ModjoApiResponseType> {
  return pipe(
    ModjoApiResponse.decode(data),
    either.mapLeft(
      (errors) => new Error(`Invalid API response: ${JSON.stringify(errors)}`)
    )
  );
}

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

  const flags = await getFeatureFlags(workspace);
  const daysOfHistory = flags.includes("labs_transcripts_gong_full_storage")
    ? 14
    : 1;

  const fromDateTime = new Date(
    Date.now() - daysOfHistory * 24 * 60 * 60 * 1000
  ).toISOString();

  const fileIdsToProcess: string[] = [];
  let page = 1;
  const perPage = 50;

  let hasMorePages = true;
  while (hasMorePages) {
    try {
      const response = await fetch("https://api.modjo.ai/v1/calls/exports", {
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
      });

      if (!response.ok) {
        localLogger.error(
          { status: response.status },
          "[retrieveNewTranscripts] Error fetching new transcripts from Modjo. Stopping."
        );
        return fileIdsToProcess;
      }

      const rawData = await response.json();
      const validatedDataResult = validateModjoResponse(rawData);

      if (either.isLeft(validatedDataResult)) {
        localLogger.error(
          { error: validatedDataResult.left },
          "[retrieveNewTranscripts] Invalid response data from Modjo"
        );
        return fileIdsToProcess;
      }

      const validatedData = validatedDataResult.right;

      if (!validatedData.values || validatedData.values.length === 0) {
        localLogger.info(
          {},
          "[retrieveNewTranscripts] No new transcripts found from Modjo."
        );
        break;
      }

      // Process current page
      for (const call of validatedData.values) {
        const fileId = call.callId.toString();
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

      if (page >= validatedData.pagination.lastPage) {
        hasMorePages = false;
      } else {
        page++;
      }
    } catch (error) {
      localLogger.error(
        { error },
        "[retrieveNewTranscripts] Error processing Modjo transcripts page"
      );
      break;
    }
  }

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

  const response = await fetch("https://api.modjo.ai/v1/calls/exports", {
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

  if (!response.ok) {
    localLogger.error(
      {
        fileId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
      },
      "[processTranscriptActivity] Error fetching call from Modjo. Skipping."
    );
    throw new Error("Error fetching call from Modjo. Skipping.");
  }

  const rawData = await response.json();
  const validatedDataResult = validateModjoResponse(rawData);

  if (either.isLeft(validatedDataResult)) {
    localLogger.error(
      { error: validatedDataResult.left },
      "[processTranscriptActivity] Invalid response data from Modjo"
    );
    return null;
  }

  const callData = validatedDataResult.right.values[0];

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
  callData.relations.speakers.forEach((speaker) => {
    transcriptContent += `${speaker.name} (${speaker.type})\n`;
  });
  transcriptContent += "\n";

  // Add transcript content
  callData.relations.transcript.forEach((entry) => {
    const speaker = callData.relations.speakers.find(
      (s) => s.speakerId === entry.speakerId
    );
    const speakerName = speaker ? speaker.name : `Speaker ${entry.speakerId}`;
    transcriptContent += `${speakerName}: ${entry.content}\n`;
  });

  return { transcriptTitle, transcriptContent, userParticipated };
}
