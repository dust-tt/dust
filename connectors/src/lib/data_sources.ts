import type {
  cacheWithRedis,
  CoreAPI,
  CoreAPIDataSourceDocumentSection,
  CoreAPITokenType,
  EMBEDDING_CONFIG,
  PostDataSourceDocumentRequestBody,
} from "@dust-tt/types";
import { sectionFullText } from "@dust-tt/types";
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
  let finalPrefix = prefix;
  if (prefix.length > MAX_PREFIX_CHARS) {
    finalPrefix = prefix.substring(0, MAX_PREFIX_CHARS);
  }
  const tokens = (await tokenize(finalPrefix, dataSourceConfig)).map(
    (token) => token[1]
  );
  if (tokens.length <= MAX_PREFIX_TOKENS) {
    return {
      prefix: prefix,
      content: null,
      sections: [],
    };
  }
  const prefixTextLength =
    tokens.slice(0, MAX_PREFIX_TOKENS).reduce((acc, t) => acc + t.length, 0) -
    4; // account for the ellipsis
  return {
    prefix: prefix.substring(0, prefixTextLength) + "...\n",
    content: `...${prefix.substring(prefixTextLength)}`,
    sections: [],
  };
}

async function _tokenize(
  text: string,
  dataSourceConfig: DataSourceConfig
): Promise<CoreAPITokenType[]> {
  const localLogger = logger.child({ text });
  const urlSafeName = encodeURIComponent(dataSourceConfig.dataSourceName);
  const endpoint = `${DUST_FRONT_API}/api/v1/w/${dataSourceConfig.workspaceId}/data_sources/${urlSafeName}/tokenize`;
  const dustRequestConfig: AxiosRequestConfig = {
    headers: {
      Authorization: `Bearer ${dataSourceConfig.workspaceAPIKey}`,
    },
  };

  let dustRequestResult: AxiosResponse;
  try {
    dustRequestResult = await axios.post(endpoint, { text }, dustRequestConfig);
  } catch (e) {
    localLogger.error({ error: e }, "Error tokenizing text.");
    throw e;
  }

  if (dustRequestResult.status >= 200 && dustRequestResult.status < 300) {
    return dustRequestResult.data.tokens;
  } else {
    localLogger.error(
      {
        status: dustRequestResult.status,
        data: dustRequestResult.data,
      },
      "Error tokenizing text."
    );
    throw new Error(`Error tokenizing text: ${dustRequestResult}`);
  }
}
const tokenize = cacheWithRedis(
  _tokenize,
  (text, ds) => `tokenize:${text}-${ds.dataSourceName}-${ds.workspaceId}`,
  60 * 60 * 24
);

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
  if (title && title.trim()) {
    title = `$title: ${title}\n`;
  } else {
    title = null;
  }
  const titleSection = title
    ? await renderPrefixSection(dataSourceConfig, title)
    : null;
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
  const metaSection = metaPrefix
    ? await renderPrefixSection(dataSourceConfig, metaPrefix)
    : null;
  if (metaSection && titleSection) {
    titleSection.sections.push(metaSection);

    if (content) {
      metaSection.sections.push(content);
    }
    return titleSection;
  } else if (metaSection) {
    if (content) {
      metaSection.sections.push(content);
    }
    return metaSection;
  } else if (titleSection) {
    if (content) {
      titleSection.sections.push(content);
    }
    return titleSection;
  }
  return {
    prefix: null,
    content: null,
    sections: content ? [content] : [],
  };
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
