import { either } from "fp-ts";
import { pipe } from "fp-ts/function";
import * as t from "io-ts";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";
import { isModjoCredentials, OAuthAPI } from "@app/types";

/**
 * Error thrown when Modjo API returns a 401 Unauthorized response,
 * indicating the API key is invalid or the tenant is deactivated.
 */
export class ModjoAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModjoAuthenticationError";
  }
}

const ModjoSpeakerSchema = t.partial({
  contactId: t.union([t.number, t.undefined]),
  userId: t.union([t.number, t.undefined]),
  email: t.union([t.string, t.null, t.undefined]),
  name: t.string,
  phoneNumber: t.union([t.string, t.null, t.undefined]),
  speakerId: t.number,
  type: t.string,
});

const ModjoContactSchema = t.partial({
  contactId: t.number,
  firstName: t.union([t.string, t.null, t.undefined]),
  lastName: t.union([t.string, t.null, t.undefined]),
  email: t.union([t.string, t.null, t.undefined]),
  phoneNumber: t.union([t.string, t.null, t.undefined]),
  company: t.union([t.string, t.null, t.undefined]),
  position: t.union([t.string, t.null, t.undefined]),
  accountId: t.union([t.number, t.null, t.undefined]),
});

const ModjoAccountSchema = t.partial({
  accountId: t.number,
  name: t.union([t.string, t.null, t.undefined]),
  domain: t.union([t.string, t.null, t.undefined]),
  industry: t.union([t.string, t.null, t.undefined]),
  size: t.union([t.string, t.null, t.undefined]),
  revenue: t.union([t.string, t.null, t.undefined]),
  description: t.union([t.string, t.null, t.undefined]),
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

const ModjoDealSchema = t.partial({
  dealId: t.number,
  name: t.union([t.string, t.null, t.undefined]),
  stage: t.union([t.string, t.null, t.undefined]),
  amount: t.union([t.number, t.null, t.undefined]),
  currency: t.union([t.string, t.null, t.undefined]),
  closeDate: t.union([t.string, t.null, t.undefined]),
  probability: t.union([t.number, t.null, t.undefined]),
  status: t.union([t.string, t.null, t.undefined]),
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
  recording: t.union([ModjoRecordingSchema, t.null]),
  highlights: ModjoHighlightSchema,
  speakers: t.union([t.array(ModjoSpeakerSchema), t.null]),
  transcript: t.union([t.array(ModjoTranscriptEntrySchema), t.null]),
  tags: t.union([t.array(ModjoTagSchema), t.null]),
  contacts: t.union([t.array(ModjoContactSchema), t.null]),
  account: t.union([ModjoAccountSchema, t.null]),
  deal: t.union([ModjoDealSchema, t.null]),
});

const ModjoCallSchema = t.partial({
  callId: t.number,
  title: t.union([t.string, t.null]),
  startDate: t.string,
  duration: t.number,
  provider: t.string,
  language: t.union([t.string, t.null, t.undefined]),
  callCrmId: t.union([t.string, t.null, t.undefined]),
  relations: t.union([ModjoRelationsSchema, t.null]),
});

const ModjoPaginationSchema = t.partial({
  page: t.number,
  perPage: t.number,
  nextPage: t.number,
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

// Buffer configuration for handling long calls
// Using a sliding window approach with overlap to ensure we don't miss any calls
const CALL_BUFFER_HOURS = 6; // Increased buffer for very long calls (meetings can be 4+ hours)
const MIN_LOOKBACK_HOURS = 24; // Minimum lookback even if last sync was recent
const MODJO_API_URL = "https://api.modjo.ai";

// Batch configuration to avoid activity timeouts
// Process 50 pages per activity call (50 * 15 = 750 calls max per batch)
// This ensures the activity completes well within the 20-minute timeout
const MAX_PAGES_PER_BATCH = 50;
const MODJO_PAGE_SIZE = 15;

export interface ModjoTranscriptsResult {
  fileIds: string[];
  nextCursor: number | null;
  isFirstSync: boolean;
}

export async function retrieveModjoTranscripts(
  auth: Authenticator,
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  localLogger: Logger,
  cursor: number | null = null,
  isFirstSyncOverride: boolean | null = null
): Promise<ModjoTranscriptsResult> {
  if (!transcriptsConfiguration) {
    localLogger.error(
      {},
      "[retrieveModjoTranscripts] No default transcripts configuration found."
    );
    return { fileIds: [], nextCursor: null, isFirstSync: false };
  }

  if (!transcriptsConfiguration.credentialId) {
    localLogger.error(
      {},
      "[retrieveModjoTranscripts] No API key found for default configuration. Skipping."
    );
    return { fileIds: [], nextCursor: null, isFirstSync: false };
  }
  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

  const modjoApiKeyRes = await oauthApi.getCredentials({
    credentialsId: transcriptsConfiguration.credentialId,
  });

  if (modjoApiKeyRes.isErr()) {
    localLogger.error(
      { error: modjoApiKeyRes.error },
      "[retrieveModjoTranscripts] Error fetching API key from Modjo. Skipping."
    );
    return { fileIds: [], nextCursor: null, isFirstSync: false };
  }

  if (!isModjoCredentials(modjoApiKeyRes.value.credential.content)) {
    throw new Error("Invalid credentials type - expected modjo credentials");
  }

  const modjoApiKey = modjoApiKeyRes.value.credential.content.api_key;

  // Determine if this is a first sync (full historical sync) or incremental sync
  // If isFirstSyncOverride is provided, use it (preserves state across continueAsNew)
  // Otherwise, auto-detect based on whether any history exists
  let isFirstSync: boolean;
  if (isFirstSyncOverride !== null) {
    isFirstSync = isFirstSyncOverride;
    localLogger.info(
      { isFirstSync, isFirstSyncOverride },
      "[retrieveModjoTranscripts] Using explicit isFirstSync from workflow"
    );
  } else {
    const hasAnyHistory = await transcriptsConfiguration.hasAnyHistory();
    isFirstSync = !hasAnyHistory;
  }

  let fromDateTime: string;
  if (isFirstSync) {
    // First sync: no date restriction to pull all historical transcripts
    fromDateTime = new Date(0).toISOString(); // Start from epoch to get all history
    localLogger.info(
      { cursor },
      "[retrieveModjoTranscripts] First sync detected - retrieving all historical transcripts"
    );
  } else {
    // Subsequent syncs: get the most recent history date and use it as the starting point
    const mostRecentHistoryDate =
      await transcriptsConfiguration.getMostRecentHistoryDate();
    if (mostRecentHistoryDate) {
      // Calculate lookback time with buffer for long calls
      const bufferMs = CALL_BUFFER_HOURS * 60 * 60 * 1000;
      const minLookbackMs = MIN_LOOKBACK_HOURS * 60 * 60 * 1000;

      // Use the larger of: buffer from last sync OR minimum lookback
      const lookbackFromLastSync = mostRecentHistoryDate.getTime() - bufferMs;
      const minLookbackTime = Date.now() - minLookbackMs;
      const effectiveLookback = Math.min(lookbackFromLastSync, minLookbackTime);

      fromDateTime = new Date(effectiveLookback).toISOString();

      localLogger.info(
        {
          fromDateTime,
          lastSyncDate: mostRecentHistoryDate.toISOString(),
          bufferHours: CALL_BUFFER_HOURS,
          minLookbackHours: MIN_LOOKBACK_HOURS,
          effectiveLookbackHours:
            (Date.now() - effectiveLookback) / (60 * 60 * 1000),
        },
        "[retrieveModjoTranscripts] Subsequent sync - using sliding window approach"
      );
    } else {
      // Fallback to minimum lookback if we can't get the most recent date
      fromDateTime = new Date(
        Date.now() - MIN_LOOKBACK_HOURS * 60 * 60 * 1000
      ).toISOString();
      localLogger.info(
        { lookbackHours: MIN_LOOKBACK_HOURS },
        "[retrieveModjoTranscripts] Fallback sync - couldn't get most recent history date"
      );
    }
  }

  const fileIdsToProcess: string[] = [];
  // Start from cursor if provided, otherwise start from page 1
  let page = cursor ?? 1;
  const perPage = MODJO_PAGE_SIZE;
  let pagesProcessedInBatch = 0;

  // Retry configuration
  const MAX_RETRIES_PER_PAGE = 3;
  const MAX_CONSECUTIVE_FAILURES = 3;
  const INITIAL_RETRY_DELAY_MS = 1000;

  let hasMorePages = true;
  let consecutivePageFailures = 0;
  let nextCursor: number | null = null;

  while (hasMorePages) {
    // Limit pages per batch to avoid activity timeouts
    if (pagesProcessedInBatch >= MAX_PAGES_PER_BATCH) {
      nextCursor = page;
      localLogger.info(
        {
          pagesProcessedInBatch,
          nextCursor,
          fileIdsFoundInBatch: fileIdsToProcess.length,
        },
        "[retrieveModjoTranscripts] Batch limit reached - returning cursor for next batch"
      );
      break;
    }
    let pageSuccess = false;
    let retryCount = 0;

    // Retry loop for individual page
    while (retryCount <= MAX_RETRIES_PER_PAGE && !pageSuccess) {
      try {
        // Add exponential backoff for retries
        if (retryCount > 0) {
          const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
          localLogger.info(
            {
              page,
              retryCount,
              delayMs,
            },
            "[retrieveModjoTranscripts] Retrying page after delay"
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        // eslint-disable-next-line no-restricted-globals
        const response = await fetch(`${MODJO_API_URL}/v1/calls/exports`, {
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
              contacts: true,
              account: true,
              deal: true,
            },
          }),
        });

        if (!response.ok) {
          // Handle authentication errors - don't retry, throw immediately
          if (response.status === 401) {
            const errorBody = await response.text();
            localLogger.error(
              {
                status: response.status,
                body: errorBody,
                page,
              },
              "[retrieveModjoTranscripts] Authentication failed - API key invalid or tenant deactivated"
            );
            throw new ModjoAuthenticationError(
              `Modjo API authentication failed: ${errorBody}`
            );
          }

          // Handle rate limiting specifically
          if (response.status === 429) {
            localLogger.warn(
              {
                page,
                retryCount,
                status: response.status,
              },
              "[retrieveModjoTranscripts] Rate limited by Modjo API"
            );
            retryCount++;
            continue;
          }

          // For other errors, log but still retry
          localLogger.error(
            {
              status: response.status,
              body: await response.text(),
              page,
              retryCount,
            },
            "[retrieveModjoTranscripts] Error fetching page from Modjo"
          );
          retryCount++;
          continue;
        }

        const rawData = await response.json();
        const validatedDataResult = validateModjoResponse(rawData);

        if (either.isLeft(validatedDataResult)) {
          localLogger.error(
            { error: validatedDataResult.left, page, retryCount },
            "[retrieveModjoTranscripts] Invalid response data from Modjo"
          );
          retryCount++;
          continue;
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
          // This is a successful response with no data - not an error
          pageSuccess = true;
          hasMorePages = false;
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
          const history = await transcriptsConfiguration.fetchHistoryForFileId(
            auth,
            fileId
          );

          if (history) {
            localLogger.info(
              { fileId },
              "[retrieveModjoTranscripts] call already processed. Skipping."
            );
            continue;
          }

          fileIdsToProcess.push(fileId);
        }

        const paginationInfo = validatedData.pagination;
        localLogger.info(
          {
            page,
            totalProcessed: fileIdsToProcess.length,
            pageSize: validatedData.values.length,
            totalValues: paginationInfo?.totalValues,
            lastPage: paginationInfo?.lastPage,
            nextPage: paginationInfo?.nextPage,
          },
          "[retrieveModjoTranscripts] Processed page of Modjo transcripts"
        );

        // Mark page as successful
        pageSuccess = true;
        consecutivePageFailures = 0; // Reset consecutive failure counter on success
        pagesProcessedInBatch++;

        if (paginationInfo?.nextPage) {
          page = paginationInfo.nextPage;
        } else {
          hasMorePages = false;
          localLogger.info(
            {
              finalPage: page,
              totalTranscriptsFound: fileIdsToProcess.length,
              totalCallsReviewed: paginationInfo?.totalValues ?? 0,
            },
            "[retrieveModjoTranscripts] Completed pagination - no more pages"
          );
        }
      } catch (error) {
        localLogger.error(
          {
            error,
            page,
            retryCount,
            totalProcessedSoFar: fileIdsToProcess.length,
          },
          "[retrieveModjoTranscripts] Error processing Modjo transcripts page"
        );
        retryCount++;
      }
    }

    // Handle page failure after all retries exhausted
    if (!pageSuccess) {
      consecutivePageFailures++;
      localLogger.error(
        {
          page,
          consecutivePageFailures,
          maxConsecutiveFailures: MAX_CONSECUTIVE_FAILURES,
        },
        "[retrieveModjoTranscripts] Page failed after all retries"
      );

      // Check for global failure condition
      if (consecutivePageFailures >= MAX_CONSECUTIVE_FAILURES) {
        localLogger.error(
          {
            consecutivePageFailures,
            totalProcessedBeforeFailure: fileIdsToProcess.length,
          },
          "[retrieveModjoTranscripts] Too many consecutive page failures - stopping sync"
        );
        break;
      }

      // Without pagination info from a successful response, we can't safely determine the next page
      // We must stop here to avoid skipping pages and missing data
      localLogger.error(
        {
          page,
          consecutiveFailures: consecutivePageFailures,
          totalProcessedSoFar: fileIdsToProcess.length,
        },
        "[retrieveModjoTranscripts] Cannot determine next page after failure - stopping to prevent data loss"
      );
      break;
    }
  }

  localLogger.info(
    {
      totalPages: pagesProcessedInBatch,
      totalTranscriptsToProcess: fileIdsToProcess.length,
      syncType: isFirstSync ? "full" : "incremental",
      nextCursor,
      startedAtPage: cursor ?? 1,
    },
    "[retrieveModjoTranscripts] Batch completed"
  );

  return {
    fileIds: fileIdsToProcess,
    nextCursor,
    isFirstSync,
  };
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
  tags: string[];
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

  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(`${MODJO_API_URL}/v1/calls/exports`, {
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
        contacts: true,
        account: true,
        deal: true,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    localLogger.error(
      {
        fileId,
        transcriptsConfigurationId: transcriptsConfiguration.id,
        transcriptsConfigurationSid: transcriptsConfiguration.sId,
        status: response.status,
        error: errorText,
      },
      "[processTranscriptActivity] Error fetching call from Modjo. Skipping."
    );
    if (response.status === 401) {
      throw new ModjoAuthenticationError(
        `Modjo API authentication failed: ${errorText}`
      );
    }
    if (response.status === 404) {
      return null;
    }
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
        transcriptsConfigurationSid: transcriptsConfiguration.sId,
      },
      "[processTranscriptActivity] Call data not found from Modjo. Skipping."
    );
    return null;
  }

  const user = await findModjoUser();
  const userParticipated =
    callData.relations?.speakers && Array.isArray(callData.relations.speakers)
      ? callData.relations.speakers.some(
          (speaker) => speaker.email === user?.email
        )
      : false;

  localLogger.info(
    {
      userParticipated,
      user,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      speakers: callData.relations?.speakers || [],
    },
    "[retrieveModjoTranscripts] User participated in the call?"
  );

  const duration = callData.duration ?? 0;
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const callDuration = `${hours} hours ${
    minutes < 10 ? "0" + minutes : minutes
  } minutes`;

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const transcriptTitle = callData.title || "Untitled";
  let transcriptContent = `Meeting title: ${
    transcriptTitle || "Untitled"
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  }\n\nDate: ${callData.startDate || "Unknown"}\n\nDuration: ${callDuration}\n\n`;

  // Add speakers section
  if (
    callData.relations?.speakers &&
    Array.isArray(callData.relations.speakers)
  ) {
    transcriptContent += "Speakers:\n";
    callData.relations.speakers.forEach((speaker) => {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      transcriptContent += `${speaker.name || "Unknown"} (${speaker.type || "Unknown"})`;
      if (speaker.email) {
        transcriptContent += ` - ${speaker.email}`;
      }
      if (speaker.phoneNumber) {
        transcriptContent += ` - ${speaker.phoneNumber}`;
      }
      transcriptContent += "\n";
    });
    transcriptContent += "\n";
  }

  // Add contacts section if available
  if (
    callData.relations?.contacts &&
    Array.isArray(callData.relations.contacts) &&
    callData.relations.contacts.length > 0
  ) {
    transcriptContent += "Contacts:\n";
    callData.relations.contacts.forEach((contact) => {
      const fullName = [contact.firstName, contact.lastName]
        .filter(Boolean)
        .join(" ");
      transcriptContent += `${fullName || "Unknown"}`;
      if (contact.position) {
        transcriptContent += ` - ${contact.position}`;
      }
      if (contact.company) {
        transcriptContent += ` at ${contact.company}`;
      }
      if (contact.email) {
        transcriptContent += ` (${contact.email})`;
      }
      if (contact.phoneNumber) {
        transcriptContent += ` - ${contact.phoneNumber}`;
      }
      transcriptContent += "\n";
    });
    transcriptContent += "\n";
  }

  // Add account section if available
  if (callData.relations?.account) {
    transcriptContent += "Account:\n";
    const account = callData.relations.account;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    transcriptContent += `${account.name || "Unknown"}`;
    if (account.domain) {
      transcriptContent += ` (${account.domain})`;
    }
    if (account.industry) {
      transcriptContent += ` - Industry: ${account.industry}`;
    }
    if (account.size) {
      transcriptContent += ` - Size: ${account.size}`;
    }
    if (account.description) {
      transcriptContent += ` - ${account.description}`;
    }
    transcriptContent += "\n\n";
  }

  // Add deal section if available
  if (callData.relations?.deal) {
    transcriptContent += "Deal:\n";
    const deal = callData.relations.deal;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    transcriptContent += `${deal.name || "Unknown"}`;
    if (deal.stage) {
      transcriptContent += ` - Stage: ${deal.stage}`;
    }
    if (deal.amount && deal.currency) {
      transcriptContent += ` - Amount: ${deal.amount} ${deal.currency}`;
    }
    if (deal.closeDate) {
      transcriptContent += ` - Close Date: ${deal.closeDate}`;
    }
    if (deal.probability !== undefined) {
      transcriptContent += ` - Probability: ${deal.probability}%`;
    }
    if (deal.status) {
      transcriptContent += ` - Status: ${deal.status}`;
    }
    transcriptContent += "\n\n";
  }

  // Add tags section if available
  if (
    callData.relations?.tags &&
    Array.isArray(callData.relations.tags) &&
    callData.relations.tags.length > 0
  ) {
    transcriptContent += "Tags: ";
    transcriptContent += callData.relations.tags
      .map((tag) => tag.name)
      .filter(Boolean)
      .join(", ");
    transcriptContent += "\n\n";
  }

  // Add transcript content
  if (
    callData.relations?.transcript &&
    Array.isArray(callData.relations.transcript)
  ) {
    callData.relations.transcript.forEach((entry) => {
      const speaker = Array.isArray(callData.relations?.speakers)
        ? callData.relations.speakers.find(
            (s) => s.speakerId === entry.speakerId
          )
        : null;
      const speakerName = speaker ? speaker.name : `Speaker ${entry.speakerId}`;
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      transcriptContent += `${speakerName}: ${entry.content || ""}\n`;
    });
  }

  // Extract tags from Modjo data
  const tags: string[] = [];

  // Add Modjo tags
  if (
    callData.relations?.tags &&
    Array.isArray(callData.relations.tags) &&
    callData.relations.tags.length > 0
  ) {
    tags.push(
      ...callData.relations.tags
        .map((tag) => tag.name)
        .filter((name): name is string => !!name)
    );
  }

  // Add account name as tag if available
  if (callData.relations?.account?.name) {
    tags.push(`account:${callData.relations.account.name}`);
  }

  // Add deal stage as tag if available
  if (callData.relations?.deal?.stage) {
    tags.push(`deal-stage:${callData.relations.deal.stage}`);
  }

  return { transcriptTitle, transcriptContent, userParticipated, tags };
}

/**
 * Scans Modjo API for all transcripts within a specific date range
 * Returns basic transcript information (callId, title, startDate) without fetching full content
 */
export async function scanModjoTranscriptsInDateRange(
  modjoApiKey: string,
  startDate: Date,
  endDate: Date,
  logger: Logger
): Promise<
  Array<{
    callId: string;
    title: string;
    startDate: string;
  }>
> {
  const localLogger = logger.child({
    function: "scanModjoTranscriptsInDateRange",
  });

  const foundTranscripts: Array<{
    callId: string;
    title: string;
    startDate: string;
  }> = [];

  let page = 1;
  const perPage = 50;
  let hasMorePages = true;

  localLogger.info(
    {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    "Starting to scan Modjo API"
  );

  while (hasMorePages) {
    try {
      // eslint-disable-next-line no-restricted-globals
      const response = await fetch(`${MODJO_API_URL}/v1/calls/exports`, {
        method: "POST",
        headers: {
          "X-API-KEY": modjoApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pagination: { page, perPage },
          filters: {
            callStartDateRange: {
              start: startDate.toISOString(),
              end: endDate.toISOString(),
            },
          },
          relations: {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        localLogger.error(
          {
            status: response.status,
            body: errorText,
          },
          "Error fetching from Modjo API"
        );
        throw new Error(
          `Error fetching from Modjo API: ${response.status} - ${errorText}`
        );
      }

      const rawData = await response.json();
      const validatedDataResult = validateModjoResponse(rawData);

      if (either.isLeft(validatedDataResult)) {
        localLogger.error(
          { error: validatedDataResult.left },
          "Invalid response data from Modjo"
        );
        throw validatedDataResult.left;
      }

      const validatedData = validatedDataResult.right;

      if (!validatedData.values || validatedData.values.length === 0) {
        localLogger.info(
          {
            page,
            totalFound: foundTranscripts.length,
          },
          "No more transcripts found"
        );
        break;
      }

      // Collect transcript metadata from current page
      for (const call of validatedData.values) {
        if (call.callId) {
          foundTranscripts.push({
            callId: call.callId.toString(),
            title: call.title ?? "Untitled",
            startDate: call.startDate ?? "Unknown",
          });
        }
      }

      const pagination = validatedData.pagination;
      localLogger.info(
        {
          page,
          totalFound: foundTranscripts.length,
          pageSize: validatedData.values.length,
          totalValues: pagination?.totalValues,
          lastPage: pagination?.lastPage,
          nextPage: pagination?.nextPage,
        },
        "Processed page of Modjo transcripts"
      );

      // Check if we should continue to next page
      if (pagination?.nextPage && page < (pagination.lastPage ?? 0)) {
        page = pagination.nextPage;
      } else {
        hasMorePages = false;
        localLogger.info(
          {
            finalPage: page,
            totalTranscriptsFound: foundTranscripts.length,
            totalCallsReviewed: pagination?.totalValues ?? 0,
          },
          "Completed pagination"
        );
      }
    } catch (error) {
      localLogger.error(
        {
          error,
          page,
          totalFoundSoFar: foundTranscripts.length,
        },
        "Error processing page - stopping"
      );
      throw error;
    }
  }

  localLogger.info(
    {
      totalTranscripts: foundTranscripts.length,
    },
    "Scan completed successfully"
  );

  return foundTranscripts;
}
