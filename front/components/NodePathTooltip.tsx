import {
  Spinner,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@dust-tt/sparkle";
import React, { useEffect, useState } from "react";

import { useNodePath } from "@app/hooks/useNodePath";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import type { DataSourceViewContentNode, LightWorkspaceType } from "@app/types";

interface NodePathTooltipProps {
  node: DataSourceViewContentNode;
  owner: LightWorkspaceType;
  children: React.ReactNode;
}

const HOVER_DELAY_MS = 500;

export function NodePathTooltip({
  node,
  owner,
  children,
}: NodePathTooltipProps) {
  const { fullPath, isLoading } = useNodePath({
    node,
    owner,
    disabled: (node.parentInternalIds?.length ?? 0) === 0,
  });

  const { dataSource } = node.dataSourceView;
  const { connectorProvider } = dataSource;

  const providerName = connectorProvider
    ? CONNECTOR_CONFIGURATIONS[connectorProvider].name
    : "Folders";

  const path = [
    providerName,
    ...fullPath.map((parentNode) => parentNode.title),
  ].join(" › ");

  const [isPointerHovering, setIsPointerHovering] = useState(false);
  const [isPointerOpen, setIsPointerOpen] = useState(false);

  useEffect(() => {
    if (!isPointerHovering) {
      setIsPointerOpen(false);
      return;
    }

    const id = setTimeout(() => {
      setIsPointerOpen(true);
    }, HOVER_DELAY_MS);

    return () => {
      clearTimeout(id);
    };
  }, [isPointerHovering]);

  const handlePointerEnter = () => {
    setIsPointerHovering(true);
  };

  const handlePointerLeave = () => {
    setIsPointerHovering(false);
    setIsPointerOpen(false);
  };

  const triggerChild = React.isValidElement(children) ? (
    children
  ) : (
    <span style={{ display: "contents" }}>{children}</span>
  );

  if (!node.parentInternalIds || node.parentInternalIds.length === 0) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <TooltipRoot open={isPointerOpen}>
        <TooltipTrigger
          asChild
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          {triggerChild}
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          {isLoading ? (
            <div className="flex gap-1 text-xs text-muted-foreground dark:text-muted-foreground-night">
              {providerName} ›
              <Spinner size="xs" />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              {path}
            </div>
          )}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
