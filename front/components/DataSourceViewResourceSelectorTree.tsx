import {
  BracesIcon,
  Button,
  ExternalLinkIcon,
  IconButton,
  PlusIcon,
  Tree,
} from "@dust-tt/sparkle";
import type {
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewType,
  WorkspaceType,
} from "@dust-tt/types";
import { useContext, useEffect, useState } from "react";

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { ConnectorPermissionsModal } from "@app/components/ConnectorPermissionsModal";
import { RequestDataSourceModal } from "@app/components/data_source/RequestDataSourceModal";
import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import { useConnector } from "@app/lib/swr/connectors";
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
  selectedParents?: string[];
  selectedResourceIds: string[];
  showExpand: boolean;
  viewType?: ContentNodesViewType;
}

export default function DataSourceViewResourceSelectorTree({
  owner,
  dataSourceView,
  showExpand, //if not, it's flat
  parentIsSelected,
  selectedParents = [],
  selectedResourceIds,
  onSelectChange,
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

type DataSourceResourceSelectorChildrenProps =
  DataSourceViewResourceSelectorTreeBaseProps & {
    parentId?: string;
    parents: string[];
    selectedParents: string[];
  };

function DataSourceViewResourceSelectorChildren({
  dataSourceView,
  onSelectChange,
  owner,
  parentId,
  parentIsSelected,
  parents,
  selectedParents,
  selectedResourceIds,
  showExpand,
  viewType = "documents",
}: DataSourceResourceSelectorChildrenProps) {
  const { plan, dustClientFacingUrl } = useContext(AssistantBuilderContext);
  const { nodes, isNodesLoading, isNodesError } = useDataSourceViewContentNodes(
    {
      dataSourceView: dataSourceView,
      owner,
      parentId,
      viewType,
    }
  );
  const [showConnectorPermissionsModal, setShowConnectorPermissionsModal] =
    useState(false);

  const { connector } = useConnector({
    workspaceId: owner.sId,
    dataSourceId: dataSourceView.dataSource.sId,
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
                <DataSourceViewResourceSelectorChildren
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
        {dataSourceView.category === "managed" && nodes.length === 0 && (
          <div className="flex w-full flex-col items-center gap-2 rounded-lg border bg-structure-50 py-2">
            <span className="text-element-700">The Vault is empty!</span>
            {owner.role === "admin" &&
            connector &&
            plan &&
            dustClientFacingUrl ? (
              <>
                <Button label="Add Data" icon={PlusIcon} />
                <ConnectorPermissionsModal
                  owner={owner}
                  connector={connector}
                  dataSource={dataSourceView.dataSource}
                  isOpen={showConnectorPermissionsModal}
                  onClose={() => {
                    setShowConnectorPermissionsModal(false);
                  }}
                  plan={plan}
                  readOnly={false}
                  isAdmin={owner.role === "admin"}
                  dustClientFacingUrl={dustClientFacingUrl}
                />
              </>
            ) : (
              <RequestDataSourceModal
                dataSources={[dataSourceView.dataSource]}
                owner={owner}
              />
            )}
          </div>
        )}
      </Tree>
    </>
  );
}
