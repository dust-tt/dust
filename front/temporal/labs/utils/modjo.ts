import { either } from "fp-ts";
import { pipe } from "fp-ts/function";
import * as t from "io-ts";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";
import { isModjoCredentials, OAuthAPI } from "@app/types";

const ModjoSpeakerSchema = t.partial({
  contactId: t.union([t.number, t.undefined]),
  userId: t.union([t.number, t.undefined]),
  email: t.union([t.string, t.null, t.undefined]),
  name: t.string,
  phoneNumber: t.union([t.string, t.null, t.undefined]),
  speakerId: t.number,
  type: t.string,
});

const ModjoTopicSchema = t.partial({
  topicId: t.number,
  name: t.string,
});

const ModjoTranscriptEntrySchema = t.partial({
  startTime: t.number,
  endTime: t.number,
  speakerId: t.number,
  content: t.string,
  topics: t.array(ModjoTopicSchema),
});

const ModjoTagSchema = t.partial({
  name: t.string,
});

const ModjoRecordingSchema = t.partial({
  url: t.string,
});

const ModjoHighlightSchema = t.union([
  t.partial({
    content: t.string,
  }),
  t.null,
  t.undefined,
]);

const ModjoRelationsSchema = t.partial({
  recording: ModjoRecordingSchema,
  highlights: ModjoHighlightSchema,
  speakers: t.array(ModjoSpeakerSchema),
  transcript: t.array(ModjoTranscriptEntrySchema),
  tags: t.array(ModjoTagSchema),
});

const ModjoCallSchema = t.partial({
  callId: t.number,
  title: t.string,
  startDate: t.string,
  duration: t.number,
  provider: t.string,
  language: t.union([t.string, t.null, t.undefined]),
  callCrmId: t.union([t.string, t.null, t.undefined]),
  relations: ModjoRelationsSchema,
});

const ModjoPaginationSchema = t.partial({
  totalValues: t.number,
  lastPage: t.number,
});

const ModjoApiResponseSchema = t.intersection([
  t.type({
    values: t.array(ModjoCallSchema),
  }),
  t.partial({
    pagination: ModjoPaginationSchema,
  }),
]);

type ModjoApiResponseType = t.TypeOf<typeof ModjoApiResponseSchema>;

