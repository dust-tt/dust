import type {
  CoreAPIDataSourceDocumentBlob,
  GetDocumentBlobResponseType,
  GetDocumentsResponseType,
  GetFolderResponseType,
  GetTableResponseType,
  PostDataSourceDocumentRequestType,
  UpsertDatabaseTableRequestType,
  UpsertTableFromCsvRequestType,
} from "@dust-tt/client";
import { DustAPI } from "@dust-tt/client";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import type { AxiosError } from "axios";
import axios from "axios";
import tracer from "dd-trace";
import http from "http";
import https from "https";
import type { Branded, IntBrand } from "io-ts";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";

import { apiConfig } from "@connectors/lib/api/config";
import { DustConnectorWorkflowError, TablesError } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import type { ProviderVisibility } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import { isValidDate, safeSubstring, stripNullBytes } from "@connectors/types";
import { withRetries } from "@connectors/types";

const MAX_CSV_SIZE = 50 * 1024 * 1024;

const axiosWithTimeout = axios.create({
  timeout: 60000,
  // Ensure client timeout is lower than the target server timeout.
  // See --keepAliveTimeout in next start command from front.
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false }),
});

// We limit the document size we support. Beyond a certain size, upsert is simply too slow (>300s)
// and large files are generally less useful anyway.
export const MAX_DOCUMENT_TXT_LEN = 750000;
// For some data sources we allow small documents only to be processed.
export const MAX_SMALL_DOCUMENT_TXT_LEN = 500000;
// For some data sources we allow large documents (5mb) to be processed (behind flag).
export const MAX_LARGE_DOCUMENT_TXT_LEN = 5000000;
export const MAX_FILE_SIZE_TO_DOWNLOAD = 256 * 1024 * 1024;

const MAX_TITLE_LENGTH = 512;
const MAX_TAG_LENGTH = 512;

type UpsertContext = {
  sync_type: "batch" | "incremental";
};

export type UpsertDataSourceDocumentParams = {
  dataSourceConfig: DataSourceConfig;
  documentId: string;
  documentContent: CoreAPIDataSourceDocumentSection;
  documentUrl?: string;
  timestampMs?: number;
  tags?: string[];
  parents: string[];
  parentId: string | null;
  loggerArgs?: Record<string, string | number>;
  upsertContext: UpsertContext;
  title: string;
  mimeType: string;
  async: boolean;
};

function getDustAPI(dataSourceConfig: DataSourceConfig) {
  return new DustAPI(
    {
      url: apiConfig.getDustFrontInternalAPIUrl(),
    },
    {
      apiKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
    },
    logger
  );
}

export const upsertDataSourceDocument = withRetries(
  logger,
  _upsertDataSourceDocument,
  {
    retries: 3,
  }
);

