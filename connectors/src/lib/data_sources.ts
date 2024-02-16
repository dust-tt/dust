import type {
  CoreAPIDataSourceDocumentSection,
  PostDataSourceDocumentRequestBody,
} from "@dust-tt/types";
import {
  DustAPI,
  EMBEDDING_CONFIG,
  safeSubstring,
  sectionFullText,
} from "@dust-tt/types";
import type { AxiosRequestConfig, AxiosResponse } from "axios";
import axios from "axios";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";

import { withRetries } from "@connectors/lib/dust_front_api_helpers";
import logger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const { DUST_FRONT_API } = process.env;
if (!DUST_FRONT_API) {
  throw new Error("FRONT_API not set");
}

// We limit the document size we support. Beyond a certain size, upsert is simply too slow (>300s)
// and large files are generally less useful anyway.
export const MAX_DOCUMENT_TXT_LEN = 750000;

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
}: UpsertToDataSourceParams) {
  const localLogger = logger.child({
    ...loggerArgs,
    documentId,
    documentUrl,
    documentLength: sectionFullText(documentContent).length,
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceName: dataSourceConfig.dataSourceName,
    parents,
  });
  const statsDTags = [
    `data_source_name:${dataSourceConfig.dataSourceName}`,
    `workspace_id:${dataSourceConfig.workspaceId}`,
  ];

  localLogger.info("Attempting to upload document to Dust.");
  statsDClient.increment("data_source_upserts_attempt.count", 1, statsDTags);

  const now = new Date();

  const urlSafeName = encodeURIComponent(dataSourceConfig.dataSourceName);
  const endpoint = `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}/data_sources/${urlSafeName}/documents/${documentId}`;
  const dustRequestPayload: PostDataSourceDocumentRequestBody = {
    text: null,
    section: documentContent,
    source_url: documentUrl,
    timestamp: timestampMs,
    tags: tags?.map((tag) => tag.substring(0, 512)),
    parents,
    light_document_output: true,
    upsert_context: upsertContext,
  };
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axios.post(
      endpoint,
      dustRequestPayload,
      dustRequestConfig
    );
  } catch (e) {
    const elapsed = new Date().getTime() - now.getTime();
    if (axios.isAxiosError(e) && e.config?.data) {
      e.config.data = "[REDACTED]";
    }
    statsDClient.increment("data_source_upserts_error.count", 1, statsDTags);
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
    statsDClient.increment("data_source_upserts_success.count", 1, statsDTags);
    statsDClient.distribution(
      "data_source_upserts_success.duration.distribution",
      elapsed,
      statsDTags
    );
    localLogger.info("Successfully uploaded document to Dust.");
  } else {
    statsDClient.increment("data_source_upserts_error.count", 1, statsDTags);
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
    throw new Error(`Error uploading to dust: ${dustRequestResult}`);
  }
}

export async function deleteFromDataSource(
  dataSourceConfig: DataSourceConfig,
  documentId: string,
  loggerArgs: Record<string, string | number> = {}
) {
  const localLogger = logger.child({ ...loggerArgs, documentId });

  const urlSafeName = encodeURIComponent(dataSourceConfig.dataSourceName);
  const endpoint = `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}/data_sources/${urlSafeName}/documents/${documentId}`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axios.delete(endpoint, dustRequestConfig);
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
  dataSourceConfig,
  documentId,
  parents,
  loggerArgs = {},
}: {
  dataSourceConfig: DataSourceConfig;
  documentId: string;
  parents: string[];
  loggerArgs?: Record<string, string | number>;
}) {
  const localLogger = logger.child({ ...loggerArgs, documentId });
  const urlSafeName = encodeURIComponent(dataSourceConfig.dataSourceName);
  const endpoint = `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}/data_sources/${urlSafeName}/documents/${documentId}/parents`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axios.post(
      endpoint,
      {
        parents: parents,
      },
      dustRequestConfig
    );
  } catch (e) {
    localLogger.error({ error: e }, "Error updating document parents field.");
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
      "Error updating document parents field."
    );
    throw new Error(
      `Error updating document parents field: ${dustRequestResult}`
    );
  }
}

// allows for 4 full prefixes before hitting half of the max chunk size (approx.
// 256 chars for 512 token chunks)
const MAX_PREFIX_TOKENS = EMBEDDING_CONFIG.max_chunk_size / 8;
// Limit on chars to avoid tokenizing too much text uselessly on documents with
// large prefixes. The final truncating will rely on MAX_PREFIX_TOKENS so this
// limit can be large and should be large to avoid underusing prexfixes
const MAX_PREFIX_CHARS = MAX_PREFIX_TOKENS * 8;