function validateModjoResponse(
  data: unknown
): either.Either<Error, ModjoApiResponseType> {
  return pipe(
    ModjoApiResponseSchema.decode(data),
    either.mapLeft((errors) => {
      // Format validation errors in a more readable way
      const formattedErrors = errors.map((error) => {
        const path = error.context.map((c) => c.key).join(".");
        const expectedType = error.context[error.context.length - 1].type.name;
        const value = JSON.stringify(error.value);
        return `Path '${path}': Expected ${expectedType}, got ${value}`;
      });
      return new Error(`Validation errors:\n${formattedErrors.join("\n")}`);
    })
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

  if (!transcriptsConfiguration.credentialId) {
    localLogger.error(
      {},
      "[retrieveModjoTranscripts] No API key found for default configuration. Skipping."
    );
    return [];
  }

  const workspace = auth.getNonNullableWorkspace();
  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const modjoApiKeyRes = await oauthApi.getCredentials({
    credentialsId: transcriptsConfiguration.credentialId,
  });

  if (modjoApiKeyRes.isErr()) {
    localLogger.error(
      { error: modjoApiKeyRes.error },
      "[retrieveModjoTranscripts] Error fetching API key from Modjo. Skipping."
    );
    return [];
  }

  if (!isModjoCredentials(modjoApiKeyRes.value.credential.content)) {
    throw new Error("Invalid credentials type - expected modjo credentials");
  }

  const modjoApiKey = modjoApiKeyRes.value.credential.content.api_key;

  const flags = await getFeatureFlags(workspace);
  const daysOfHistory = flags.includes("labs_transcripts_full_storage")
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
          {
            status: response.status,
            body: await response.text(),
          },
          "[retrieveModjoTranscripts] Error fetching new transcripts from Modjo. Stopping."
        );
        return fileIdsToProcess;
      }

      const rawData = await response.json();
      const validatedDataResult = validateModjoResponse(rawData);

      if (either.isLeft(validatedDataResult)) {
        localLogger.error(
          { error: validatedDataResult.left },
          "[retrieveModjoTranscripts] Invalid response data from Modjo"
        );
        return fileIdsToProcess;
      }

      const validatedData = validatedDataResult.right;

      if (!validatedData.values || validatedData.values.length === 0) {
        localLogger.info(
          {
            page,
            totalProcessed: fileIdsToProcess.length,
          },
          "[retrieveModjoTranscripts] No new transcripts found from Modjo."
        );
        break;
      }

      // Process current page
      for (const call of validatedData.values) {
        const fileId = call.callId?.toString();
        if (!fileId) {
          localLogger.info(
            {
              page,
              totalProcessed: fileIdsToProcess.length,
            },
            "[retrieveModjoTranscripts] call has no ID. Skipping."
          );
          continue;
        }
        const history =
          await transcriptsConfiguration.fetchHistoryForFileId(fileId);

        if (history) {
          localLogger.info(
            { fileId },
            "[retrieveModjoTranscripts] call already processed. Skipping."
          );
          continue;
        }

        fileIdsToProcess.push(fileId);
      }

      localLogger.info(
        { page, totalProcessed: fileIdsToProcess.length },
        "[retrieveModjoTranscripts] Processed page of Modjo transcripts"
      );

      if (
        !validatedData.pagination?.lastPage ||
        page >= validatedData.pagination.lastPage
      ) {
        hasMorePages = false;
      } else {
        page++;
      }
    } catch (error) {
      localLogger.error(
        { error },
        "[retrieveModjoTranscripts] Error processing Modjo transcripts page"
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
  if (!transcriptsConfiguration || !transcriptsConfiguration.credentialId) {
    throw new Error(
      "[retrieveModjoTranscripts]No credentialId for modjo transcriptsConfiguration found. Skipping."
    );
  }

  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const modjoApiKeyRes = await oauthApi.getCredentials({
    credentialsId: transcriptsConfiguration.credentialId,
  });

  if (modjoApiKeyRes.isErr()) {
    throw new Error(
      "[retrieveModjoTranscripts] Error fetching API key from Modjo. Skipping."
    );
  }

  if (!isModjoCredentials(modjoApiKeyRes.value.credential.content)) {
    throw new Error(
      "[retrieveModjoTranscripts] Invalid credentials type - expected modjo credentials"
    );
  }

  const modjoApiKey = modjoApiKeyRes.value.credential.content.api_key;

  const findModjoUser = async () => {
    const user = await transcriptsConfiguration.getUser();
    if (!user) {
      localLogger.error(
        {},
        "[retrieveModjoTranscripts] User not found. Skipping."
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
  const userParticipated =
    callData.relations?.speakers?.some(
      (speaker) => speaker.email === user?.email
    ) ?? false;

  localLogger.info(
    {
      userParticipated,
      user,
      speakers: callData.relations?.speakers,
    },
    "[retrieveModjoTranscripts] User participated in the call?"
  );

  const duration = callData.duration ?? 0;
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const callDuration = `${hours} hours ${
    minutes < 10 ? "0" + minutes : minutes
  } minutes`;

  const transcriptTitle = callData.title || "Untitled";
  let transcriptContent = `Meeting title: ${
    transcriptTitle || "Untitled"
  }\n\nDate: ${callData.startDate || "Unknown"}\n\nDuration: ${callDuration}\n\n`;

  // Add speakers section
  transcriptContent += "Speakers:\n";
  callData.relations?.speakers?.forEach((speaker) => {
    transcriptContent += `${speaker.name || "Unknown"} (${speaker.type || "Unknown"})\n`;
  });
  transcriptContent += "\n";

  // Add transcript content
  callData.relations?.transcript?.forEach((entry) => {
    const speaker = callData.relations?.speakers?.find(
      (s) => s.speakerId === entry.speakerId
    );
    const speakerName = speaker ? speaker.name : `Speaker ${entry.speakerId}`;
    transcriptContent += `${speakerName}: ${entry.content || ""}\n`;
  });

  return { transcriptTitle, transcriptContent, userParticipated };
}
