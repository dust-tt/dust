import type {
  CoreAPIDataSourceDocumentSection,
  CoreAPITable,
  PostDataSourceDocumentRequestBody,
} from "@dust-tt/types";
import {
  DustAPI,
  isValidDate,
  safeSubstring,
  sectionFullText,
} from "@dust-tt/types";
import { MAX_CHUNK_SIZE } from "@dust-tt/types";
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import axios from "axios";
import tracer from "dd-trace";
import http from "http";
import https from "https";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";

import { apiConfig } from "@connectors/lib/api/config";
import { withRetries } from "@connectors/lib/dust_front_api_helpers";
import {
  DustConnectorWorkflowError,
  InvalidRowsRequestError,
} from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const axiosWithTimeout = axios.create({
  timeout: 60000,
  // Ensure client timeout is lower than the target server timeout.
  // See --keepAliveTimeout in next start command from front.
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false }),
});

const { DUST_FRONT_API } = process.env;
if (!DUST_FRONT_API) {
  throw new Error("FRONT_API not set");
}

// We limit the document size we support. Beyond a certain size, upsert is simply too slow (>300s)
// and large files are generally less useful anyway.
export const MAX_DOCUMENT_TXT_LEN = 750000;
// For some data sources we allow small documents only to be processed.
export const MAX_SMALL_DOCUMENT_TXT_LEN = 500000;
// For some data sources we allow large documents (5mb) to be processed (behind flag).
export const MAX_LARGE_DOCUMENT_TXT_LEN = 5000000;

export const MAX_FILE_SIZE_TO_DOWNLOAD = 128 * 1024 * 1024;

type UpsertContext = {
  sync_type: "batch" | "incremental";
};

type UpsertToDataSourceParams = {
  dataSourceConfig: DataSourceConfig;
  documentId: string;
  documentContent: CoreAPIDataSourceDocumentSection;
  documentUrl?: string;
  timestampMs?: number;
  tags?: string[];
  parents: string[];
  loggerArgs?: Record<string, string | number>;
  upsertContext: UpsertContext;
  async: boolean;
};

export const upsertToDatasource = withRetries(_upsertToDatasource);

