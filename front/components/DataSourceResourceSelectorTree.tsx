import {
  BracesIcon,
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
import { useEffect, useState } from "react";

import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import { useDataSourceViewContentNodes } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

export default function DataSourceResourceSelectorTree({
  owner,
  dataSourceView,
  showExpand, //if not, it's flat
  parentIsSelected,
  selectedParents = [],
  selectedResourceIds,
  onSelectChange,
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
        viewType={viewType}
      />
    </div>
  );
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
  viewType: ContentNodesViewType;
}) {
  const { nodes, isNodesLoading, isNodesError } = useDataSourceViewContentNodes(
    {
      dataSourceView: dataSourceView,
      owner,
      internalIds: parentId ? [parentId] : [],
      includeChildren: true,
      viewType,
    }
  );

  useEffect(() => {
    if (parentIsSelected) {
      // Unselected previously selected children
      nodes
        .filter((r) => selectedResourceIds.includes(r.internalId))
        .forEach((r) => {
          onSelectChange(r, parents, false);
        });
    }
  }, [nodes, parentIsSelected, selectedResourceIds, onSelectChange, parents]);

  const [documentToDisplay, setDocumentToDisplay] = useState<string | null>(
    null
  );

  if (isNodesError) {
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
      <Tree isLoading={isNodesLoading}>
        {nodes.map((r) => {
          const isSelected = selectedResourceIds.includes(r.internalId);
          const partiallyChecked =
            !isSelected &&
            Boolean(selectedParents.find((id) => id === r.internalId));

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
              visual={getVisualForContentNode(r)}
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
