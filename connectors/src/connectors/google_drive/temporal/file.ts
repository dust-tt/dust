import type { ModelId } from "@dust-tt/types";
import { uuid4 } from "@temporalio/workflow";
import fs from "fs/promises";
import type { OAuth2Client } from "googleapis-common";
import os from "os";
import type { CreationAttributes } from "sequelize";

import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import {
  getMimeTypesToDownload,
  MIME_TYPES_TO_EXPORT,
} from "@connectors/connectors/google_drive/temporal/mime_types";
import {
  isGoogleDriveSpreadSheetFile,
  syncSpreadSheet,
} from "@connectors/connectors/google_drive/temporal/spreadsheets";
import {
  getDocumentId,
  getDriveClient,
} from "@connectors/connectors/google_drive/temporal/utils";
import {
  MAX_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import { dpdf2text } from "@connectors/lib/dpdf2text";
import { GoogleDriveFiles } from "@connectors/lib/models/google_drive";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";

export async function syncOneFile(
  connectorId: ModelId,
  oauth2client: OAuth2Client,
  dataSourceConfig: DataSourceConfig,
  file: GoogleDriveObjectType,
  startSyncTs: number,
  isBatchSync = false
): Promise<boolean> {
  const mimeTypesToDownload = await getMimeTypesToDownload(connectorId);
  const documentId = getDocumentId(file.id);
  let documentContent: string | undefined = undefined;

  const fileInDb = await GoogleDriveFiles.findOne({
    where: {
      connectorId: connectorId,
      driveFileId: file.id,
    },
  });

  if (fileInDb?.skipReason) {
    logger.info(
      {
        documentId,
        dataSourceConfig,
        fileId: file.id,
        title: file.name,
      },
      `Google Drive document skipped with skip reason ${fileInDb.skipReason}`
    );
    return false;
  }
  if (!file.capabilities.canDownload) {
    logger.info(
      {
        documentId,
        connectorId,
        fileId: file.id,
        title: file.name,
      },
      `Google Drive document skipped because it cannot be downloaded`
    );
    return false;
  }

  if (MIME_TYPES_TO_EXPORT[file.mimeType]) {
    const drive = await getDriveClient(oauth2client);
    try {
      const res = await drive.files.export({
        fileId: file.id,
        mimeType: MIME_TYPES_TO_EXPORT[file.mimeType],
      });
      if (res.status !== 200) {
        logger.error(
          {
            documentId,
            dataSourceConfig,
            fileId: file.id,
            title: file.name,
          },
          "Error exporting Google document"
        );
        throw new Error(
          `Error exporting Google document. status_code: ${res.status}. status_text: ${res.statusText}`
        );
      }
      if (typeof res.data === "string") {
        documentContent = res.data;
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
        documentContent = res.data?.toString();
      } else {
        logger.error(
          {
            connectorId: connectorId,
            documentId,
            fileMimeType: file.mimeType,
            fileId: file.id,
            title: file.name,
            resDataTypeOf: typeof res.data,
            type: "export",
          },
          "Unexpected GDrive export response type"
        );
      }
    } catch (e) {
      logger.error(
        {
          documentId,
          dataSourceConfig,
          fileId: file.id,
          title: file.name,
        },
        "Error exporting Google document"
      );
      throw e;
    }
  } else if (mimeTypesToDownload.includes(file.mimeType)) {
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
      const maybeErrorWithCode = e as { code: string };
      if (maybeErrorWithCode.code === "ERR_OUT_OF_RANGE") {
        // This error happens when the file is too big to be downloaded.
        // We skip this file.
        logger.info(
          {
            file_id: file.id,
            mimeType: file.mimeType,
            title: file.name,
          },
          `File too big to be downloaded. Skipping`
        );
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
        if (res.data.byteLength > 4 * MAX_DOCUMENT_TXT_LEN) {
          logger.info(
            {
              file_id: file.id,
              mimeType: file.mimeType,
              title: file.name,
            },
            `File too big to be chunked. Skipping`
          );
          return false;
        }
        documentContent = Buffer.from(res.data).toString("utf-8");
      } else {
        logger.error(
          {
            connectorId: connectorId,
            documentId,
            fileMimeType: file.mimeType,
            fileId: file.id,
            title: file.name,
            resDataTypeOf: typeof res.data,
            type: "download",
          },
          "Unexpected GDrive export response type"
        );
      }
    } else if (file.mimeType === "application/pdf") {
      const pdf_path = os.tmpdir() + "/" + uuid4() + ".pdf";
      try {
        if (res.data instanceof ArrayBuffer) {
          await fs.writeFile(pdf_path, Buffer.from(res.data), "binary");
        }

        const pdfTextData = await dpdf2text(pdf_path);

        documentContent = pdfTextData;
        logger.info(
          {
            file_id: file.id,
            mimeType: file.mimeType,
            title: file.name,
          },
          `Successfully converted PDF to text`
        );
      } catch (err) {
        logger.warn(
          {
            error: err,
            file_id: file.id,
            mimeType: file.mimeType,
            filename: file.name,
          },
          `Error while converting PDF to text`
        );
        // we don't know what to do with PDF files that fails to be converted to text.
        // So we log the error and skip the file.
        return false;
      } finally {
        await fs.unlink(pdf_path);
      }
    }
  } else if (isGoogleDriveSpreadSheetFile(file)) {
    // If Google Spreadsheet FF is not enabled, it returns false.
    const isSupported = await syncSpreadSheet(oauth2client, connectorId, file);
    if (!isSupported) {
      return false;
    }
  } else {
    // We do not support this file type.
    return false;
  }

  let upsertTimestampMs: number | undefined = undefined;
  // We only upsert the document if it's not a google drive spreadsheet.
  if (!isGoogleDriveSpreadSheetFile(file)) {
    documentContent = documentContent?.trim();

    const content = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: file.name,
      updatedAt: file.updatedAtMs ? new Date(file.updatedAtMs) : undefined,
      createdAt: file.createdAtMs ? new Date(file.createdAtMs) : undefined,
      lastEditor: file.lastEditor ? file.lastEditor.displayName : undefined,
      content: documentContent
        ? { prefix: null, content: documentContent, sections: [] }
        : null,
    });

    if (documentContent === undefined) {
      logger.error(
        {
          connectorId: connectorId,
          documentId,
          fileMimeType: file.mimeType,
          fileId: file.id,
          title: file.name,
        },
        "documentContent is undefined"
      );
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

    if (
      documentContent.length > 0 &&
      documentContent.length <= MAX_DOCUMENT_TXT_LEN
    ) {
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
      });

      upsertTimestampMs = file.updatedAtMs;
    } else {
      logger.info(
        {
          documentId,
          dataSourceConfig,
          documentLen: documentContent.length,
          title: file.name,
        },
        `Document is empty or too big to be upserted. Skipping`
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
  };

  if (upsertTimestampMs) {
    params.lastUpsertedTs = new Date(upsertTimestampMs);
  }

  await GoogleDriveFiles.upsert(params);

  return !!upsertTimestampMs;
}
