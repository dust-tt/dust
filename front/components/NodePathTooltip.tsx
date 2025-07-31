import { Tooltip } from "@dust-tt/sparkle";
import { useState } from "react";

import { useNodePath } from "@app/hooks/useNodePath";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getLocationForDataSourceViewContentNode } from "@app/lib/content_nodes";
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
  const { fullPath } = useNodePath({
    node,
    owner,
    enabled: isHovered && (node.parentInternalIds?.length ?? 0) > 0,
  });

  if (!node.parentInternalIds || node.parentInternalIds.length === 0) {
    return <>{children}</>;
  }

  const { dataSource } = node.dataSourceView;
  const { connectorProvider } = dataSource;

  const providerName = connectorProvider
    ? CONNECTOR_CONFIGURATIONS[connectorProvider].name
    : "Folders";

  const path = fullPath
    ? providerName +
      " › " +
      fullPath.map((parentNode) => parentNode.title).join(" › ")
    : getLocationForDataSourceViewContentNode(node);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Tooltip
        tooltipTriggerAsChild
        triggerAsChild
        label={
          <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            {path}
          </span>
        }
        trigger={children}
        side="bottom"
        align="start"
      />
    </div>
  );
}
