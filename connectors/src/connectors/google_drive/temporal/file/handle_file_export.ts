import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  getGoogleDrivePayloadSizeBytes,
  runWithGoogleDriveContentPhaseMemoryTelemetry,
} from "@connectors/connectors/google_drive/temporal/file/content_memory_telemetry";
import {
  getDriveClient,
  getInternalId,
  isFileTooLargeToDownloadError,
} from "@connectors/connectors/google_drive/temporal/utils";
import {
  handleCsvFile,
  handleTextExtraction,
  handleTextFile,
} from "@connectors/connectors/shared/file";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  MAX_FILE_SIZE_TO_DOWNLOAD,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
} from "@connectors/lib/data_sources";
import type { Logger } from "@connectors/logger/logger";
import type {
  DataSourceConfig,
  GoogleDriveObjectType,
  ModelId,
} from "@connectors/types";
import { Ok } from "@dust-tt/client";
import type { OAuth2Client } from "googleapis-common";
import { GaxiosError } from "googleapis-common";

export async function handleFileExport(
  oauth2client: OAuth2Client,
  documentId: string,
  file: GoogleDriveObjectType,
  maxDocumentLen: number,
  localLogger: Logger,
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  startSyncTs: number
): Promise<{
  content: CoreAPIDataSourceDocumentSection | null;
  payloadSizeBytes: number | null;
}> {
  const drive = await getDriveClient(oauth2client);
  let res;
  try {
    res = await runWithGoogleDriveContentPhaseMemoryTelemetry({
      logger: localLogger,
      mimeType: file.mimeType,
      phase: "download_export",
      getPayloadSizeBytes: (response) =>
        getGoogleDrivePayloadSizeBytes(response.data),
      task: () =>
        drive.files.get(
          {
            fileId: file.id,
            alt: "media",
          },
          {
            responseType: "arraybuffer",
            // Google-native files report no size in their metadata, so the pre-download guard cannot
            // catch them. Cap the download itself so a huge file is aborted mid-stream instead of being
            // fully buffered in memory (a source of OOMs).
            maxContentLength: MAX_FILE_SIZE_TO_DOWNLOAD,
          }
        ),
    });
  } catch (e) {
    if (e instanceof GaxiosError) {
      if (e.response?.status === 404) {
        localLogger.info(
          {
            error: e,
          },
          "Can't export Gdrive file. 404 error returned. Skipping."
        );
        return { content: null, payloadSizeBytes: null };
      }
      if (e.response?.status === 403) {
        const skippableReasons = ["cannotDownloadAbusiveFile"];
        try {
          const parsedBody =
            typeof e.response.data === "string"
              ? JSON.parse(e.response.data)
              : e.response.data;
          const errors: { reason: string }[] | undefined =
            parsedBody.error?.errors;
          const firstSkippableReason = errors?.find((error) =>
            skippableReasons.includes(error.reason)
          )?.reason;
          if (firstSkippableReason) {
            localLogger.info(
              { error: parsedBody.error },
              `Can't export Gdrive file. Skippable reason: ${firstSkippableReason} Skipping.`
            );
            return { content: null, payloadSizeBytes: null };
          }
        } catch (e) {
          localLogger.error({ error: e }, "Error while parsing error response");
        }
      }
    }

    if (isFileTooLargeToDownloadError(e)) {
      localLogger.info({}, "File too big to be downloaded. Skipping");
      return { content: null, payloadSizeBytes: null };
    }
    throw e;
  }

  if (res.status !== 200) {
    throw new Error(
      `Error downloading Google document. status_code: ${res.status}. status_text: ${res.statusText}`
    );
  }

  if (!(res.data instanceof ArrayBuffer)) {
    localLogger.error({}, "res.data is not an ArrayBuffer");
    return { content: null, payloadSizeBytes: null };
  }
  const payload = res.data;
  const payloadSizeBytes = payload.byteLength;
  const result = await runWithGoogleDriveContentPhaseMemoryTelemetry({
    logger: localLogger,
    mimeType: file.mimeType,
    phase: "extraction",
    getPayloadSizeBytes: () => payloadSizeBytes,
    task: async () => {
      if (file.mimeType === "text/plain") {
        return handleTextFile(payload, maxDocumentLen);
      } else if (file.mimeType === "text/csv") {
        const parentGoogleIds = await getFileParentsMemoized(
          connectorId,
          oauth2client,
          file,
          startSyncTs
        );

        const parents = parentGoogleIds.map((parent) => getInternalId(parent));

        return handleCsvFile({
          data: payload,
          tableId: documentId,
          fileName: file.name || "",
          maxDocumentLen,
          localLogger,
          dataSourceConfig,
          provider: "google_drive",
          connectorId,
          parents,
          tags: file.labels,
        });
      } else if (file.mimeType === "text/markdown") {
        const textContent = handleTextFile(payload, maxDocumentLen);
        if (textContent.isErr()) {
          return textContent;
        }

        return new Ok(
          await renderDocumentTitleAndContent({
            dataSourceConfig,
            title: file.name || "",
            createdAt: new Date(file.createdAtMs),
            content: await renderMarkdownSection(
              dataSourceConfig,
              textContent.value.content || ""
            ),
            ...(file.updatedAtMs
              ? { updatedAt: new Date(file.updatedAtMs) }
              : {}),
          })
        );
      } else {
        return handleTextExtraction(payload, localLogger, file.mimeType);
      }
    },
  });
  if (result.isErr()) {
    localLogger.error({ error: result.error }, "Could not handle file.");
    return { content: null, payloadSizeBytes };
  }

  return { content: result.value, payloadSizeBytes };
}
