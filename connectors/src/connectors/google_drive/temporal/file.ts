import type { CoreAPIDataSourceDocumentSection, ModelId } from "@dust-tt/types";
import { slugify, TextExtraction } from "@dust-tt/types";
import tracer from "dd-trace";
import type { OAuth2Client } from "googleapis-common";
import type { CreationAttributes } from "sequelize";

import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  getMimeTypesToDownload,
  isGoogleDriveSpreadSheetFile,
  MIME_TYPES_TO_EXPORT,
} from "@connectors/connectors/google_drive/temporal/mime_types";
import { syncSpreadSheet } from "@connectors/connectors/google_drive/temporal/spreadsheets";
import {
  getDocumentId,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import { apiConfig } from "@connectors/lib/api/config";
import {
  MAX_FILE_SIZE_TO_DOWNLOAD,
  upsertTableFromCsv,
} from "@connectors/lib/data_sources";
import {
  MAX_DOCUMENT_TXT_LEN,
  MAX_LARGE_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  sectionLength,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import { docx2text } from "@connectors/lib/docx2text.";
import {
  GoogleDriveConfig,
  GoogleDriveFiles,
} from "@connectors/lib/models/google_drive";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";

const pagePrefixesPerMimeType: Record<string, string> = {
  "application/pdf": "$pdfPage",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "$slideNumber",
};

export async function syncOneFile(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  dataSourceConfig: DataSourceConfig,
  file: GoogleDriveObjectType,
  startSyncTs: number,
  isBatchSync = false
): Promise<boolean> {
  return tracer.trace(
    `gdrive`,
    {
      resource: `syncOneFile`,
    },
    async (span) => {
      span?.setTag("connectorId", connectorId);
      span?.setTag("fileId", file.id);
      span?.setTag("workspaceId", dataSourceConfig.workspaceId);

      const config = await GoogleDriveConfig.findOne({
        where: {
          connectorId: connectorId,
        },
      });
      const maxDocumentLen = config?.largeFilesEnabled
        ? MAX_LARGE_DOCUMENT_TXT_LEN
        : MAX_DOCUMENT_TXT_LEN;

      const mimeTypesToDownload = getMimeTypesToDownload({
        pdfEnabled: config?.pdfEnabled || false,
      });

      const documentId = getDocumentId(file.id);
      let documentContent: CoreAPIDataSourceDocumentSection | null = null;

      const fileInDb = await GoogleDriveFiles.findOne({
        where: {
          connectorId: connectorId,
          driveFileId: file.id,
        },
      });

      const localLogger = logger.child({
        provider: "google_drive",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
        connectorId,
        documentId,
        fileId: file.id,
        title: file.name,
        mimeType: file.mimeType,
      });

      // Early return if lastSeenTs is greater than workflow start.
      // This allows avoiding resyncing already-synced documents in case of activity failure
      if (fileInDb?.lastSeenTs && fileInDb.lastSeenTs > new Date(startSyncTs)) {
        return true;
      }

      if (fileInDb?.skipReason) {
        localLogger.info(
          {},
          `Google Drive document skipped with skip reason ${fileInDb.skipReason}`
        );
        return false;
      }
      if (!file.capabilities.canDownload) {
        localLogger.info(
          {},
          "Google Drive document skipped because it cannot be downloaded"
        );
        return false;
      }

      // If the file is too big to be downloaded, we skip it.
      if (file.size && file.size > MAX_FILE_SIZE_TO_DOWNLOAD) {
        localLogger.info(
          "[Google Drive document] file size exceeded, skipping further processing."
        );

        return false;
      }

      let skipReason: string | undefined = undefined;

      if (MIME_TYPES_TO_EXPORT[file.mimeType]) {
        const drive = await getDriveClient(oauth2client);
        try {
          const res = await drive.files.export({
            fileId: file.id,
            mimeType: MIME_TYPES_TO_EXPORT[file.mimeType],
          });
          if (res.status !== 200) {
            localLogger.error({}, "Error exporting Google document");
            throw new Error(
              `Error exporting Google document. status_code: ${res.status}. status_text: ${res.statusText}`
            );
          }
          if (typeof res.data === "string") {
            documentContent =
              res.data && res.data.trim().length > 0
                ? {
                    prefix: null,
                    content: res.data.trim(),
                    sections: [],
                  }
                : null;
          } else if (
            typeof res.data === "object" ||
            typeof res.data === "number" ||
            typeof res.data === "boolean" ||
            typeof res.data === "bigint"
          ) {
            // In case the contents returned by the file export matches a JS type,
            // we need to convert it
            //  e.g. a google presentation with just the number
            // 1 in it, the export will return the number 1 instead of a string
            documentContent =
              res.data && res.data.toString().trim().length > 0
                ? {
                    prefix: null,
                    content: res.data.toString().trim(),
                    sections: [],
                  }
                : null;
          } else {
            localLogger.error(
              {
                resDataTypeOf: typeof res.data,
                type: "export",
              },
              "Unexpected GDrive export response type"
            );
          }
        } catch (e) {
          localLogger.error({}, "Error exporting Google document");
          throw e;
        }
      } else if (mimeTypesToDownload.includes(file.mimeType)) {
        const drive = await getDriveClient(oauth2client);

        let res;
        try {
          // Be careful this will download the whole file in memory and can cause OOM.
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
          const maybeErrorWithCode = e as { code: string };
          if (maybeErrorWithCode.code === "ERR_OUT_OF_RANGE") {
            // This error happens when the file is too big to be downloaded.
            // We skip this file.
            localLogger.info({}, "File too big to be downloaded. Skipping");
            return false;
          }
          throw e;
        }

        if (res.status !== 200) {
          throw new Error(
            `Error downloading Google document. status_code: ${res.status}. status_text: ${res.statusText}`
          );
        }

        if (file.mimeType === "text/plain") {
          if (res.data instanceof ArrayBuffer) {
            // If data is > 4 times the limit, we skip the file since even if
            // converted to utf-8 it will overcome the limit enforced below. This
            // avoids operations on very long text files, that can cause
            // Buffer.toString to crash if the file is > 500MB
            if (res.data.byteLength > 4 * maxDocumentLen) {
              localLogger.info({}, "File too big to be chunked. Skipping");
              return false;
            }
            documentContent = {
              prefix: null,
              content: Buffer.from(res.data).toString("utf-8").trim(),
              sections: [],
            };
          } else {
            localLogger.error(
              {
                resDataTypeOf: typeof res.data,
                type: "download",
              },
              "Unexpected GDrive export response type"
            );
          }
        } else if (
          [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          ].includes(file.mimeType)
        ) {
          if (!(res.data instanceof ArrayBuffer)) {
            localLogger.error(
              { mimeType: file.mimeType },
              "File download failed."
            );

            return false;
          }

          const pageRes = await new TextExtraction(
            apiConfig.getTextExtractionUrl()
          ).fromBuffer(Buffer.from(res.data), file.mimeType);
          if (pageRes.isErr()) {
            localLogger.warn(
              {
                error: pageRes.error,
                mimeType: file.mimeType,
              },
              "Error while converting file to text"
            );

            // We don't know what to do with files that fails to be converted to text.
            // So we log the error and skip the file.
            return false;
          }

          const pages = pageRes.value;

          const prefix = pagePrefixesPerMimeType[file.mimeType] || "";

          documentContent =
            pages.length > 0
              ? {
                  prefix: null,
                  content: null,
                  sections: pages.map((page) => ({
                    prefix: `\n${prefix}: ${page.pageNumber}/${pages.length}\n`,
                    content: page.content,
                    sections: [],
                  })),
                }
              : null;

          localLogger.info(
            {
              mimeType: file.mimeType,
              pagesCount: pages.length,
            },
            "Successfully converted file to text"
          );
        } else if (
          file.mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          if (res.data instanceof ArrayBuffer) {
            try {
              const extracted = await docx2text(
                Buffer.from(res.data),
                file.name
              );

              documentContent = {
                prefix: null,
                content: extracted.trim(),
                sections: [],
              };
            } catch (err) {
              localLogger.warn(
                {
                  error: err,
                },
                "Error while converting docx document to text"
              );
              return false;
            }
          }
        } else if (file.mimeType === "text/csv") {
          if (res.data instanceof ArrayBuffer) {
            // If data is > 4 times the limit, we skip the file since even if
            // converted to utf-8 it will overcome the limit enforced below. This
            // avoids operations on very long text files, that can cause
            // Buffer.toString to crash if the file is > 500MB
            if (res.data.byteLength > 4 * maxDocumentLen) {
              localLogger.info({}, "File too big to be chunked. Skipping");
              return false;
            }
            const tableCsv = Buffer.from(res.data).toString("utf-8").trim();
            const tableId = file.id;
            const tableName = slugify(file.name.substring(0, 32));
            const tableDescription = `Structured data from Google Drive (${file.name})`;

            try {
              await upsertTableFromCsv({
                dataSourceConfig,
                tableId,
                tableName,
                tableDescription,
                tableCsv,
                loggerArgs: {
                  connectorId,
                  fileId: tableId,
                  fileName: tableName,
                },
                truncate: true,
              });
            } catch (err) {
              localLogger.warn(
                {
                  error: err,
                },
                "Error while upserting table from CSV file"
              );

              return false;
            }
          } else {
            localLogger.error(
              {
                resDataTypeOf: typeof res.data,
                type: "download",
              },
              "Unexpected GDrive export response type"
            );
          }
        }
      } else if (isGoogleDriveSpreadSheetFile(file)) {
        // If Google Spreadsheet FF is not enabled, it returns false.
        const res = await syncSpreadSheet(oauth2client, connectorId, file);
        if (!res.isSupported) {
          return false;
        } else {
          if (res.skipReason) {
            localLogger.info(
              {},
              `Google Spreadsheet document skipped with skip reason ${res.skipReason}`
            );
            skipReason = res.skipReason;
          }
        }
      } else {
        // We do not support this file type.
        return false;
      }

      let upsertTimestampMs: number | undefined = undefined;
      // We only upsert the document if it's not a Google Drive spreadsheet
      // or a CSV file.
      if (!isGoogleDriveSpreadSheetFile(file) || file.mimeType === "text/csv") {
        const content = await renderDocumentTitleAndContent({
          dataSourceConfig,
          title: file.name,
          updatedAt: file.updatedAtMs ? new Date(file.updatedAtMs) : undefined,
          createdAt: file.createdAtMs ? new Date(file.createdAtMs) : undefined,
          lastEditor: file.lastEditor ? file.lastEditor.displayName : undefined,
          content: documentContent,
        });

        if (documentContent === undefined) {
          localLogger.error({}, "documentContent is undefined");
          throw new Error("documentContent is undefined");
        }
        const tags = [`title:${file.name}`];
        if (file.updatedAtMs) {
          tags.push(`updatedAt:${file.updatedAtMs}`);
        }
        if (file.createdAtMs) {
          tags.push(`createdAt:${file.createdAtMs}`);
        }
        if (file.lastEditor) {
          tags.push(`lastEditor:${file.lastEditor.displayName}`);
        }
        tags.push(`mimeType:${file.mimeType}`);

        const documentLen = documentContent
          ? sectionLength(documentContent)
          : 0;

        if (documentLen > 0 && documentLen <= maxDocumentLen) {
          const parents = (
            await getFileParentsMemoized(
              connectorId,
              oauth2client,
              file,
              startSyncTs
            )
          ).map((f) => f.id);
          parents.push(file.id);
          parents.reverse();

          await upsertToDatasource({
            dataSourceConfig,
            documentId,
            documentContent: content,
            documentUrl: file.webViewLink,
            timestampMs: file.updatedAtMs,
            tags,
            parents: parents,
            upsertContext: {
              sync_type: isBatchSync ? "batch" : "incremental",
            },
            async: true,
          });

          upsertTimestampMs = file.updatedAtMs;
        } else {
          localLogger.info(
            {
              documentLen: documentLen,
            },
            "Document is empty or too big to be upserted. Skipping"
          );
        }
      }

      const params: CreationAttributes<GoogleDriveFiles> = {
        connectorId: connectorId,
        dustFileId: documentId,
        driveFileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        parentId: file.parent,
        lastSeenTs: new Date(),
        skipReason,
      };

      if (upsertTimestampMs) {
        params.lastUpsertedTs = new Date(upsertTimestampMs);
      }

      await GoogleDriveFiles.upsert(params);

      return !!upsertTimestampMs;
    }
  );
}
