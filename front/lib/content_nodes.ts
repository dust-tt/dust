// Okay to use public API types as it's about internal types between connector and front that public API users do not care about.

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import {
  CONNECTOR_UI_CONFIGURATIONS,
  getConnectorProviderLogoWithFallback,
} from "@app/lib/connector_providers_ui";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import type { ContentNode } from "@app/types/connectors/connectors_api";
import type { ContentNodeType } from "@app/types/core/content_node";
import { DATA_SOURCE_NODE_ID } from "@app/types/core/content_node";
import { isConnectorProvider } from "@app/types/data_source";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { SpaceType } from "@app/types/space";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";
import {
  File02,
  File04,
  Folder,
  LayersThree01,
  Lock01,
  MessageChatSquare,
} from "@dust-tt/sparkle";

import {
  CHANNEL_INTERNAL_MIME_TYPES,
  DATABASE_INTERNAL_MIME_TYPES,
  FILE_INTERNAL_MIME_TYPES,
  SPREADSHEET_INTERNAL_MIME_TYPES,
} from "./content_nodes_constants";

export function getDocumentIcon(provider: string | null | undefined) {
  if (provider && isConnectorProvider(provider)) {
    const IconComponent = getConnectorProviderLogoWithFallback({
      provider,
      fallback: File02,
    });
    return IconComponent;
  }
  return File02;
}

function getVisualForFileContentNode(node: ContentNode & { type: "document" }) {
  if (node.expandable) {
    return File04;
  }

  return File02;
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
      return LayersThree01;
    case "folder":
      return Folder;
    case "document":
      return File02;
    default:
      assertNever(type);
  }
}

export function getVisualForContentNode(node: ContentNode) {
  // Check mime type first for special icon handling.
  if (node.mimeType) {
    // Handle private channels with lock icon.
    if (CHANNEL_INTERNAL_MIME_TYPES.includes(node.mimeType)) {
      return node.providerVisibility === "private" ? Lock01 : MessageChatSquare;
    }

    // Handle database-like content.
    if (DATABASE_INTERNAL_MIME_TYPES.includes(node.mimeType)) {
      return LayersThree01;
    }

    // Handle file-like content that isn't a document type.
    if (FILE_INTERNAL_MIME_TYPES.includes(node.mimeType)) {
      return getVisualForFileContentNode(
        node as ContentNode & { type: "document" }
      );
    }

    // Handle spreadsheets.
    if (SPREADSHEET_INTERNAL_MIME_TYPES.includes(node.mimeType)) {
      return Folder;
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

  if (connectorProvider === "dust_project" && node.parentTitle) {
    return node.parentTitle;
  }

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

/**
 * @cc [owner:smb2268,label:product] view-root-node-matches-search
 * The returned node MUST carry `DATA_SOURCE_NODE_ID` as `internalId`, `DATA_SOURCE_MIME_TYPE`
 * and type `folder`, the identity the search API gives a data source hit and the content-fragment
 * path resolves, so attaching a whole data source view from the browser is stored and rendered
 * like attaching it from a search result. The title is the data source's display name.
 */
export function getDataSourceViewRootNode(
  dataSourceView: DataSourceViewType
): DataSourceViewContentNode {
  return {
    childrenCount: 1,
    dataSourceView,
    expandable: true,
    internalId: DATA_SOURCE_NODE_ID,
    lastUpdatedAt: dataSourceView.dataSource.createdAt,
    mimeType: DATA_SOURCE_MIME_TYPE,
    parentInternalId: null,
    parentInternalIds: [],
    parentTitle: null,
    permission: "read",
    preventSelection: false,
    providerVisibility: null,
    sourceUrl: null,
    title: getDataSourceNameFromView(dataSourceView),
    type: "folder",
  };
}
