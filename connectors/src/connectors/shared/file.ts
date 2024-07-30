import type {
  CoreAPIDataSourceDocumentSection,
  ModelId,
  Result,
} from "@dust-tt/types";
import {
  Err,
  isTextExtractionSupportedContentType,
  Ok,
  TextExtraction,
} from "@dust-tt/types";
import { parseAndStringifyCsv, slugify } from "@dust-tt/types";
import type { DriveItem } from "@microsoft/microsoft-graph-types";

import { apiConfig } from "@connectors/lib/api/config";
import { upsertTableFromCsv } from "@connectors/lib/data_sources";
import type { Logger } from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import type { GoogleDriveObjectType } from "@connectors/types/google_drive";

const pagePrefixesPerMimeType: Record<string, string> = {
  "application/pdf": "$pdfPage",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "$slideNumber",
};

const dataSourceNameToConnectorName: { [key: string]: string } = {
  "managed-microsoft": "Microsoft",
  "managed-google_drive": "Google Drive",
};

export function handleTextFile(
  data: ArrayBuffer,
  maxDocumentLen: number
): Result<
  CoreAPIDataSourceDocumentSection,
  { reason?: string; error?: Error }
> {
  if (data.byteLength > 4 * maxDocumentLen) {
    return new Err({ reason: "file_too_big" });
  }
  return new Ok({
    prefix: null,
    content: Buffer.from(data).toString("utf-8").trim(),
    sections: [],
  });
}

export async function handleCsvFile({
  data,
  file,
  maxDocumentLen,
  localLogger,
  dataSourceConfig,
  connectorId,
}: {
  data: ArrayBuffer;
  file: GoogleDriveObjectType | DriveItem;
  maxDocumentLen: number;
  localLogger: Logger;
  dataSourceConfig: DataSourceConfig;
  connectorId: ModelId;
}): Promise<Result<null, { reason?: string; error?: Error }>> {
  if (data.byteLength > 4 * maxDocumentLen) {
    localLogger.info({}, "File too big to be chunked. Skipping");
    return new Err({ reason: "file_too_big" });
  }

  const fileName = file.name ?? "";

  const tableCsv = Buffer.from(data).toString("utf-8").trim();
  const tableId = file.id ?? "";
  const tableName = slugify(fileName.substring(0, 32));
  const tableDescription = `Structured data from ${dataSourceNameToConnectorName[dataSourceConfig.dataSourceName]} (${file.name})`;

  try {
    const stringifiedContent = await parseAndStringifyCsv(tableCsv);
    await upsertTableFromCsv({
      dataSourceConfig,
      tableId,
      tableName,
      tableDescription,
      tableCsv: stringifiedContent,
      loggerArgs: {
        connectorId,
        fileId: tableId,
        fileName: tableName,
      },
      truncate: true,
    });
  } catch (err) {
    localLogger.warn({ error: err }, "Error while parsing or upserting table");
    return new Err({
      reason: "parsing_or_upsert_error",
      error: err as Error,
    });
  }
  return new Ok(null);
}

export async function handleTextExtraction(
  data: ArrayBuffer,
  localLogger: Logger,
  mimeType: string
): Promise<
  Result<CoreAPIDataSourceDocumentSection, { reason?: string; error?: Error }>
> {
  if (!isTextExtractionSupportedContentType(mimeType)) {
    return new Err({ reason: "unsupported_content_type" });
  }

  const pageRes = await new TextExtraction(
    apiConfig.getTextExtractionUrl()
  ).fromBuffer(Buffer.from(data), mimeType);

  if (pageRes.isErr()) {
    localLogger.warn(
      {
        error: pageRes.error,
        mimeType: mimeType,
      },
      "Error while converting file to text"
    );
    // We don't know what to do with files that fails to be converted to text.
    // So we log the error and skip the file.
    return new Err({
      reason: "text_conversion_error",
      error: pageRes.error,
    });
  }

  const pages = pageRes.value;
  const prefix = pagePrefixesPerMimeType[mimeType];

  localLogger.info(
    {
      mimeType: mimeType,
      pagesCount: pages.length,
    },
    "Successfully converted file to text"
  );

  return pages.length > 0
    ? new Ok({
        prefix: null,
        content: null,
        sections: pages.map((page) => ({
          prefix: prefix
            ? `\n${prefix}: ${page.pageNumber}/${pages.length}\n`
            : null,
          content: page.content,
          sections: [],
        })),
      })
    : new Err({ reason: "no_pages_extracted" });
}
