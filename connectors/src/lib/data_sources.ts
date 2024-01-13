import {
  CoreAPIDataSourceDocumentSection,
  PostDataSourceDocumentRequestBody,
  sectionFullText,
} from "@dust-tt/types";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfm } from "micromark-extension-gfm";

import { withRetries } from "@connectors/lib/dust_front_api_helpers";
import logger from "@connectors/logger/logger";
import { statsDClient } from "@connectors/logger/withlogging";
import { DataSourceConfig } from "@connectors/types/data_source_config";

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

const MAX_SECTION_PREFIX_LENGTH = 192;

// The role of this function is to create a prefix from an arbitrary long string. The prefix
// provided will not be augmented with `\n`, so it should include appropriate carriage return. If
// the prefix is too long (>256 chars), it will be truncated. The remained will be returned as
// content of the resulting section.
export function renderPrefixSection(
  prefix: string | null
): CoreAPIDataSourceDocumentSection {
  if (!prefix || !prefix.trim()) {
    return {
      prefix: null,
      content: null,
      sections: [],
    };
  }
  if (prefix.length > MAX_SECTION_PREFIX_LENGTH) {
    return {
      prefix: prefix.substring(0, MAX_SECTION_PREFIX_LENGTH) + "...\n",
      content: `... ${prefix.substring(MAX_SECTION_PREFIX_LENGTH)}`,
      sections: [],
    };
  }
  return {
    prefix,
    content: null,
    sections: [],
  };
}

/// This function is used to render markdown from (alternatively GFM format) to our Section format.
/// The top-level node is always with prefix and content null and can be edited to add a prefix or
/// content.
export function renderMarkdownSection(
  markdown: string,
  { flavor }: { flavor?: "gfm" } = {}
): CoreAPIDataSourceDocumentSection {
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

      const c = renderPrefixSection(
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
export function renderDocumentTitleAndContent({
  title,
  createdAt,
  updatedAt,
  author,
  lastEditor,
  content,
}: {
  title: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  author?: string;
  lastEditor?: string;
  content: CoreAPIDataSourceDocumentSection | null;
}): CoreAPIDataSourceDocumentSection {
  if (title && title.trim()) {
    title = `$title: ${title}\n`;
  } else {
    title = null;
  }
  const c = renderPrefixSection(title);
  c.prefix = c.prefix || "";
  if (createdAt) {
    c.prefix += `$createdAt: ${createdAt.toISOString()}\n`;
  }
  if (updatedAt) {
    c.prefix += `$updatedAt: ${updatedAt.toISOString()}\n`;
  }
  if (author && lastEditor && author === lastEditor) {
    c.prefix += `$author: ${author}\n`;
  } else {
    if (author) {
      c.prefix += `$author: ${author}\n`;
    }
    if (lastEditor) {
      c.prefix += `$lastEditor: ${lastEditor}\n`;
    }
  }
  if (content) {
    c.sections.push(content);
  }
  if (c.prefix === "") c.prefix = null;
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
