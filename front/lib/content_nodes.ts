// Okay to use public API types as it's about internal types between connector and front that public API users do not care about.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";
import {
  ChatBubbleLeftRightIcon,
  DocumentIcon,
  DocumentPileIcon,
  FolderIcon,
  FolderTableIcon,
  LockIcon,
  Square3Stack3DIcon,
} from "@dust-tt/sparkle";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import {
  CONNECTOR_UI_CONFIGURATIONS,
  getConnectorProviderLogoWithFallback,
} from "@app/lib/connector_providers_ui";
import type {
  ContentNode,
  ContentNodeType,
  DataSourceViewContentNode,
  SpaceType,
} from "@app/types";
import { isConnectorProvider } from "@app/types/data_source";
import { assertNever } from "@app/types/shared/utils/assert_never";

import {
  CHANNEL_INTERNAL_MIME_TYPES,
  DATABASE_INTERNAL_MIME_TYPES,
  FILE_INTERNAL_MIME_TYPES,
  SPREADSHEET_INTERNAL_MIME_TYPES,
} from "./content_nodes_constants";

const CONTENT_NODE_MENTION_REGEX =
  /:content_node_mention\[([^\]]+)](\{url=([^}]+)})?/;

export function replaceContentNodeMarkdownWithQuotedTitle(markdown: string) {
  return markdown.replace(CONTENT_NODE_MENTION_REGEX, (_match, title) => {
    return `"${title}"`;
  });
}

export function getDocumentIcon(provider: string | null | undefined) {
  if (provider && isConnectorProvider(provider)) {
    const IconComponent = getConnectorProviderLogoWithFallback({
      provider,
      fallback: DocumentIcon,
    });
    return IconComponent;
  }
  return DocumentIcon;
}

function getVisualForFileContentNode(node: ContentNode & { type: "document" }) {
  if (node.expandable) {
    return DocumentPileIcon;
  }

  return DocumentIcon;
}

export function getVisualForDataSourceViewContentNode(
  node: DataSourceViewContentNode
) {
  // Handle data sources with connector providers.
  if (
    node.mimeType &&
    node.mimeType === DATA_SOURCE_MIME_TYPE &&
    node.dataSourceView?.dataSource?.connectorProvider &&
    CONNECTOR_UI_CONFIGURATIONS[
      node.dataSourceView.dataSource.connectorProvider
    ]
  ) {
    return CONNECTOR_UI_CONFIGURATIONS[
      node.dataSourceView.dataSource.connectorProvider
    ].getLogoComponent();
  }

  // Fall back to regular content node icon handling.
  return getVisualForContentNode(node);
}

export function getVisualForContentNodeType(type: ContentNodeType) {
  switch (type) {
    case "table":
      return Square3Stack3DIcon;
    case "folder":
      return FolderIcon;
    case "document":
      return DocumentIcon;
    default:
      assertNever(type);
  }
}

export function getVisualForContentNode(node: ContentNode) {
  // Check mime type first for special icon handling.
  if (node.mimeType) {
    // Handle private channels with lock icon.
    if (CHANNEL_INTERNAL_MIME_TYPES.includes(node.mimeType)) {
      return node.providerVisibility === "private"
        ? LockIcon
        : ChatBubbleLeftRightIcon;
    }

    // Handle database-like content.
    if (DATABASE_INTERNAL_MIME_TYPES.includes(node.mimeType)) {
      return Square3Stack3DIcon;
    }

    // Handle file-like content that isn't a document type.
    if (FILE_INTERNAL_MIME_TYPES.includes(node.mimeType)) {
      return getVisualForFileContentNode(
        node as ContentNode & { type: "document" }
      );
    }

    // Handle spreadsheets.
    if (SPREADSHEET_INTERNAL_MIME_TYPES.includes(node.mimeType)) {
      return FolderTableIcon;
    }
  }

  // Fall back to the node type if the mime type doesn't determine the icon.
  return getVisualForContentNodeType(node.type);
}

export function getLocationForDataSourceViewContentNode(
  node: DataSourceViewContentNode
) {
  const { dataSource } = node.dataSourceView;
  const { connectorProvider } = dataSource;
  const providerName = connectorProvider
    ? CONNECTOR_CONFIGURATIONS[connectorProvider].name
    : "Folders";

  if (!node.parentTitle) {
    return providerName;
  }

  return `${providerName} › ... › ${node.parentTitle}`;
}

export function getLocationForDataSourceViewContentNodeWithSpace(
  node: DataSourceViewContentNode,
  spacesMap?: Record<string, SpaceType>
) {
  const { spaceId } = node.dataSourceView;

  // Get space name if available.
  const spaceName = spacesMap?.[spaceId]?.name;
  const locationWithoutSpace = getLocationForDataSourceViewContentNode(node);

  return spaceName
    ? `${spaceName} › ${locationWithoutSpace}`
    : locationWithoutSpace;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    // decodeURIComponent throws URIError for malformed escape sequences.
    if (err instanceof URIError) {
      return value;
    }
    throw err;
  }
}

function extractSharePointSiteNameFromSourceUrl(
  sourceUrl: string
): string | null {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch (err) {
    if (err instanceof TypeError) {
      return null;
    }
    throw err;
  }

  if (!url.hostname.includes("sharepoint.com")) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const sitesIndex = segments.findIndex((s) => s === "sites" || s === "teams");
  if (sitesIndex === -1 || sitesIndex + 1 >= segments.length) {
    return null;
  }

  const siteSegment = segments[sitesIndex + 1];
  return siteSegment ? safeDecodeURIComponent(siteSegment) : null;
}

/**
 * Display title used in knowledge selection trees.
 * For Microsoft SharePoint root folders, include the site name to disambiguate
 * repeated folder names across sites.
 */
export function getDisplayTitleForDataSourceViewContentNode(
  node: DataSourceViewContentNode
): string {
  if (node.dataSourceView.dataSource.connectorProvider !== "microsoft") {
    return node.title;
  }

  if (node.type !== "folder" || node.parentInternalId !== null || !node.sourceUrl) {
    return node.title;
  }

  // Avoid double-prefixing if already decorated (defensive).
  if (node.title.includes("→")) {
    return node.title;
  }

  const siteName = extractSharePointSiteNameFromSourceUrl(node.sourceUrl);
  return siteName ? `${siteName} → ${node.title}` : node.title;
}

export function getDisplayTitleForContentNode(node: ContentNode): string {
  // ContentNodeTree sometimes receives DataSourceViewContentNode items (which carry
  // connector metadata). When available, use the richer formatting.
  const maybeDSVNode = node as unknown as Partial<DataSourceViewContentNode>;
  if (maybeDSVNode.dataSourceView) {
    return getDisplayTitleForDataSourceViewContentNode(
      node as unknown as DataSourceViewContentNode
    );
  }
  return node.title;
}
