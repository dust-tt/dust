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
import { isConnectorProvider } from "@app/types";
import { assertNever } from "@app/types";

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
  const { dataSource, spaceId } = node.dataSourceView;
  const { connectorProvider } = dataSource;
  const providerName = connectorProvider
    ? CONNECTOR_CONFIGURATIONS[connectorProvider].name
    : "Folders";

  // Get space name if available.
  const spaceName = spacesMap?.[spaceId]?.name;

  if (!node.parentTitle) {
    return spaceName ? `${spaceName} › ${providerName}` : providerName;
  }

  const location = `${providerName} › ... › ${node.parentTitle}`;
  return spaceName ? `${spaceName} › ${location}` : location;
}
