import type { ConnectorProvider, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import * as iconv from "iconv-lite";

import { apiConfig } from "@connectors/lib/api/config";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  ignoreTablesError,
  upsertDataSourceTableFromCsv,
} from "@connectors/lib/data_sources";
import type { Logger } from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import {
  isTextExtractionSupportedContentType,
  normalizeError,
  pagePrefixesPerMimeType,
  parseAndStringifyCsv,
  slugify,
  TextExtraction,
} from "@connectors/types";

// We observed cases where tabular data was stored in ASCII in .txt files.
const MAX_NUMBER_CHAR_RATIO = 0.66;

/**
 * Detects the encoding of a buffer and decodes it to a string.
 * Checks for UTF-16 BOM markers and falls back to UTF-8.
 */
export function decodeBuffer(data: ArrayBufferLike): string {
  const buffer = Buffer.from(data);

  // Check for UTF-16 LE BOM (FF FE)
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return iconv.decode(buffer, "utf16le");
  }

  // Check for UTF-16 BE BOM (FE FF)
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return iconv.decode(buffer, "utf16be");
  }

  // Check for UTF-8 BOM (EF BB BF)
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return iconv.decode(buffer, "utf8");
  }

  // Default to UTF-8 without BOM
  return buffer.toString("utf-8");
}

export function handleTextFile(
  data: ArrayBuffer,
  maxDocumentLen: number
): Result<CoreAPIDataSourceDocumentSection, Error> {
  if (data.byteLength > 4 * maxDocumentLen) {
    return new Err(new Error("file_too_big"));
  }
  const content = Buffer.from(data).toString("utf-8").trim();
  const digitCount = (content.match(/[\d\n\r]/g) || []).length;
  if (digitCount / content.length > MAX_NUMBER_CHAR_RATIO) {
    return new Err(new Error("too_many_digits"));
  }
  return new Ok({ prefix: null, content, sections: [] });
}

export async function handleCsvFile({
  data,
  tableId,
  fileName,
  maxDocumentLen,
  localLogger,
  dataSourceConfig,
  provider,
  connectorId,
  parents,
  tags,
  allowEmptySchema,
}: {
  data: ArrayBuffer;
  tableId: string;
  fileName: string;
  maxDocumentLen: number;
  localLogger: Logger;
  dataSourceConfig: DataSourceConfig;
  provider: ConnectorProvider;
  connectorId: ModelId;
  parents: string[];
  tags: string[];
  allowEmptySchema: boolean;
}): Promise<Result<null, Error>> {
  if (data.byteLength > 4 * maxDocumentLen) {
    localLogger.info({}, "File too big to be chunked. Skipping");
    return new Err(new Error("file_too_big"));
  }

  const tableName = slugify(fileName.substring(0, 32));
  const tableDescription = `Structured data from ${provider} (${fileName})`;

  try {
    const stringifiedContent = await parseAndStringifyCsv(decodeBuffer(data));
    await ignoreTablesError(`${provider} CSV File`, () =>
      upsertDataSourceTableFromCsv({
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
        parents,
        parentId: parents[1] || null,
        title: fileName,
        mimeType: "text/csv",
        tags,
        allowEmptySchema,
      })
    );
  } catch (err) {
    localLogger.warn({ error: err }, "Error while parsing or upserting table");
    return new Err(normalizeError(err));
  }
  return new Ok(null);
}

export async function handleTextExtraction(
  data: ArrayBuffer,
  localLogger: Logger,
  mimeType: string
): Promise<Result<CoreAPIDataSourceDocumentSection, Error>> {
  if (!isTextExtractionSupportedContentType(mimeType)) {
    return new Err(new Error("unsupported_content_type"));
  }

  const pageRes = await new TextExtraction(apiConfig.getTextExtractionUrl(), {
    enableOcr: false,
    logger: localLogger,
  }).fromBuffer(Buffer.from(data), mimeType);

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
    return pageRes;
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
    : new Err(new Error("no_pages_extracted"));
}