async function _upsertDataSourceDocument({
  dataSourceConfig,
  documentId,
  documentContent,
  documentUrl,
  timestampMs,
  tags,
  parents,
  loggerArgs = {},
  upsertContext,
  title,
  mimeType,
  async,
  parentId,
}: UpsertDataSourceDocumentParams) {
  return tracer.trace(
    `connectors`,
    {
      resource: `upsertToDatasource`,
    },
    async (span) => {
      span?.setTag("documentId", documentId);
      span?.setTag("workspaceId", dataSourceConfig.workspaceId);
      Object.keys(loggerArgs).forEach((key) => {
        span?.setTag(key, loggerArgs[key]);
      });

      const endpoint =
        `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
        `/data_sources/${dataSourceConfig.dataSourceId}/documents/${documentId}`;

      const localLogger = logger.child({
        ...loggerArgs,
        documentId,
        documentUrl,
        documentLength: sectionFullText(documentContent).length,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        endpoint,
        parents,
      });
      const statsDTags = [
        `data_source_Id:${dataSourceConfig.dataSourceId}`,
        `workspace_id:${dataSourceConfig.workspaceId}`,
      ];

      localLogger.info("Attempting to upload document to Dust.");
      statsDClient.increment(
        "data_source_upserts_attempt.count",
        1,
        statsDTags
      );

      const now = new Date();

      const timestamp = timestampMs
        ? (Math.floor(timestampMs) as Branded<number, IntBrand>)
        : null;

      const dustRequestPayload: PostDataSourceDocumentRequestType = {
        text: null,
        section: documentContent,
        source_url: documentUrl ?? null,
        timestamp,
        title: safeSubstring(title, 0, MAX_TITLE_LENGTH),
        mime_type: mimeType,
        tags: tags?.map((tag) => safeSubstring(tag, 0, MAX_TAG_LENGTH)),
        parent_id: parentId,
        parents,
        light_document_output: true,
        upsert_context: upsertContext,
        async,
      };

      const dustRequestConfig: AxiosRequestConfig = {
        headers: {
          Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
        },
      };

      let dustRequestResult: AxiosResponse;
      try {
        dustRequestResult = await axiosWithTimeout.post(
          endpoint,
          dustRequestPayload,
          dustRequestConfig
        );
      } catch (e) {
        const elapsed = new Date().getTime() - now.getTime();
        if (axios.isAxiosError(e) && e.config?.data) {
          e.config.data = "[REDACTED]";
        }

        statsDClient.increment(
          "data_source_upserts_error.count",
          1,
          statsDTags
        );
        statsDClient.distribution(
          "data_source_upserts_error.duration.distribution",
          elapsed,
          statsDTags
        );
        localLogger.error({ error: e }, "Error uploading document to Dust.");
        throw e;
      }

      const elapsed = new Date().getTime() - now.getTime();

      if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
        statsDClient.increment(
          "data_source_upserts_success.count",
          1,
          statsDTags
        );
        statsDClient.distribution(
          "data_source_upserts_success.duration.distribution",
          elapsed,
          statsDTags
        );
        localLogger.info("Successfully uploaded document to Dust.");
      } else {
        statsDClient.increment(
          "data_source_upserts_error.count",
          1,
          statsDTags
        );
        statsDClient.distribution(
          "data_source_upserts_error.duration.distribution",
          elapsed,
          statsDTags
        );
        localLogger.error(
          {
            status: dustRequestResult.status,
            elapsed,
          },
          "Error uploading document to Dust."
        );
        throw new Error(
          `Error uploading to dust: ${JSON.stringify(
            dustRequestResult,
            null,
            2
          )}`
        );
      }
    }
  );
}

export type CoreAPIDataSourceDocument =
  GetDocumentsResponseType["documents"][number];

export async function getDataSourceDocument({
  dataSourceConfig,
  documentId,
}: {
  dataSourceConfig: DataSourceConfig;
  documentId: string;
}): Promise<CoreAPIDataSourceDocument | undefined> {
  const localLogger = logger.child({
    documentId,
  });

  const endpoint =
    `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/documents?document_ids=${documentId}`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse<GetDocumentsResponseType>;
  try {
    dustRequestResult = await axiosWithTimeout.get(endpoint, dustRequestConfig);
  } catch (e) {
    localLogger.error({ error: e }, "Error getting document from Dust.");
    throw e;
  }
  if (dustRequestResult.data.documents.length === 0) {
    localLogger.info("Document doesn't exist on Dust. Ignoring.");
    return;
  }

  return dustRequestResult.data.documents[0];
}

export async function getDataSourceDocumentBlob({
  dataSourceConfig,
  documentId,
}: {
  dataSourceConfig: DataSourceConfig;
  documentId: string;
}): Promise<CoreAPIDataSourceDocumentBlob | undefined> {
  const localLogger = logger.child({
    documentId,
  });

  const endpoint =
    `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/documents/${documentId}/blob`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse<GetDocumentBlobResponseType>;
  try {
    dustRequestResult = await axiosWithTimeout.get(endpoint, dustRequestConfig);
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 404) {
      localLogger.info("Document doesn't exist on Dust. Ignoring.");
      return undefined;
    }

    localLogger.error({ error: e }, "Error getting document from Dust.");
    throw e;
  }

  return dustRequestResult.data.blob;
}

export async function deleteDataSourceDocument(
  dataSourceConfig: DataSourceConfig,
  documentId: string,
  loggerArgs: Record<string, string | number> = {}
) {
  const localLogger = logger.child({ ...loggerArgs, documentId });

  const endpoint =
    `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/documents/${documentId}`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axiosWithTimeout.delete(
      endpoint,
      dustRequestConfig
    );
  } catch (e) {
    localLogger.error({ error: e }, "Error deleting document from Dust.");
    throw e;
  }

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    localLogger.info("Successfully deleted document from Dust.");
  } else {
    localLogger.error(
      {
        status: dustRequestResult.status,
      },
      "Error deleting document from Dust."
    );
    throw new Error(`Error deleting from dust: ${dustRequestResult}`);
  }
}

export const updateDataSourceDocumentParents = withRetries(
  logger,
  _updateDataSourceDocumentParents,
  { retries: 3 }
);

async function _updateDataSourceDocumentParents({
  documentId,
  ...params
}: {
  dataSourceConfig: DataSourceConfig;
  documentId: string;
  parents: string[];
  parentId: string | null;
  loggerArgs?: Record<string, string | number>;
}) {
  return _updateDocumentOrTableParentsField({
    ...params,
    tableOrDocument: "document",
    id: documentId,
  });
}

export const updateDataSourceTableParents = withRetries(
  logger,
  _updateDataSourceTableParents,
  { retries: 3 }
);

async function _updateDataSourceTableParents({
  tableId,
  ...params
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
  parents: string[];
  parentId: string | null;
  loggerArgs?: Record<string, string | number>;
}) {
  return _updateDocumentOrTableParentsField({
    ...params,
    tableOrDocument: "table",
    id: tableId,
  });
}

async function _updateDocumentOrTableParentsField({
  dataSourceConfig,
  id,
  parents,
  parentId,
  loggerArgs = {},
  tableOrDocument,
}: {
  dataSourceConfig: DataSourceConfig;
  id: string;
  parents: string[];
  parentId: string | null;
  loggerArgs?: Record<string, string | number>;
  tableOrDocument: "document" | "table";
}) {
  const localLogger =
    tableOrDocument === "document"
      ? logger.child({ ...loggerArgs, documentId: id })
      : logger.child({ ...loggerArgs, tableId: id });
  const endpoint =
    `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/${tableOrDocument}s/${id}/parents`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axiosWithTimeout.post(
      endpoint,
      {
        parents: parents,
        parent_id: parentId,
      },
      dustRequestConfig
    );
  } catch (e) {
    localLogger.error(
      { error: e },
      `Error updating ${tableOrDocument} parents field.`
    );
    throw e;
  }

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    return;
  } else {
    localLogger.error(
      {
        status: dustRequestResult.status,
        data: dustRequestResult.data,
      },
      `Error updating ${tableOrDocument} parents field.`
    );
    throw new Error(
      `Error updating ${tableOrDocument} parents field: ${dustRequestResult}`
    );
  }
}

// allows for 4 full prefixes before hitting half of the max chunk size (approx.
// 256 chars for 512 token chunks)
const MAX_CHUNK_SIZE = 512;
export const MAX_PREFIX_TOKENS = MAX_CHUNK_SIZE / 8;
// Limit on chars to avoid tokenizing too much text uselessly on documents with
// large prefixes. The final truncating will rely on MAX_PREFIX_TOKENS so this
// limit can be large and should be large to avoid underusing prexfixes
export const MAX_PREFIX_CHARS = MAX_PREFIX_TOKENS * 8;

// The role of this function is to create a prefix from an arbitrary long string. The prefix
// provided will not be augmented with `\n`, so it should include appropriate carriage return. If
// the prefix is too long (> MAX_PREFIX_TOKENS), it will be truncated. The remained will be returned as
// content of the resulting section.
export async function renderPrefixSection({
  dataSourceConfig,
  prefix,
  maxPrefixTokens = MAX_PREFIX_TOKENS,
  maxPrefixChars = MAX_PREFIX_CHARS,
}: {
  dataSourceConfig: DataSourceConfig;
  prefix: string | null;
  maxPrefixTokens?: number;
  maxPrefixChars?: number;
}): Promise<CoreAPIDataSourceDocumentSection> {
  if (!prefix || !prefix.trim()) {
    return {
      prefix: null,
      content: null,
      sections: [],
    };
  }
  let targetPrefix = safeSubstring(prefix, 0, maxPrefixChars);
  let targetContent =
    prefix.length > maxPrefixChars ? safeSubstring(prefix, maxPrefixChars) : "";

  const tokens = await tokenize(targetPrefix, dataSourceConfig);

  targetPrefix = tokens
    .slice(0, maxPrefixTokens)
    .map((t) => t[1])
    .join("");
  targetContent =
    tokens
      .slice(maxPrefixTokens)
      .map((t) => t[1])
      .join("") + targetContent;

  return {
    prefix: targetContent ? targetPrefix + "...\n" : targetPrefix,
    content: targetContent ? "..." + targetContent : null,
    sections: [],
  };
}

// At 5mn, likeliness of connection close increases significantly. The timeout is set at 4mn30.
const TOKENIZE_TIMEOUT_MS = 270000;

async function tokenize(text: string, ds: DataSourceConfig) {
  if (!text) {
    return [];
  }

  const sanitizedText = stripNullBytes(text);
  if (!sanitizedText || sanitizedText.length === 0) {
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKENIZE_TIMEOUT_MS);
  const tokensRes = await getDustAPI(ds).tokenize(
    sanitizedText,
    ds.dataSourceId,
    { signal: controller.signal }
  );
  clearTimeout(timeoutId);
  if (tokensRes.isErr()) {
    logger.error(
      {
        error: tokensRes.error.message,
        dataSourceId: ds.dataSourceId,
        workspaceId: ds.workspaceId,
      },
      `Error tokenizing text for ${ds.dataSourceId}`
    );
    throw new DustConnectorWorkflowError(
      `Error tokenizing text for ${ds.dataSourceId}`,
      "transient_upstream_activity_error",
      tokensRes.error
    );
  }
  return tokensRes.value;
}

/// This function is used to render markdown from (alternatively GFM format) to our Section format.
/// The top-level node is always with prefix and content null and can be edited to add a prefix or
/// content.
export async function renderMarkdownSection(
  dsConfig: DataSourceConfig,
  markdown: string,
  { flavor }: { flavor?: "gfm" } = {}
): Promise<CoreAPIDataSourceDocumentSection> {
  const extensions = flavor === "gfm" ? [gfm()] : [];
  const mdastExtensions = flavor === "gfm" ? [gfmFromMarkdown()] : [];

  const tree = fromMarkdown(markdown, {
    extensions: extensions,
    mdastExtensions: mdastExtensions,
  });

  const top = { prefix: null, content: null, sections: [] };

  let path: { depth: number; content: CoreAPIDataSourceDocumentSection }[] = [
    { depth: 0, content: top },
  ];

  for (const child of tree.children) {
    if (child.type === "heading" && child.depth <= 2) {
      path = path.filter((p) => p.depth < child.depth);

      const last = path[path.length - 1];
      if (!last) {
        throw new Error("Unreachable");
      }

      const c = await renderPrefixSection({
        dataSourceConfig: dsConfig,
        prefix: toMarkdown(child, { extensions: [gfmToMarkdown()] }),
      });
      last.content.sections.push(c);
      path.push({
        depth: child.depth,
        content: c,
      });
    } else {
      const last = path[path.length - 1];
      if (!last) {
        throw new Error("Unreachable");
      }

      last.content.sections.push({
        prefix: null,
        content: toMarkdown(child, { extensions: [gfmToMarkdown()] }),
        sections: [],
      });
    }
  }

  return top;
}

const MAX_AUTHOR_CHAR_LENGTH = 48;
const MAX_ADDITIONAL_PREFIXES_LENGTH = 128;
// Will render the document based on title, optional createdAt and updatedAt and a structured
// content. The title, createdAt and updatedAt will be presented in a standardized way across
// connectors. The title should not include any `\n`.
// If the title is too long it will be truncated and the remainder of the title will be set as
// content of the top-level section.
export async function renderDocumentTitleAndContent({
  dataSourceConfig,
  title,
  createdAt,
  updatedAt,
  author,
  lastEditor,
  additionalPrefixes,
  content,
}: {
  dataSourceConfig: DataSourceConfig;
  title: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  author?: string;
  lastEditor?: string;
  additionalPrefixes?: Record<string, string>;
  content: CoreAPIDataSourceDocumentSection | null;
}): Promise<CoreAPIDataSourceDocumentSection> {
  author = author
    ? safeSubstring(author, 0, MAX_AUTHOR_CHAR_LENGTH)
    : undefined;
  lastEditor = lastEditor
    ? safeSubstring(lastEditor, 0, MAX_AUTHOR_CHAR_LENGTH)
    : undefined;
  if (title && title.trim()) {
    title = `$title: ${safeSubstring(title, 0)}\n`;
  } else {
    title = null;
  }
  const c = await renderPrefixSection({ dataSourceConfig, prefix: title });
  let metaPrefix: string | null = "";
  if (createdAt && isValidDate(createdAt)) {
    metaPrefix += `$createdAt: ${createdAt.toISOString()}\n`;
  }
  if (updatedAt && isValidDate(updatedAt)) {
    metaPrefix += `$updatedAt: ${updatedAt.toISOString()}\n`;
  }
  if (author && lastEditor && author === lastEditor) {
    metaPrefix += `$author: ${safeSubstring(author, 0)}\n`;
  } else {
    if (author) {
      metaPrefix += `$author: ${safeSubstring(author, 0)}\n`;
    }
    if (lastEditor) {
      metaPrefix += `$lastEditor: ${safeSubstring(lastEditor, 0)}\n`;
    }
  }
  if (additionalPrefixes) {
    for (const [key, value] of Object.entries(additionalPrefixes)) {
      metaPrefix += `$${key}: ${safeSubstring(value, 0, MAX_ADDITIONAL_PREFIXES_LENGTH)}\n`;
    }
  }
  if (metaPrefix) {
    c.prefix = c.prefix ? c.prefix + metaPrefix : metaPrefix;
  }
  if (content) {
    c.sections.push(content);
  }
  return c;
}

export type CoreAPIDataSourceDocumentSection = {
  prefix: string | null;
  content: string | null;
  sections: CoreAPIDataSourceDocumentSection[];
};

export function sectionFullText(
  section: CoreAPIDataSourceDocumentSection
): string {
  return (
    `${section.prefix || ""}${section.content || ""}` +
    section.sections.map(sectionFullText).join("")
  );
}

/* Compute document length by summing all prefix and content sizes for each section */
export function sectionLength(
  section: CoreAPIDataSourceDocumentSection
): number {
  return (
    (section.prefix ? section.prefix.length : 0) +
    (section.content ? section.content.length : 0) +
    section.sections.reduce((acc, s) => acc + sectionLength(s), 0)
  );
}

// Truncate a CoreAPIDataSourceDocumentSection to a given length
// Strategy:
// - If there are children sections, start the very last leaf section
// - Truncate the content until the total length is <= maxLength
// - If the total length is still > maxLength, truncate the prefix until the total length is <= maxLength
// - If the total length is still > maxLength, remove the last child section and try again
export function truncateSection(
  section: CoreAPIDataSourceDocumentSection,
  maxLength: number
): CoreAPIDataSourceDocumentSection {
  // Calculate current length
  const currentLength = sectionLength(section);
  const excessLength = currentLength - maxLength;

  // If already within limit, return unchanged
  if (excessLength <= 0) {
    return section;
  }
  const [result] = truncateSectionHelper(section, excessLength);

  return result;
}

function truncateSectionHelper(
  section: CoreAPIDataSourceDocumentSection,
  excessLength: number
): [CoreAPIDataSourceDocumentSection, number] {
  // Create a deep copy to avoid mutating the original
  const result: CoreAPIDataSourceDocumentSection = {
    prefix: section.prefix,
    content: section.content,
    sections: [...section.sections],
  };
  let currentExcessLength = excessLength;
  let truncatedLength = 0;

  // If there are child sections, start with truncating from the last leaf
  while (result.sections.length > 0 && currentExcessLength > 0) {
    // Work on the last child section
    const lastIndex = result.sections.length - 1;
    const lastSection = result.sections[lastIndex];

    if (!lastSection) {
      throw new Error("Unreachable");
    }

    // If the last section has children, recursively truncate it
    if (lastSection.sections.length > 0) {
      const [truncated, truncatedExcessLength] = truncateSectionHelper(
        lastSection,
        excessLength
      );

      truncatedLength += truncatedExcessLength;
      currentExcessLength -= truncatedExcessLength;

      // If the truncated section is empty (all content was removed), remove it entirely
      if (
        !truncated.prefix &&
        !truncated.content &&
        truncated.sections.length === 0
      ) {
        result.sections.pop();
      } else {
        result.sections[lastIndex] = truncated;
      }
    } else {
      // This is a leaf section, truncate its content first
      if (currentExcessLength > 0 && lastSection.content) {
        const len = lastSection.content.length;
        const toRemove = Math.min(len, currentExcessLength);
        lastSection.content = lastSection.content.slice(0, len - toRemove);
        truncatedLength += toRemove;
        currentExcessLength -= toRemove;
      }

      // If still exceeding after content truncation, truncate prefix
      if (currentExcessLength > 0 && lastSection.prefix) {
        const len = lastSection.prefix.length;
        const toRemove = Math.min(len, currentExcessLength);
        lastSection.prefix = lastSection.prefix.slice(0, len - toRemove);
        truncatedLength += toRemove;
        currentExcessLength -= toRemove;
      }

      // If still exceeding after both truncations, remove this leaf section entirely
      if (currentExcessLength > 0) {
        result.sections.pop();
      }
    }
  }

  // If we've removed all child sections but still exceed the limit,
  // truncate this section's content and prefix

  // Truncate content first
  if (currentExcessLength > 0 && result.content) {
    const len = result.content.length;
    const toRemove = Math.min(len, currentExcessLength);
    result.content = result.content.slice(0, len - toRemove);
    truncatedLength += toRemove;
    currentExcessLength -= toRemove;
  }

  // If still exceeding, truncate prefix
  if (currentExcessLength > 0 && result.prefix) {
    const len = result.prefix.length;
    const toRemove = Math.min(len, currentExcessLength);
    result.prefix = result.prefix.slice(0, len - toRemove);
    truncatedLength += toRemove;
    currentExcessLength -= toRemove;
  }

  return [result, truncatedLength];
}

export async function upsertDataSourceRemoteTable({
  dataSourceConfig,
  tableId,
  tableName,
  tableDescription,
  remoteDatabaseTableId,
  remoteDatabaseSecretId,
  loggerArgs,
  parents,
  parentId,
  title,
  mimeType,
  tags,
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
  tableName: string;
  tableDescription: string;
  remoteDatabaseTableId: string | null;
  remoteDatabaseSecretId: string | null;
  loggerArgs?: Record<string, string | number>;
  parents: string[];
  parentId: string | null;
  title: string;
  mimeType: string;
  tags?: string[];
}) {
  const localLogger = logger.child({ ...loggerArgs, tableId, tableName });
  const statsDTags = [
    `data_source_id:${dataSourceConfig.dataSourceId}`,
    `workspace_id:${dataSourceConfig.workspaceId}`,
  ];

  localLogger.info("Attempting to upsert table to Dust.");
  statsDClient.increment(
    "data_source_table_upserts_attempt.count",
    1,
    statsDTags
  );

  const now = new Date();

  const endpoint =
    `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/tables`;
  const dustRequestPayload: UpsertDatabaseTableRequestType = {
    name: tableName,
    parents,
    parent_id: parentId,
    description: tableDescription,
    table_id: tableId,
    remote_database_table_id: remoteDatabaseTableId,
    remote_database_secret_id: remoteDatabaseSecretId,
    title: safeSubstring(title, 0, MAX_TITLE_LENGTH),
    mime_type: mimeType,
    tags: tags,
  };
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
    validateStatus: null,
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axiosWithTimeout.post(
      endpoint,
      dustRequestPayload,
      dustRequestConfig
    );
  } catch (e) {
    const elapsed = new Date().getTime() - now.getTime();
    statsDClient.increment(
      "data_source_table_upserts_error.count",
      1,
      statsDTags
    );
    statsDClient.distribution(
      "data_source_table_upserts_error.duration.distribution",
      elapsed,
      statsDTags
    );
    if (axios.isAxiosError(e)) {
      const sanitizedError = {
        ...e,
        config: { ...e.config, data: undefined },
      };
      localLogger.error(
        {
          error: sanitizedError,
          payload: {
            ...dustRequestPayload,
          },
        },
        "Axios error upserting table to Dust."
      );
    } else if (e instanceof Error) {
      localLogger.error(
        {
          error: e.message,
          payload: {
            ...dustRequestPayload,
          },
        },
        "Error upserting table to Dust."
      );
    } else {
      localLogger.error("Unknown error upserting table to Dust.");
    }

    throw new Error("Error upserting table to Dust.");
  }

  const elapsed = new Date().getTime() - now.getTime();

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    statsDClient.increment(
      "data_source_table_upserts_success.count",
      1,
      statsDTags
    );
    statsDClient.distribution(
      "data_source_table_upserts_success.duration.distribution",
      elapsed,
      statsDTags
    );
    localLogger.info("Successfully uploaded table to Dust.");
  } else {
    statsDClient.increment(
      "data_source_table_upserts_error.count",
      1,
      statsDTags
    );
    statsDClient.distribution(
      "data_source_table_upserts_error.duration.distribution",
      elapsed,
      statsDTags
    );
    localLogger.error(
      {
        status: dustRequestResult.status,
        elapsed,
      },
      "Error upserting table to Dust."
    );
    throw new Error(
      `Error uploading to dust, got ${
        dustRequestResult.status
      }: ${JSON.stringify(dustRequestResult.data, null, 2)}`
    );
  }
}

/**
 * Helper function to handle table errors gracefully.
 * Executes the provided function and catches any TablesError, allowing the application to continue.
 * Other errors are re-thrown.
 *
 * @param fn - Async function to execute that may throw a TablesError
 * @returns The TablesError that was caught if any, null otherwise.
 * @throws Any non-TablesError that occurs during execution
 */

export const ignoreTablesError = async (
  connectorName: string,
  fn: () => Promise<void>
): Promise<TablesError | null> => {
  try {
    await fn();
    logger.info(`[${connectorName}] Table upserted successfully.`);
    return null;
  } catch (err) {
    if (err instanceof TablesError) {
      logger.warn(
        { error: err },
        "Invalid rows detected - skipping (but not failing)."
      );
      return err;
    } else {
      logger.error(
        { error: err },
        `[${connectorName}] Failed to upsert table.`
      );
      throw err;
    }
  }
};

export async function upsertDataSourceTableFromCsv({
  dataSourceConfig,
  tableId,
  tableName,
  tableDescription,
  tableCsv,
  loggerArgs,
  truncate,
  parents,
  parentId,
  title,
  mimeType,
  sourceUrl,
  tags,
  allowEmptySchema,
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
  tableName: string;
  tableDescription: string;
  tableCsv: string;
  loggerArgs?: Record<string, string | number>;
  truncate: boolean;
  parents: string[];
  parentId: string | null;
  title: string;
  mimeType: string;
  sourceUrl?: string;
  tags?: string[];
  allowEmptySchema?: boolean;
}) {
  const localLogger = logger.child({ ...loggerArgs, tableId, tableName });
  const statsDTags = [
    `data_source_id:${dataSourceConfig.dataSourceId}`,
    `workspace_id:${dataSourceConfig.workspaceId}`,
  ];

  localLogger.info("Attempting to upload table to Dust.");
  statsDClient.increment(
    "data_source_structured_data_upserts_attempt.count",
    1,
    statsDTags
  );

  const now = new Date();
  const blob = new Blob([tableCsv]);

  if (blob.size > MAX_CSV_SIZE) {
    throw new TablesError(
      "file_too_large",
      "The file is too large to be processed."
    );
  }

  const dustAPI = getDustAPI(dataSourceConfig);

  const fileRes = await dustAPI.uploadFile({
    contentType: "text/csv",
    fileName: `${tableId}.csv`,
    fileSize: blob.size,
    useCase: "upsert_table",
    fileObject: new File([blob], `${tableId}.csv`, { type: "text/csv" }),
  });
  if (fileRes.isErr()) {
    throw fileRes.error;
  }

  const endpoint =
    `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/tables/csv`;
  const dustRequestPayload: UpsertTableFromCsvRequestType = {
    name: tableName,
    parentId,
    parents,
    description: tableDescription,
    fileId: fileRes.value.id,
    tableId,
    truncate,
    async: true,
    title: safeSubstring(title, 0, MAX_TITLE_LENGTH),
    mimeType,
    timestamp: null,
    tags: tags ?? null,
    sourceUrl: sourceUrl ?? null,
    allowEmptySchema,
  };
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
    validateStatus: null,
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axiosWithTimeout.post(
      endpoint,
      dustRequestPayload,
      dustRequestConfig
    );
  } catch (e) {
    const elapsed = new Date().getTime() - now.getTime();
    statsDClient.increment(
      "data_source_structured_data_upserts_error.count",
      1,
      statsDTags
    );
    statsDClient.distribution(
      "data_source_structured_data_upserts_error.duration.distribution",
      elapsed,
      statsDTags
    );
    if (axios.isAxiosError(e)) {
      const sanitizedError = {
        ...e,
        config: { ...e.config, data: undefined },
      };
      localLogger.error(
        {
          error: sanitizedError,
          payload: {
            ...dustRequestPayload,
            csv: tableCsv.substring(0, 100),
          },
        },
        "Axios error uploading table to Dust."
      );
    } else if (e instanceof Error) {
      localLogger.error(
        {
          error: e.message,
          payload: {
            ...dustRequestPayload,
            csv: tableCsv.substring(0, 100),
          },
        },
        "Error uploading table to Dust."
      );
    } else {
      localLogger.error("Unknown error uploading table to Dust.");
    }

    throw new Error("Error uploading table to Dust.");
  }

  const elapsed = new Date().getTime() - now.getTime();

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    statsDClient.increment(
      "data_source_structured_data_upserts_success.count",
      1,
      statsDTags
    );
    statsDClient.distribution(
      "data_source_structured_data_upserts_success.duration.distribution",
      elapsed,
      statsDTags
    );
    localLogger.info("Successfully uploaded table to Dust.");
  } else {
    statsDClient.increment(
      "data_source_structured_data_upserts_error.count",
      1,
      statsDTags
    );
    statsDClient.distribution(
      "data_source_structured_data_upserts_error.duration.distribution",
      elapsed,
      statsDTags
    );
    localLogger.error(
      {
        status: dustRequestResult.status,
        elapsed,
      },
      "Error uploading table to Dust."
    );
    if (
      dustRequestResult.status === 400 &&
      dustRequestResult.data.error?.type === "invalid_rows_request_error"
    ) {
      throw new TablesError(
        "invalid_csv",
        dustRequestResult.data.error.message
      );
    } else if (dustRequestResult.status === 413) {
      throw new TablesError(
        "file_too_large",
        dustRequestResult.data.error?.message ||
          "File size exceeds the maximum limit"
      );
    } else {
      throw new Error(
        `Error uploading table to dust, got ${
          dustRequestResult.status
        }: ${JSON.stringify(dustRequestResult.data, null, 2)}`
      );
    }
  }
}

export async function deleteDataSourceTableRow({
  dataSourceConfig,
  tableId,
  rowId,
  loggerArgs,
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
  rowId: string;
  loggerArgs?: Record<string, string | number>;
}) {
  const localLogger = logger.child({
    ...loggerArgs,
    tableId,
    rowId,
  });
  const statsDTags = [
    `data_source_id:${dataSourceConfig.dataSourceId}`,
    `workspace_id:${dataSourceConfig.workspaceId}`,
  ];

  localLogger.info("Attempting to delete table from Dust.");
  statsDClient.increment(
    "data_source_structured_data_deletes_attempt.count",
    1,
    statsDTags
  );

  const now = new Date();

  const endpoint =
    `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/tables/${tableId}/rows/${rowId}`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
    validateStatus: null,
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axiosWithTimeout.delete(
      endpoint,
      dustRequestConfig
    );
  } catch (e) {
    const elapsed = new Date().getTime() - now.getTime();
    statsDClient.increment(
      "data_source_structured_data_deletes_error.count",
      1,
      statsDTags
    );
    statsDClient.distribution(
      "data_source_structured_data_deletes_error.duration.distribution",
      elapsed,
      statsDTags
    );
    localLogger.error({ error: e }, "Error deleting table from Dust.");
    throw e;
  }

  const elapsed = new Date().getTime() - now.getTime();

  if (dustRequestResult.status === 404) {
    localLogger.info("Table doesn't exist on Dust. Ignoring.");
    return;
  }

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    statsDClient.increment(
      "data_source_structured_data_deletes_success.count",
      1,
      statsDTags
    );

    localLogger.info("Successfully deleted table from Dust.");
  } else {
    statsDClient.increment(
      "data_source_structured_data_deletes_error.count",
      1,
      statsDTags
    );
    statsDClient.distribution(
      "data_source_structured_data_deletes_error.duration.distribution",
      elapsed,
      statsDTags
    );
    localLogger.error(
      {
        status: dustRequestResult.status,
        elapsed,
      },
      "Error deleting table from Dust."
    );
    throw new Error(`Error deleting from dust: ${dustRequestResult}`);
  }
}

export const getDataSourceTable = withRetries(logger, _getDataSourceTable, {
  retries: 3,
});

async function _getDataSourceTable({
  dataSourceConfig,
  tableId,
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
}): Promise<GetTableResponseType["table"] | undefined> {
  const localLogger = logger.child({
    tableId,
  });

  const endpoint =
    `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/tables/${tableId}`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse<GetTableResponseType>;
  try {
    dustRequestResult = await axiosWithTimeout.get<GetTableResponseType>(
      endpoint,
      dustRequestConfig
    );
  } catch (e) {
    const axiosError = e as AxiosError;
    if (axiosError?.response?.status === 404) {
      localLogger.info("Table doesn't exist on Dust. Ignoring.");
      return;
    }
    localLogger.error({ error: e }, "Error getting table from Dust.");
    throw e;
  }

  return dustRequestResult.data.table;
}

export async function deleteDataSourceTable({
  dataSourceConfig,
  tableId,
  loggerArgs,
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
  loggerArgs?: Record<string, string | number>;
}) {
  const localLogger = logger.child({
    ...loggerArgs,
    tableId,
  });
  const statsDTags = [
    `data_source_id:${dataSourceConfig.dataSourceId}`,
    `workspace_id:${dataSourceConfig.workspaceId}`,
  ];

  localLogger.info("Attempting to delete table from Dust.");
  statsDClient.increment(
    "data_source_structured_data_deletes_attempt.count",
    1,
    statsDTags
  );

  const now = new Date();

  const endpoint =
    `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/tables/${tableId}`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
    validateStatus: null,
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axiosWithTimeout.delete(
      endpoint,
      dustRequestConfig
    );
  } catch (e) {
    const elapsed = new Date().getTime() - now.getTime();
    statsDClient.increment(
      "data_source_structured_data_deletes_error.count",
      1,
      statsDTags
    );
    statsDClient.distribution(
      "data_source_structured_data_deletes_error.duration.distribution",
      elapsed,
      statsDTags
    );
    localLogger.error({ error: e }, "Error deleting table from Dust.");
    throw e;
  }

  const elapsed = new Date().getTime() - now.getTime();

  if (dustRequestResult.status === 404) {
    localLogger.info("Table doesn't exist on Dust. Ignoring.");
    return;
  }

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    statsDClient.increment(
      "data_source_structured_data_deletes_success.count",
      1,
      statsDTags
    );

    localLogger.info("Successfully deleted table from Dust.");
  } else {
    statsDClient.increment(
      "data_source_structured_data_deletes_error.count",
      1,
      statsDTags
    );
    statsDClient.distribution(
      "data_source_structured_data_deletes_error.duration.distribution",
      elapsed,
      statsDTags
    );
    localLogger.error(
      {
        status: dustRequestResult.status,
        elapsed,
      },
      "Error deleting table from Dust."
    );
    throw new Error(`Error deleting from dust: ${dustRequestResult}`);
  }
}

export const getDataSourceFolder = withRetries(logger, _getDataSourceFolder, {
  retries: 3,
});

export async function _getDataSourceFolder({
  dataSourceConfig,
  folderId,
}: {
  dataSourceConfig: DataSourceConfig;
  folderId: string;
}): Promise<GetFolderResponseType["folder"] | undefined> {
  const localLogger = logger.child({
    folderId,
  });

  const endpoint =
    `${apiConfig.getDustFrontInternalAPIUrl()}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/folders/${folderId}`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse<GetFolderResponseType>;
  try {
    dustRequestResult = await axiosWithTimeout.get(endpoint, dustRequestConfig);
  } catch (e) {
    const axiosError = e as AxiosError;
    if (axiosError?.response?.status === 404) {
      localLogger.info("Folder doesn't exist on Dust. Ignoring.");
      return;
    }
    localLogger.error({ error: e }, "Error getting folder from Dust.");
    throw e;
  }

  return dustRequestResult.data.folder;
}

export const upsertDataSourceFolder = withRetries(
  logger,
  _upsertDataSourceFolder,
  {
    retries: 3,
  }
);

export async function _upsertDataSourceFolder({
  dataSourceConfig,
  folderId,
  timestampMs,
  parents,
  parentId,
  title,
  mimeType,
  sourceUrl,
  providerVisibility,
}: {
  dataSourceConfig: DataSourceConfig;
  folderId: string;
  timestampMs?: number;
  parents: string[];
  parentId: string | null;
  title: string;
  mimeType: string;
  sourceUrl?: string;
  providerVisibility?: ProviderVisibility;
}) {
  const now = new Date();

  const r = await getDustAPI(dataSourceConfig).upsertFolder({
    dataSourceId: dataSourceConfig.dataSourceId,
    folderId,
    timestamp: timestampMs ? timestampMs : now.getTime(),
    title: safeSubstring(title, 0, MAX_TITLE_LENGTH),
    parentId,
    parents,
    mimeType,
    sourceUrl: sourceUrl ?? null,
    providerVisibility: providerVisibility || null,
  });

  if (r.isErr()) {
    throw r.error;
  }
}

export async function deleteDataSourceFolder({
  dataSourceConfig,
  folderId,
}: {
  dataSourceConfig: DataSourceConfig;
  folderId: string;
  loggerArgs?: Record<string, string | number>;
}) {
  const r = await getDustAPI(dataSourceConfig).deleteFolder({
    dataSourceId: dataSourceConfig.dataSourceId,
    folderId,
  });

  if (r.isErr()) {
    throw r.error;
  }
}
