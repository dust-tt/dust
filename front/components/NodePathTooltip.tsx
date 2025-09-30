import { Spinner, Tooltip } from "@dust-tt/sparkle";
import { useState } from "react";

import { useNodePath } from "@app/hooks/useNodePath";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
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
    disabled: !isHovered || (node.parentInternalIds?.length ?? 0) === 0,
  });

  if (!node.parentInternalIds || node.parentInternalIds.length === 0) {
    return <>{children}</>;
  }

  const { dataSource } = node.dataSourceView;
  const { connectorProvider } = dataSource;

  const providerName = connectorProvider
    ? CONNECTOR_CONFIGURATIONS[connectorProvider].name
    : "Folders";

  const path = [
    providerName,
    ...fullPath.map((parentNode) => parentNode.title),
  ].join(" › ");

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Tooltip
        tooltipTriggerAsChild
        label={
          isLoading ? (
            <div className="flex gap-1 text-xs text-muted-foreground dark:text-muted-foreground-night">
              {providerName} ›
              <Spinner size="xs" />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              {path}
            </div>
          )
        }
        trigger={children}
        side="bottom"
        align="start"
      />
    </div>
  );
}