// The role of this function is to create a prefix from an arbitrary long string. The prefix
// provided will not be augmented with `\n`, so it should include appropriate carriage return. If
// the prefix is too long (> MAX_PREFIX_TOKENS), it will be truncated. The remained will be returned as
// content of the resulting section.
export async function renderPrefixSection(
  dataSourceConfig: DataSourceConfig,
  prefix: string | null
): Promise<CoreAPIDataSourceDocumentSection> {
  if (!prefix || !prefix.trim()) {
    return {
      prefix: null,
      content: null,
      sections: [],
    };
  }
  let targetPrefix = safeSubstring(prefix, 0, MAX_PREFIX_CHARS);
  let targetContent =
    prefix.length > MAX_PREFIX_CHARS
      ? safeSubstring(prefix, MAX_PREFIX_CHARS)
      : "";

  const tokens = await tokenize(targetPrefix, dataSourceConfig);

  targetPrefix = tokens
    .slice(0, MAX_PREFIX_TOKENS)
    .map((t) => t[1])
    .join("");
  targetContent =
    tokens
      .slice(MAX_PREFIX_TOKENS)
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
    {
      apiKey: ds.workspaceAPIKey,
      workspaceId: ds.workspaceId,
    },
    logger,
    { useLocalInDev: true }
  );
  const tokensRes = await dustAPI.tokenize(text, ds.dataSourceName);
  if (tokensRes.isErr()) {
    logger.error(
      { error: tokensRes.error },
      `Error tokenizing text for ${ds.dataSourceName}`
    );
    throw new Error(`Error tokenizing text for ${ds.dataSourceName}`);
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

      const c = await renderPrefixSection(
        dsConfig,
        toMarkdown(child, { extensions: [gfmToMarkdown()] })
      );
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
  const c = await renderPrefixSection(dataSourceConfig, title);
  let metaPrefix: string | null = "";
  if (createdAt) {
    metaPrefix += `$createdAt: ${createdAt.toISOString()}\n`;
  }
  if (updatedAt) {
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

export async function upsertTableFromCsv({
  dataSourceConfig,
  tableId,
  tableName,
  tableDescription,
  tableCsv,
  loggerArgs,
  truncate,
}: {
  dataSourceConfig: DataSourceConfig;
  tableId: string;
  tableName: string;
  tableDescription: string;
  tableCsv: string;
  loggerArgs?: Record<string, string | number>;
  truncate: boolean;
}) {
  const localLogger = logger.child({ ...loggerArgs, tableId, tableName });
  const statsDTags = [
    `data_source_name:${dataSourceConfig.dataSourceName}`,
    `workspace_id:${dataSourceConfig.workspaceId}`,
  ];

  localLogger.info("Attempting to upload structured data to Dust.");
  statsDClient.increment(
    "data_source_structured_data_upserts_attempt.count",
    1,
    statsDTags
  );

  const now = new Date();

  const urlSafeName = encodeURIComponent(dataSourceConfig.dataSourceName);
  const endpoint = `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}/data_sources/${urlSafeName}/tables/csv`;
  const dustRequestPayload = {
    name: tableName,
    description: tableDescription,
    csv: tableCsv,
    tableId,
    truncate,
  };
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axios.post(
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
    localLogger.error({ error: e }, "Error uploading structured data to Dust.");
    throw e;
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
    localLogger.info("Successfully uploaded structured data to Dust.");
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
      "Error uploading structured data to Dust."
    );
    throw new Error(`Error uploading to dust: ${dustRequestResult}`);
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
    `data_source_name:${dataSourceConfig.dataSourceName}`,
    `workspace_id:${dataSourceConfig.workspaceId}`,
  ];

  localLogger.info("Attempting to delete structured data from Dust.");
  statsDClient.increment(
    "data_source_structured_data_deletes_attempt.count",
    1,
    statsDTags
  );

  const now = new Date();

  const urlSafeName = encodeURIComponent(dataSourceConfig.dataSourceName);
  const endpoint = `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}/data_sources/${urlSafeName}/tables/${tableId}/rows/${rowId}`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axios.delete(endpoint, dustRequestConfig);
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
    localLogger.error(
      { error: e },
      "Error deleting structured data from Dust."
    );
    throw e;
  }

  const elapsed = new Date().getTime() - now.getTime();

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    statsDClient.increment(
      "data_source_structured_data_deletes_success.count",
      1,
      statsDTags
    );

    localLogger.info("Successfully deleted structured data from Dust.");
  } else {
    if (dustRequestResult.status === 404) {
      localLogger.info("Structured data doesn't exist on Dust. Ignoring.");
      return;
    }
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
      "Error deleting structured data from Dust."
    );
    throw new Error(`Error deleting from dust: ${dustRequestResult}`);
  }
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
    `data_source_name:${dataSourceConfig.dataSourceName}`,
    `workspace_id:${dataSourceConfig.workspaceId}`,
  ];

  localLogger.info("Attempting to delete structured data from Dust.");
  statsDClient.increment(
    "data_source_structured_data_deletes_attempt.count",
    1,
    statsDTags
  );

  const now = new Date();

  const urlSafeName = encodeURIComponent(dataSourceConfig.dataSourceName);
  const endpoint = `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}/data_sources/${urlSafeName}/tables/${tableId}`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axios.delete(endpoint, dustRequestConfig);
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
    localLogger.error(
      { error: e },
      "Error deleting structured data from Dust."
    );
    throw e;
  }

  const elapsed = new Date().getTime() - now.getTime();

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    statsDClient.increment(
      "data_source_structured_data_deletes_success.count",
      1,
      statsDTags
    );

    localLogger.info("Successfully deleted structured data from Dust.");
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
      "Error deleting structured data from Dust."
    );
    throw new Error(`Error deleting from dust: ${dustRequestResult}`);
  }
}
