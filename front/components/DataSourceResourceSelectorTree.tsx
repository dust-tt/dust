import {
  BracesIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  ExternalLinkIcon,
  IconButton,
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
import { useEffect, useState } from "react";

import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { useVaultDataSourceViewContent } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

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
  parentId?: string;
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

  const [documentToDisplay, setDocumentToDisplay] = useState<string | null>(
    null
  );

  if (isVaultContentError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve resources likely due to a revoked authorization.
      </div>
    );
  }

  const isTablesView = viewType === "tables";

  return (
    <>
      <DataSourceViewDocumentModal
        owner={owner}
        dataSourceView={dataSourceView}
        documentId={documentToDisplay}
        isOpen={!!documentToDisplay}
        setOpen={(open) => {
          if (!open) {
            setDocumentToDisplay(null);
          }
        }}
      />
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

          let checkedStatus: "checked" | "partial" | "unchecked" = "unchecked";
          if (isSelected || parentIsSelected) {
            checkedStatus = "checked";
          } else if (partiallyChecked) {
            checkedStatus = "partial";
          }

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
              actions={
                <div className="mr-8 flex flex-row gap-2">
                  <IconButton
                    size="xs"
                    icon={ExternalLinkIcon}
                    onClick={() => {
                      if (r.sourceUrl) {
                        window.open(r.sourceUrl, "_blank");
                      }
                    }}
                    className={classNames(
                      r.sourceUrl ? "" : "pointer-events-none opacity-0"
                    )}
                    disabled={!r.sourceUrl}
                    variant="tertiary"
                  />
                  <IconButton
                    size="xs"
                    icon={BracesIcon}
                    onClick={() => {
                      if (r.dustDocumentId) {
                        setDocumentToDisplay(r.dustDocumentId);
                      }
                    }}
                    className={classNames(
                      r.dustDocumentId ? "" : "pointer-events-none opacity-0"
                    )}
                    disabled={!r.dustDocumentId}
                    variant="tertiary"
                  />
                </div>
              }
            />
          );
        })}
      </Tree>
    </>
  );
}
