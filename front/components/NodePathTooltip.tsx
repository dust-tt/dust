import { Icon, Tooltip } from "@dust-tt/sparkle";
import { useState } from "react";

import { useNodePath } from "@app/hooks/useNodePath";
import {
  CONNECTOR_CONFIGURATIONS,
  getConnectorProviderLogoWithFallback,
} from "@app/lib/connector_providers";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import type { DataSourceViewContentNode, LightWorkspaceType } from "@app/types";

interface NodePathTooltipProps {
  node: DataSourceViewContentNode;
  owner: LightWorkspaceType;
  children: React.ReactNode;
}

export function NodePathTooltip({
  node,
  owner,
  children,
}: NodePathTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { fullPath, isLoading } = useNodePath({
    node,
    owner,
    enabled: isHovered && (node.parentInternalIds?.length ?? 0) > 0,
  });

  if (!node.parentInternalIds || node.parentInternalIds.length === 0) {
    return <>{children}</>;
  }
  const fullPathString = fullPath ? (
    <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
      {fullPath.map((parentNode) => parentNode.title).join(" / ")}
    </span>
  ) : (
    ""
  );
  const tooltipContent =
    fullPath && !isLoading ? (
      <div className="flex gap-1">
        {(() => {
          const { dataSource } = node.dataSourceView;
          const { connectorProvider } = dataSource;
          const providerName = connectorProvider
            ? CONNECTOR_CONFIGURATIONS[connectorProvider].name
            : "Folders";

          const pathItems = [
            {
              icon: getConnectorProviderLogoWithFallback({
                provider: connectorProvider,
              }),
              label: providerName,
            },
            ...fullPath.map((parentNode) => ({
              icon: getVisualForDataSourceViewContentNode(parentNode),
              label: parentNode.title,
            })),
            {
              icon: getVisualForDataSourceViewContentNode(node),
              label: node.title,
            },
          ];

          return pathItems.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <Icon visual={item.icon} size="xs" />
              <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                {item.label}
              </span>
            </div>
          ));
        })()}
      </div>
    ) : null;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {tooltipContent ? (
        <Tooltip
          tooltipTriggerAsChild
          triggerAsChild
          label={fullPathString}
          trigger={children}
          side="bottom"
          align="start"
        />
      ) : (
        children
      )}
    </div>
  );
}