async function _upsertToDatasource({
  dataSourceConfig,
  documentId,
  documentContent,
  documentUrl,
  timestampMs,
  tags,
  parents,
  loggerArgs = {},
  upsertContext,
  async,
}: UpsertToDataSourceParams) {
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

      const localLogger = logger.child({
        ...loggerArgs,
        documentId,
        documentUrl,
        documentLength: sectionFullText(documentContent).length,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
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

      const endpoint =
        `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}` +
        `/data_sources/${dataSourceConfig.dataSourceId}/documents/${documentId}`;
      const dustRequestPayload: PostDataSourceDocumentRequestBody = {
        text: null,
        section: documentContent,
        source_url: documentUrl,
        timestamp: timestampMs,
        tags: tags?.map((tag) => tag.substring(0, 512)),
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

export async function deleteFromDataSource(
  dataSourceConfig: DataSourceConfig,
  documentId: string,
  loggerArgs: Record<string, string | number> = {}
) {
  const localLogger = logger.child({ ...loggerArgs, documentId });

  const endpoint =
    `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}` +
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

export const updateDocumentParentsField = withRetries(
  _updateDocumentParentsField
);

async function _updateDocumentParentsField({
  documentId,
  ...params
}: {
  dataSourceConfig: DataSourceConfig;
  documentId: string;
  parents: string[];
  loggerArgs?: Record<string, string | number>;
}) {
  return _updateDocumentOrTableParentsField({
    ...params,
    tableOrDocument: "document",
    id: documentId,
  });
}

export const updateTableParentsField = withRetries(_updateTableParentsField);

async function _updateTableParentsField({
  tableId,
  ...params
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
  parents: string[];
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
  loggerArgs = {},
  tableOrDocument,
}: {
  dataSourceConfig: DataSourceConfig;
  id: string;
  parents: string[];
  loggerArgs?: Record<string, string | number>;
  tableOrDocument: "document" | "table";
}) {
  const localLogger =
    tableOrDocument === "document"
      ? logger.child({ ...loggerArgs, documentId: id })
      : logger.child({ ...loggerArgs, tableId: id });
  const endpoint =
    `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}` +
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

async function tokenize(text: string, ds: DataSourceConfig) {
  const dustAPI = new DustAPI(
    apiConfig.getDustAPIConfig(),
    {
      apiKey: ds.workspaceAPIKey,
      workspaceId: ds.workspaceId,
    },
    logger,
    { useLocalInDev: true }
  );
  const tokensRes = await dustAPI.tokenize(text, ds.dataSourceId);
  if (tokensRes.isErr()) {
    logger.error(
      { error: tokensRes.error },
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
  content,
}: {
  dataSourceConfig: DataSourceConfig;
  title: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  author?: string;
  lastEditor?: string;
  content: CoreAPIDataSourceDocumentSection | null;
}): Promise<CoreAPIDataSourceDocumentSection> {
  author = author
    ? safeSubstring(author, 0, MAX_AUTHOR_CHAR_LENGTH)
    : undefined;
  lastEditor = lastEditor
    ? safeSubstring(lastEditor, 0, MAX_AUTHOR_CHAR_LENGTH)
    : undefined;
  if (title && title.trim()) {
    title = `$title: ${title}\n`;
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
    metaPrefix += `$author: ${author}\n`;
  } else {
    if (author) {
      metaPrefix += `$author: ${author}\n`;
    }
    if (lastEditor) {
      metaPrefix += `$lastEditor: ${lastEditor}\n`;
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

export async function upsertTable({
  dataSourceConfig,
  tableId,
  tableName,
  tableDescription,
  remoteDatabaseTableId,
  remoteDatabaseSecretId,
  loggerArgs,
  parents,
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
  tableName: string;
  tableDescription: string;
  remoteDatabaseTableId: string | null;
  remoteDatabaseSecretId: string | null;
  loggerArgs?: Record<string, string | number>;
  parents: string[];
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
    `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/tables`;
  const dustRequestPayload = {
    name: tableName,
    parents,
    description: tableDescription,
    table_id: tableId,
    remote_database_table_id: remoteDatabaseTableId,
    remote_database_secret_id: remoteDatabaseSecretId,
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

export async function upsertTableFromCsv({
  dataSourceConfig,
  tableId,
  tableName,
  tableDescription,
  tableCsv,
  loggerArgs,
  truncate,
  parents,
  useAppForHeaderDetection,
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
  tableName: string;
  tableDescription: string;
  tableCsv: string;
  loggerArgs?: Record<string, string | number>;
  truncate: boolean;
  parents: string[];
  useAppForHeaderDetection?: boolean;
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

  const endpoint =
    `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/tables/csv`;
  const dustRequestPayload = {
    name: tableName,
    parents,
    description: tableDescription,
    csv: tableCsv,
    tableId,
    truncate,
    async: true,
    useAppForHeaderDetection,
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
            csv: dustRequestPayload.csv.substring(0, 100),
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
            csv: dustRequestPayload.csv.substring(0, 100),
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
      throw new InvalidRowsRequestError(dustRequestResult.data.error.message);
    }
    throw new Error(
      `Error uploading to dust, got ${
        dustRequestResult.status
      }: ${JSON.stringify(dustRequestResult.data, null, 2)}`
    );
  }
}

export async function deleteTableRow({
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
    `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}` +
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

export async function getTable({
  dataSourceConfig,
  tableId,
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
}): Promise<CoreAPITable | undefined> {
  const localLogger = logger.child({
    tableId,
  });

  const endpoint =
    `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}` +
    `/data_sources/${dataSourceConfig.dataSourceId}/tables/${tableId}`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axiosWithTimeout.get(endpoint, dustRequestConfig);
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

export async function deleteTable({
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
    `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}` +
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
