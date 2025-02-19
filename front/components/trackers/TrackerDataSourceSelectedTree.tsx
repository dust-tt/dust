import {
  BracesIcon,
  classNames,
  ExternalLinkIcon,
  IconButton,
  Tree,
} from "@dust-tt/sparkle";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useState } from "react";

import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { DataSourceViewPermissionTree } from "@app/components/DataSourceViewPermissionTree";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { orderDatasourceViewSelectionConfigurationByImportance } from "@app/lib/connectors";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import {
  canBeExpanded,
  getDisplayNameForDataSource,
} from "@app/lib/data_sources";
export const TrackerDataSourceSelectedTree = ({
  owner,
  dataSourceConfigurations,
}: {
  owner: LightWorkspaceType;
  dataSourceConfigurations: DataSourceViewSelectionConfigurations;
}) => {
  const { isDark } = useTheme();
  const [documentToDisplay, setDocumentToDisplay] = useState<string | null>(
    null
  );
  const [dataSourceViewToDisplay, setDataSourceViewToDisplay] =
    useState<DataSourceViewType | null>(null);
  return (
    <>
      <DataSourceViewDocumentModal
        owner={owner}
        dataSourceView={dataSourceViewToDisplay}
        documentId={documentToDisplay}
        isOpen={!!documentToDisplay}
        onClose={() => setDocumentToDisplay(null)}
      />
      <Tree>
        {orderDatasourceViewSelectionConfigurationByImportance(
          Object.values(dataSourceConfigurations)
        ).map((dsConfig) => {
          const LogoComponent = getConnectorProviderLogoWithFallback({
            provider: dsConfig.dataSourceView.dataSource.connectorProvider,
            isDark,
          });

          return (
            <Tree.Item
              key={dsConfig.dataSourceView.sId}
              type={
                canBeExpanded(dsConfig.dataSourceView.dataSource)
                  ? "node"
                  : "leaf"
              } // todo make useConnectorPermissions hook work for non managed ds (Folders)
              label={getDisplayNameForDataSource(
                dsConfig.dataSourceView.dataSource
              )}
              visual={LogoComponent}
              className="whitespace-nowrap"
            >
              {dsConfig.isSelectAll && (
                <DataSourceViewPermissionTree
                  owner={owner}
                  dataSourceView={dsConfig.dataSourceView}
                  parentId={null}
                  onDocumentViewClick={(documentId: string) => {
                    setDataSourceViewToDisplay(dsConfig.dataSourceView);
                    setDocumentToDisplay(documentId);
                  }}
                  viewType={"all"}
                />
              )}
              {dsConfig.selectedResources.map((node) => {
                return (
                  <Tree.Item
                    key={`${dsConfig.dataSourceView.sId}-${node.internalId}`}
                    label={node.title}
                    type={node.expandable ? "node" : "leaf"}
                    visual={getVisualForContentNode(node)}
                    className="whitespace-nowrap"
                    actions={
                      <div className="mr-8 flex flex-row gap-2">
                        <IconButton
                          size="xs"
                          icon={ExternalLinkIcon}
                          onClick={() => {
                            if (node.sourceUrl) {
                              window.open(node.sourceUrl, "_blank");
                            }
                          }}
                          className={classNames(
                            node.sourceUrl
                              ? ""
                              : "pointer-events-none opacity-0"
                          )}
                          disabled={!node.sourceUrl}
                          variant="outline"
                        />
                        <IconButton
                          size="xs"
                          icon={BracesIcon}
                          onClick={() => {
                            if (node.type === "Document") {
                              setDataSourceViewToDisplay(
                                dsConfig.dataSourceView
                              );
                              setDocumentToDisplay(node.internalId);
                            }
                          }}
                          className={classNames(
                            node.type === "Document"
                              ? ""
                              : "pointer-events-none opacity-0"
                          )}
                          disabled={node.type !== "Document"}
                          variant="outline"
                        />
                      </div>
                    }
                  >
                    <DataSourceViewPermissionTree
                      owner={owner}
                      dataSourceView={dsConfig.dataSourceView}
                      parentId={node.internalId}
                      onDocumentViewClick={(documentId: string) => {
                        setDataSourceViewToDisplay(dsConfig.dataSourceView);
                        setDocumentToDisplay(documentId);
                      }}
                      viewType={"all"}
                    />
                  </Tree.Item>
                );
              })}
            </Tree.Item>
          );
        })}
      </Tree>
    </>
  );
};
