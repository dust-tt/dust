import {
  BracesIcon,
  ExternalLinkIcon,
  IconButton,
  Tree,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewType,
  WorkspaceType,
} from "@dust-tt/types";
import { useEffect, useState } from "react";

import { RequestOrAddDataFromDataSourceModal } from "@app/components/data_source/RequestOrAddDataFromDataSourceModal";
import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { classNames } from "@app/lib/utils";

interface DataSourceViewResourceSelectorTreeBaseProps {
  dataSourceView: DataSourceViewType;
  onSelectChange: (
    resource: DataSourceViewContentNode,
    parents: string[],
    selected: boolean
  ) => void;
  owner: WorkspaceType;
  parentIsSelected?: boolean;
  readonly?: boolean;
  selectedParents?: string[];
  selectedResourceIds: string[];
  showExpand: boolean;
  useContentNodes: typeof useDataSourceViewContentNodes;
  viewType?: ContentNodesViewType;
}

export default function DataSourceViewResourceSelectorTree({
  owner,
  dataSourceView,
  showExpand, //if not, it's flat
  parentIsSelected,
  readonly,
  selectedParents = [],
  selectedResourceIds,
  onSelectChange,
  useContentNodes = useDataSourceViewContentNodes,
  viewType = "documents",
}: DataSourceViewResourceSelectorTreeBaseProps) {
  return (
    <div className="overflow-x-auto">
      <DataSourceViewResourceSelectorChildren
        owner={owner}
        dataSourceView={dataSourceView}
        showExpand={showExpand}
        parents={[]}
        parentIsSelected={parentIsSelected}
        readonly={readonly}
        selectedResourceIds={selectedResourceIds}
        selectedParents={selectedParents}
        onSelectChange={onSelectChange}
        useContentNodes={useContentNodes}
        viewType={viewType}
      />
    </div>
  );
}

type DataSourceResourceSelectorChildrenProps =
  DataSourceViewResourceSelectorTreeBaseProps & {
    parentId?: string;
    parents: string[];
    selectedParents: string[];
    parentIsSelected?: boolean;
  };

function DataSourceViewResourceSelectorChildren({
  dataSourceView,
  onSelectChange,
  owner,
  parentId,
  parentIsSelected,
  parents,
  readonly,
  selectedParents,
  selectedResourceIds,
  showExpand,
  useContentNodes,
  viewType = "documents",
}: DataSourceResourceSelectorChildrenProps) {
  const { nodes, isNodesLoading, isNodesError } = useContentNodes({
    dataSourceView,
    owner,
    parentId,
    viewType,
  });

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
  const isEmptyManagedDataSource =
    dataSourceView.category === "managed" && nodes.length === 0 && !parentId;

  return (
    <>
      <DataSourceViewDocumentModal
        owner={owner}
        dataSourceView={dataSourceView}
        documentId={documentToDisplay}
        isOpen={!!documentToDisplay}
        onClose={() => setDocumentToDisplay(null)}
      />
      <Tree isLoading={isNodesLoading}>
        {nodes.map((r) => {
          const isSelected = selectedResourceIds.includes(r.internalId);
          const partiallyChecked =
            !isSelected &&
            Boolean(selectedParents.find((id) => id === r.internalId));

          const checkable =
            (!isTablesView || r.type === "database") &&
            r.preventSelection !== true &&
            !readonly;

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
                <DataSourceViewResourceSelectorChildren
                  owner={owner}
                  dataSourceView={dataSourceView}
                  parentId={r.internalId}
                  showExpand={showExpand}
                  // In table view, only manually selected nodes are considered and hierarchy does not apply.
                  selectedParents={selectedParents}
                  selectedResourceIds={selectedResourceIds}
                  onSelectChange={onSelectChange}
                  readonly={readonly}
                  parents={[...parents, r.internalId]}
                  parentIsSelected={parentIsSelected || isSelected}
                  useContentNodes={useContentNodes}
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
        {isEmptyManagedDataSource && !readonly && (
          <div className="flex w-full flex-col items-center gap-2 rounded-lg border bg-structure-50 py-4">
            <span className="text-element-700">
              No available data from this connection
            </span>
            <RequestOrAddDataFromDataSourceModal
              owner={owner}
              dataSource={dataSourceView.dataSource}
            />
          </div>
        )}
        {parentId && nodes.length === 0 && <Tree.Empty label="No documents" />}
      </Tree>
    </>
  );
}
