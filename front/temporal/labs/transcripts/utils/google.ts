import type { Authenticator } from "@app/lib/auth";
import { getTranscriptsGoogleAuth } from "@app/lib/labs/transcripts/utils/helpers";
import type { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import type { Logger } from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { drive_v3 } from "googleapis";
import { google } from "googleapis";
import { GaxiosError } from "googleapis-common";

// Google API "reason" codes that indicate a transient rate limit, even when the
// HTTP status is 403 rather than 429.
const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

// HTTP statuses that are safe to retry: explicit rate limiting and transient
// upstream errors.
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

// Node network errnos surfaced by Gaxios when the request never completed.
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
]);

function isObjectWithError(
  data: unknown
): data is { error: { errors: unknown } } {
  return (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "object" &&
    data.error !== null &&
    "errors" in data.error
  );
}

function isErrorWithReason(err: unknown): err is { reason: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "reason" in err &&
    typeof err.reason === "string"
  );
}

function hasRateLimitReason(err: GaxiosError): boolean {
  const data: unknown = err.response?.data;
  if (!isObjectWithError(data)) {
    return false;
  }
  const { errors } = data.error;
  if (!Array.isArray(errors)) {
    return false;
  }
  return errors.some(
    (e) => isErrorWithReason(e) && RATE_LIMIT_REASONS.has(e.reason)
  );
}

// Decides whether an error from the Google Drive API is transient and should be
// retried (true), or permanent and should stop the transcripts schedule
// (false). Transient: rate limits (429 or 403 with a rate-limit reason),
// transient 5xx, and network blips. Everything else (revoked token, lost
// access, unexpected errors) is treated as permanent so we don't retry forever.
export function isRetryableGoogleError(error: unknown): boolean {
  if (!(error instanceof GaxiosError)) {
    return false;
  }

  if (
    typeof error.code === "string" &&
    RETRYABLE_NETWORK_CODES.has(error.code)
  ) {
    return true;
  }

  const status = error.response?.status;
  if (status === undefined) {
    return false;
  }
  if (RETRYABLE_HTTP_STATUSES.has(status)) {
    return true;
  }
  return status === 403 && hasRateLimitReason(error);
}

// Error returned by `retrieveGoogleTranscripts`. `retryable` tells the caller
// whether the failure is transient (retry) or permanent (stop the schedule).
export class RetrieveGoogleTranscriptsError extends Error {
  readonly retryable: boolean;

  constructor(cause: Error, retryable: boolean) {
    super(cause.message);
    this.name = "RetrieveGoogleTranscriptsError";
    this.retryable = retryable;
  }
}

export async function retrieveRecentGoogleTranscripts(
  {
    auth,
    userId,
  }: {
    auth: Authenticator;
    userId: ModelId;
  },
  logger: Logger
) {
  const googleAuth = await getTranscriptsGoogleAuth(auth, userId);

  if (!googleAuth) {
    logger.error(
      {},
      "[retrieveRecentGoogleTranscripts] No Google auth found. Stopping."
    );
    return [];
  }

  // Only pull transcripts from last day.
  // We could do from the last 15 minutes
  // but we want to avoid missing any if the workflow is down or slow.
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 1);

  const files = await google
    .drive({ version: "v3", auth: googleAuth })
    .files.list({
      q:
        "name contains '- Transcript' and createdTime > '" +
        cutoffDate.toISOString() +
        "'",
      fields: "files(id, name)",
    });

  logger.info(
    { files: files.data.files },
    "[retrieveRecentGoogleTranscripts] Retrieved files."
  );

  const { files: filesData } = files.data;
  if (!filesData || filesData.length === 0) {
    logger.info({}, "[retrieveRecentGoogleTranscripts] No new files found.");
    return [];
  }

  return filesData;
}

export async function retrieveGoogleTranscripts(
  auth: Authenticator,
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  localLogger: Logger
): Promise<Result<string[], RetrieveGoogleTranscriptsError>> {
  const fileIdsToProcess: string[] = [];

  let recentTranscriptFiles: drive_v3.Schema$File[] | null = null;

  try {
    recentTranscriptFiles = await retrieveRecentGoogleTranscripts(
      {
        auth,
        userId: transcriptsConfiguration.userId,
      },
      localLogger
    );
  } catch (error) {
    const retryable = isRetryableGoogleError(error);
    localLogger.error(
      { error, retryable, transcriptsConfiguration },
      "[retrieveGoogleTranscripts] Error retrieving recent Google transcripts."
    );
    return new Err(
      new RetrieveGoogleTranscriptsError(normalizeError(error), retryable)
    );
  }

  for (const recentTranscriptFile of recentTranscriptFiles) {
    const { id: fileId } = recentTranscriptFile;
    if (!fileId) {
      localLogger.error(
        {},
        "[retrieveNewTranscripts] File does not have an id. Skipping."
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
        "[retrieveNewTranscripts] File already processed. Skipping."
      );
      continue;
    }

    fileIdsToProcess.push(fileId);
  }
  return new Ok(fileIdsToProcess);
}

export async function retrieveGoogleTranscriptContent(
  auth: Authenticator,
  transcriptsConfiguration: LabsTranscriptsConfigurationResource,
  fileId: string,
  localLogger: Logger
): Promise<{
  transcriptTitle: string;
  transcriptContent: string;
  fileContentIsAccessible: boolean;
}> {
  const googleAuth = await getTranscriptsGoogleAuth(
    auth,
    transcriptsConfiguration.userId
  );
  const drive = google.drive({ version: "v3", auth: googleAuth });

  const metadataRes = await drive.files.get({
    fileId: fileId,
    fields: "name",
  });

  localLogger.info(
    { fileId, metadataRes: metadataRes.data },
    "Retrieved metadata for Google document."
  );

  try {
    const contentRes = await drive.files.export({
      fileId: fileId,
      mimeType: "text/plain",
    });

    if (contentRes.status !== 200) {
      localLogger.error(
        { error: contentRes.statusText },
        "Error exporting Google document."
      );

      throw new Error(
        `Error exporting Google document. status_code: ${contentRes.status}. status_text: ${contentRes.statusText}`
      );
    }
    const fileContentIsAccessible = true;
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const transcriptTitle = metadataRes.data.name || "Untitled";
    const transcriptContent = <string>contentRes.data;

    return { transcriptTitle, transcriptContent, fileContentIsAccessible };
  } catch (error) {
    localLogger.error(
      { fileId, error },
      "Error exporting Google document. Skipping."
    );
    return {
      transcriptTitle: "",
      transcriptContent: "",
      fileContentIsAccessible: false,
    };
  }
}
