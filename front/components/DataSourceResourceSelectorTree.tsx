import {
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  Tree,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewType,
  LightContentNode,
  LightWorkspaceType,
} from "@dust-tt/types";
import type { ConnectorPermission, ContentNodeType } from "@dust-tt/types";
import { CircleStackIcon, FolderIcon } from "@heroicons/react/20/solid";
import { useEffect } from "react";

import { useVaultDataSourceViewContent } from "@app/lib/swr";

export default function DataSourceResourceSelectorTree({
  owner,
  dataSourceView,
  showExpand, //if not, it's flat
  parentIsSelected,
  selectedParents = [],
  selectedResourceIds,
  onSelectChange,
  filterPermission = "read",
  viewType = "documents",
}: {
  owner: LightWorkspaceType;
  dataSourceView: DataSourceViewType;
  showExpand: boolean;
  parentIsSelected?: boolean;
  selectedParents?: string[];
  selectedResourceIds: string[];
  onSelectChange: (
    resource: LightContentNode,
    parents: string[],
    selected: boolean
  ) => void;
  filterPermission?: ConnectorPermission;
  viewType?: ContentNodesViewType;
}) {
  return (
    <div className="overflow-x-auto">
      <DataSourceResourceSelectorChildren
        owner={owner}
        dataSourceView={dataSourceView}
        parentId={null}
        showExpand={showExpand}
        parents={[]}
        parentIsSelected={parentIsSelected}
        selectedResourceIds={selectedResourceIds}
        selectedParents={selectedParents}
        onSelectChange={(resource, parents, selected) => {
          onSelectChange(resource, parents, selected);
        }}
        filterPermission={filterPermission}
        viewType={viewType}
      />
    </div>
  );
}

export type IconComponentType =
  | typeof DocumentTextIcon
  | typeof FolderIcon
  | typeof CircleStackIcon
  | typeof ChatBubbleLeftRightIcon;

function getIconForType(type: ContentNodeType): IconComponentType {
  switch (type) {
    case "file":
      return DocumentTextIcon;
    case "folder":
      return FolderIcon;
    case "database":
      return CircleStackIcon;
    case "channel":
      return ChatBubbleLeftRightIcon;
    default:
      ((n: never) => {
        throw new Error("Unreachable " + n);
      })(type);
  }
}

function DataSourceResourceSelectorChildren({
  owner,
  dataSourceView,
  parentId,
  parents,
  parentIsSelected,
  selectedParents,
  showExpand,
  selectedResourceIds,
  onSelectChange,
  filterPermission,
  viewType = "documents",
}: {
  owner: LightWorkspaceType;
  dataSourceView: DataSourceViewType;
  parentId: string | null;
  parents: string[];
  parentIsSelected?: boolean;
  selectedParents: string[];
  showExpand: boolean;
  selectedResourceIds: string[];
  onSelectChange: (
    resource: LightContentNode,
    parents: string[],
    selected: boolean
  ) => void;
  filterPermission: ConnectorPermission;
  viewType: ContentNodesViewType;
}) {
  const { vaultContent, isVaultContentLoading, isVaultContentError } =
    useVaultDataSourceViewContent({
      dataSourceView: dataSourceView,
      disabled: dataSourceView.dataSource.connectorId === null,
      filterPermission,
      owner,
      parentId,
      vaultId: dataSourceView.vaultId,
      viewType,
    });

  useEffect(() => {
    if (parentIsSelected) {
      // Unselected previously selected children
      vaultContent
        .filter((r) => selectedResourceIds.includes(r.internalId))
        .forEach((r) => {
          onSelectChange(r, parents, false);
        });
    }
  }, [
    vaultContent,
    parentIsSelected,
    selectedResourceIds,
    onSelectChange,
    parents,
  ]);

  if (isVaultContentError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve resources likely due to a revoked authorization.
      </div>
    );
  }

  const isTablesView = viewType === "tables";
  return (
    <Tree isLoading={isVaultContentLoading}>
      {vaultContent.map((r) => {
        const isSelected = selectedResourceIds.includes(r.internalId);
        const partiallyChecked =
          !isSelected &&
          Boolean(selectedParents.find((id) => id === r.internalId));

        const IconComponent = getIconForType(r.type);
        const checkable =
          (!isTablesView || r.type === "database") &&
          r.preventSelection !== true;

        const checkedStatus =
          isSelected || parentIsSelected
            ? "checked"
            : partiallyChecked
              ? "partial"
              : "unchecked";

        return (
          <Tree.Item
            key={r.internalId}
            visual={IconComponent}
            type={r.expandable && showExpand ? "node" : "leaf"}
            label={r.title}
            className="whitespace-nowrap"
            checkbox={
              checkable || partiallyChecked
                ? {
                    disabled: parentIsSelected || !checkable,
                    checked: checkedStatus,
                    onChange: (checked) => {
                      onSelectChange(r, parents, checked);
                    },
                  }
                : undefined
            }
            renderTreeItems={() => (
              <DataSourceResourceSelectorChildren
                owner={owner}
                dataSourceView={dataSourceView}
                parentId={r.internalId}
                showExpand={showExpand}
                // In table view, only manually selected nodes are considered and hierarchy does not apply.
                selectedParents={selectedParents}
                selectedResourceIds={selectedResourceIds}
                onSelectChange={onSelectChange}
                parents={[...parents, r.internalId]}
                parentIsSelected={parentIsSelected || isSelected}
                filterPermission={filterPermission}
                viewType={viewType}
              />
            )}
          />
        );
      })}
    </Tree>
  );
}
