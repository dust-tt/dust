import type { AttachContextSlashMenuItem } from "@app/components/editor/extensions/shared/slash_suggestion/useAttachContextSlashMenuItems";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers_ui";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { isFolder, isWebsite } from "@app/lib/data_sources";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { DoubleIcon, Icon } from "@dust-tt/sparkle";

export function AttachContextSlashMenuItemIcon({
  item,
}: {
  item: AttachContextSlashMenuItem;
}) {
  if (item.kind === "file" && item.selection.kind === "file") {
    return (
      <Icon
        visual={getFileTypeIcon(
          item.selection.selection.contentType,
          item.label
        )}
        size="md"
      />
    );
  }

  if (item.kind === "knowledge" && item.selection.kind === "knowledge") {
    const node = item.selection.node;

    if (
      isWebsite(node.dataSourceView.dataSource) ||
      isFolder(node.dataSourceView.dataSource)
    ) {
      return (
        <Icon visual={getVisualForDataSourceViewContentNode(node)} size="md" />
      );
    }

    return (
      <DoubleIcon
        size="md"
        mainIcon={getVisualForDataSourceViewContentNode(node)}
        secondaryIcon={getConnectorProviderLogoWithFallback({
          provider: node.dataSourceView.dataSource.connectorProvider,
        })}
      />
    );
  }

  return null;
}
