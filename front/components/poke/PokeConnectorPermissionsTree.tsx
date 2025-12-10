import {
  Button,
  DatadogLogo,
  ExternalLinkIcon,
  IconButton,
  InformationCircleIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import React, { useCallback } from "react";

import { ContentNodeTree } from "@app/components/ContentNodeTree";
import { usePokeConnectorPermissions } from "@app/lib/swr/poke";
import { timeAgoFrom } from "@app/lib/utils";
import type {
  ConnectorPermission,
  DataSourceType,
  WorkspaceType,
} from "@app/types";

const getUseResourceHook =
  (
    owner: WorkspaceType,
    dataSource: DataSourceType,
    permissionFilter?: ConnectorPermission
  ) =>
  (parentId: string | null) =>
    usePokeConnectorPermissions({
      dataSource,
      filterPermission: permissionFilter ?? null,
      owner,
      parentId,
    });

type PokePermissionTreeProps = {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  permissionFilter?: ConnectorPermission;
  showExpand?: boolean;
  onDocumentViewClick: (documentId: string) => void;
};

export function PokePermissionTree({
  owner,
  dataSource,
  permissionFilter,
  showExpand,
  onDocumentViewClick,
}: PokePermissionTreeProps) {
  const useResourcesHook = useCallback(
    (parentId: string | null) =>
      getUseResourceHook(owner, dataSource, permissionFilter)(parentId),
    [owner, dataSource, permissionFilter]
  );

  return (
    <div className="overflow-x-auto">
      <ContentNodeTree
        showExpand={showExpand}
        onDocumentViewClick={onDocumentViewClick}
        useResourcesHook={useResourcesHook}
        additionalActionsForContentNode={(contentNode) => (
          <Tooltip
            label={
              <div className="flex flex-col gap-2 p-2">
                <div className="text-xs">
                  <div className="font-semibold">Title:</div>
                  <div>{contentNode.title}</div>
                </div>
                <div className="text-xs">
                  <div className="font-semibold">Internal ID:</div>
                  <div className="font-mono text-xs">
                    {contentNode.internalId}
                  </div>
                </div>
                <div className="text-xs">
                  <div className="font-semibold">Type:</div>
                  <div>{contentNode.type}</div>
                </div>
                <div className="text-xs">
                  <div className="font-semibold">Last updated at:</div>
                  <div>
                    {contentNode.lastUpdatedAt
                      ? timeAgoFrom(contentNode.lastUpdatedAt)
                      : "never"}
                  </div>
                </div>
                <div className="text-xs">
                  {contentNode.sourceUrl && (
                    <>
                      <Button
                        href={contentNode.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        label={"Source"}
                        icon={ExternalLinkIcon}
                        size="xs"
                        variant="outline"
                      />{" "}
                    </>
                  )}
                  <Button
                    href={`https://app.datadoghq.eu/logs?query=%40documentId%3A${encodeURIComponent(contentNode.internalId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    label={"Datadog logs"}
                    icon={DatadogLogo}
                    size="xs"
                    variant="outline"
                  />
                </div>
              </div>
            }
            className="max-w-md"
            trigger={
              <IconButton
                size="xs"
                icon={InformationCircleIcon}
                variant="outline"
              />
            }
          />
        )}
      />
    </div>
  );
}
