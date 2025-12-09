import { Ok } from "@dust-tt/client";
import type { OAuth2Client } from "googleapis-common";
import { GaxiosError } from "googleapis-common";

import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  getDriveClient,
  getInternalId,
} from "@connectors/connectors/google_drive/temporal/utils";
import {
  handleCsvFile,
  handleTextExtraction,
  handleTextFile,
} from "@connectors/connectors/shared/file";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  renderDocumentTitleAndContent,
  renderMarkdownSection,
} from "@connectors/lib/data_sources";
import type { Logger } from "@connectors/logger/logger";
import type {
  DataSourceConfig,
  GoogleDriveObjectType,
  ModelId,
} from "@connectors/types";

export async function handleFileExport(
  oauth2client: OAuth2Client,
  documentId: string,
  file: GoogleDriveObjectType,
  maxDocumentLen: number,
  localLogger: Logger,
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  startSyncTs: number
): Promise<CoreAPIDataSourceDocumentSection | null> {
  const drive = await getDriveClient(oauth2client);
  let res;
  try {
    res = await drive.files.get(
      {
        fileId: file.id,
        alt: "media",
      },
      {
        responseType: "arraybuffer",
      }
    );
  } catch (e) {
    if (e instanceof GaxiosError) {
      if (e.response?.status === 404) {
        localLogger.info(
          {
            error: e,
          },
          "Can't export Gdrive file. 404 error returned. Skipping."
        );
        return null;
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
            return null;
          }
        } catch (e) {
          localLogger.error({ error: e }, "Error while parsing error response");
        }
      }
    }

    const maybeErrorWithCode = e as { code: string };
    if (maybeErrorWithCode.code === "ERR_OUT_OF_RANGE") {
      localLogger.info({}, "File too big to be downloaded. Skipping");
      return null;
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
    return null;
  }
  let result;
  if (file.mimeType === "text/plain") {
    result = handleTextFile(res.data, maxDocumentLen);
  } else if (file.mimeType === "text/csv") {
    const parentGoogleIds = await getFileParentsMemoized(
      connectorId,
      oauth2client,
      file,
      startSyncTs
    );

    const parents = parentGoogleIds.map((parent) => getInternalId(parent));

    result = await handleCsvFile({
      data: res.data,
      tableId: documentId,
      fileName: file.name || "",
      maxDocumentLen,
      localLogger,
      dataSourceConfig,
      provider: "google_drive",
      connectorId,
      parents,
      tags: file.labels,
      allowEmptySchema: true, // CSV files can be empty or with just one line, so we allow empty schemas
    });
  } else if (file.mimeType === "text/markdown") {
    const textContent = handleTextFile(res.data, maxDocumentLen);
    if (textContent.isErr()) {
      result = textContent;
    } else {
      result = new Ok(
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
    }
  } else {
    result = await handleTextExtraction(res.data, localLogger, file.mimeType);
  }
  if (result.isErr()) {
    localLogger.error({ error: result.error }, "Could not handle file.");
    return null;
  }

  return result.value;
}
