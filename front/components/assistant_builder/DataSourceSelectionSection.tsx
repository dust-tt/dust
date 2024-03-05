import {
  BracesIcon,
  Button,
  ExternalLinkIcon,
  IconButton,
  Tree,
} from "@dust-tt/sparkle";
import type { DataSourceType, WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import type { AssistantBuilderDataSourceConfiguration } from "@app/components/assistant_builder/types";
import { PermissionTreeChildren } from "@app/components/ConnectorPermissionsTree";
import { EmptyCallToAction } from "@app/components/EmptyCallToAction";
import ManagedDataSourceDocumentModal from "@app/components/ManagedDataSourceDocumentModal";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { useConnectorPermissions } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";

export default function DataSourceSelectionSection({
  owner,
  dataSourceConfigurations,
  openDataSourceModal,
  canAddDataSource,
}: {
  owner: WorkspaceType;
  dataSourceConfigurations: Record<
    string,
    AssistantBuilderDataSourceConfiguration
  >;
  openDataSourceModal: () => void;
  canAddDataSource: boolean;
  onDelete?: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [documentToDisplay, setDocumentToDisplay] = useState<string | null>(
    null
  );
  const [dataSourceToDisplay, setDataSourceToDisplay] =
    useState<DataSourceType | null>(null);

  return (
    <>
      <ManagedDataSourceDocumentModal
        owner={owner}
        dataSource={dataSourceToDisplay}
        documentId={documentToDisplay}
        isOpen={!!documentToDisplay}
        setOpen={(open) => {
          if (!open) {
            setDocumentToDisplay(null);
          }
        }}
      />

      <div className="overflow-hidden pt-6">
        <div className="flex flex-row items-start">
          <div className="flex-grow text-sm font-semibold text-element-900">
            Selected Data sources:
          </div>
          <div>
            {Object.keys(dataSourceConfigurations).length > 0 && (
              <Button
                labelVisible={true}
                label="Manage selection"
                variant="primary"
                size="sm"
                onClick={openDataSourceModal}
                disabled={!canAddDataSource}
                hasMagnifying={false}
              />
            )}
          </div>
        </div>
        {!Object.keys(dataSourceConfigurations).length ? (
          <EmptyCallToAction
            label="Select Data Sources"
            onClick={openDataSourceModal}
            disabled={!canAddDataSource}
          />
        ) : (
          <Tree>
            {Object.values(dataSourceConfigurations).map((dsConfig) => {
              const LogoComponent = dsConfig.dataSource?.connectorProvider
                ? CONNECTOR_CONFIGURATIONS[
                    dsConfig.dataSource.connectorProvider
                  ].logoComponent
                : null;
              return (
                <Tree.Item
                  key={dsConfig.dataSource.id}
                  collapsed={!expanded[dsConfig.dataSource.id]}
                  onChevronClick={() => {
                    setExpanded((prev) => ({
                      ...prev,
                      [dsConfig.dataSource.id]: prev[dsConfig.dataSource.id]
                        ? false
                        : true,
                    }));
                  }}
                  type="node"
                  label={getDisplayNameForDataSource(dsConfig.dataSource)}
                  visual={
                    LogoComponent ? (
                      <LogoComponent className="s-h-5 s-w-5" />
                    ) : null
                  }
                  variant="folder" // in case LogoComponent is null
                  className="whitespace-nowrap"
                >
                  {dsConfig.isSelectAll && (
                    <PermissionTreeChildren
                      owner={owner}
                      dataSource={dsConfig.dataSource}
                      parentId={null}
                      permissionFilter="read"
                      canUpdatePermissions={true}
                      displayDocumentSource={(documentId: string) => {
                        setDataSourceToDisplay(dsConfig.dataSource);
                        setDocumentToDisplay(documentId);
                      }}
                      useConnectorPermissionsHook={useConnectorPermissions}
                    />
                  )}
                  {dsConfig.selectedResources.map((node) => {
                    return (
                      <Tree.Item
                        key={node.internalId}
                        collapsed={!expanded[node.internalId]}
                        onChevronClick={() => {
                          setExpanded((prev) => ({
                            ...prev,
                            [node.internalId]: prev[node.internalId]
                              ? false
                              : true,
                          }));
                        }}
                        label={node.titleWithParentsContext ?? node.title}
                        type={node.expandable ? "node" : "leaf"}
                        variant={node.type}
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
                            />
                            <IconButton
                              size="xs"
                              icon={BracesIcon}
                              onClick={() => {
                                if (node.dustDocumentId) {
                                  setDataSourceToDisplay(dsConfig.dataSource);
                                  setDocumentToDisplay(node.dustDocumentId);
                                }
                              }}
                              className={classNames(
                                node.dustDocumentId
                                  ? ""
                                  : "pointer-events-none opacity-0"
                              )}
                              disabled={!node.dustDocumentId}
                            />
                          </div>
                        }
                      >
                        <PermissionTreeChildren
                          owner={owner}
                          dataSource={dsConfig.dataSource}
                          parentId={node.internalId}
                          permissionFilter="read"
                          canUpdatePermissions={true}
                          displayDocumentSource={(documentId: string) => {
                            setDataSourceToDisplay(dsConfig.dataSource);
                            setDocumentToDisplay(documentId);
                          }}
                          useConnectorPermissionsHook={useConnectorPermissions}
                        />
                      </Tree.Item>
                    );
                  })}
                </Tree.Item>
              );
            })}
          </Tree>
        )}
      </div>
    </>
  );
}
