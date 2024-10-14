import {
  BracesIcon,
  CommandLineIcon,
  ExternalLinkIcon,
  FolderIcon,
  Icon,
  IconButton,
  PlanetIcon,
  Tree,
} from "@dust-tt/sparkle";
import type {
  AgentActionConfigurationType,
  AgentConfigurationType,
  ContentNodesViewType,
  DataSourceConfiguration,
  DataSourceViewType,
  DustAppRunConfigurationType,
  LightWorkspaceType,
  RetrievalConfigurationType,
  TablesQueryConfigurationType,
} from "@dust-tt/types";
import {
  assertNever,
  isBrowseConfiguration,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  isWebsearchConfiguration,
} from "@dust-tt/types";
import { useMemo, useState } from "react";

import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { DataSourceViewPermissionTree } from "@app/components/DataSourceViewPermissionTree";
import { getContentNodeInternalIdFromTableId } from "@app/lib/api/content_nodes";
import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import {
  canBeExpanded,
  getDisplayNameForDataSource,
  isFolder,
} from "@app/lib/data_sources";
import {
  useDataSourceViewContentNodes,
  useDataSourceViews,
} from "@app/lib/swr/data_source_views";
import { classNames } from "@app/lib/utils";

interface AssistantActionsSectionProps {
  agentConfiguration: AgentConfigurationType;
  owner: LightWorkspaceType;
}

export function AssistantActionsSection({
  agentConfiguration,
  owner,
}: AssistantActionsSectionProps) {
  const isDustGlobalAgent = agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST;

  const { dataSourceViews } = useDataSourceViews(owner);

  const [retrievalActions, queryTablesActions, otherActions] = useMemo(() => {
    return agentConfiguration.actions.reduce(
      ([dataSources, queryTables, otherActions], a) => {
        // Since Dust is configured with one search for all, plus individual searches for each managed data source,
        // we hide these additional searches from the user in the UI to avoid displaying the same data source twice.
        // We use the `hidden_dust_search_` prefix to identify these additional searches.
        if (
          isRetrievalConfiguration(a) &&
          (!isDustGlobalAgent || !a.name.startsWith("hidden_dust_search_"))
        ) {
          dataSources.push(a);
        } else if (isTablesQueryConfiguration(a)) {
          queryTables.push(a);
        } else {
          otherActions.push(a);
        }
        return [dataSources, queryTables, otherActions];
      },
      [
        [] as RetrievalConfigurationType[],
        [] as TablesQueryConfigurationType[],
        [] as AgentActionConfigurationType[],
      ]
    );
  }, [isDustGlobalAgent, agentConfiguration.actions]);

  return (
    !!agentConfiguration.actions.length && (
      <>
        {!!retrievalActions.length && (
          <div>
            <div className="pb-2 text-lg font-bold text-element-800">
              Retrieve from Documents
            </div>
            {retrievalActions.map((a, index) => (
              <div className="flex flex-col gap-2" key={`action-${index}`}>
                <DataSourceViewsSection
                  owner={owner}
                  dataSourceViews={dataSourceViews}
                  dataSourceConfigurations={a.dataSources}
                  viewType="documents"
                />
              </div>
            ))}
          </div>
        )}
        {!!queryTablesActions.length && (
          <div>
            <div className="pb-2 text-lg font-bold text-element-800">
              Query Tables
            </div>
            {queryTablesActions.map((action, index) => (
              <div className="flex flex-col gap-2" key={`action-${index}`}>
                <DataSourceViewsSection
                  owner={owner}
                  dataSourceViews={dataSourceViews}
                  dataSourceConfigurations={Object.values(
                    action.tables.reduce(
                      (dsConfigs, t) => {
                        // We should never have an undefined dataSourceView here as if it's undefined,
                        // it means the dataSourceView was deleted and the configuration is invalid But
                        // we need to handle this case to avoid crashing the UI
                        const dataSourceView = dataSourceViews.find(
                          (dsv) => dsv.sId == t.dataSourceViewId
                        );

                        // Initializing the datasource configuration if we are seeing the id for the first time
                        dsConfigs[t.dataSourceViewId] ||= {
                          workspaceId: t.workspaceId,
                          dataSourceViewId: t.dataSourceViewId,
                          filter: {
                            parents:
                              dataSourceView &&
                              isFolder(dataSourceView.dataSource)
                                ? null
                                : { in: [], not: [] },
                          },
                        };

                        // Pushing a new parent
                        if (dataSourceView) {
                          dsConfigs[t.dataSourceViewId].filter.parents?.in.push(
                            getContentNodeInternalIdFromTableId(
                              dataSourceView,
                              t.tableId
                            )
                          );
                        }
                        return dsConfigs;
                      },
                      {} as Record<string, DataSourceConfiguration>
                    )
                  )}
                  viewType="tables"
                />
              </div>
            ))}
          </div>
        )}
        {otherActions.map((action, index) =>
          isDustAppRunConfiguration(action) ? (
            <div className="flex flex-col gap-2" key={`action-${index}`}>
              <div className="text-lg font-bold text-element-800">
                Run Actions
              </div>
              <DustAppSection dustApp={action} />
            </div>
          ) : isProcessConfiguration(action) ? (
            <div className="flex flex-col gap-2" key={`action-${index}`}>
              <div className="text-lg font-bold text-element-800">
                Extract from documents
              </div>
              <DataSourceViewsSection
                owner={owner}
                dataSourceViews={dataSourceViews}
                dataSourceConfigurations={action.dataSources}
                viewType="documents"
              />
            </div>
          ) : isWebsearchConfiguration(action) ? (
            <div className="flex flex-col gap-2" key={`action-${index}`}>
              <div className="text-lg font-bold text-element-800">
                Web navigation
              </div>
              <div className="flex items-center gap-2">
                <Icon visual={PlanetIcon} size="xs" />
                <div>
                  Assistant can navigate the web (browse any provided links,
                  make a google search, etc.) to answer
                </div>
              </div>
            </div>
          ) : isBrowseConfiguration(action) ? (
            false
          ) : (
            !isRetrievalConfiguration(action) &&
            !isTablesQueryConfiguration(action) &&
            assertNever(action)
          )
        )}
      </>
    )
  );
}

interface DataSourceViewsSectionProps {
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  dataSourceConfigurations: DataSourceConfiguration[];
  viewType: ContentNodesViewType;
}

function DataSourceViewsSection({
  owner,
  dataSourceViews,
  dataSourceConfigurations,
  viewType,
}: DataSourceViewsSectionProps) {
  const [documentToDisplay, setDocumentToDisplay] = useState<string | null>(
    null
  );
  const [dataSourceViewToDisplay, setDataSourceViewToDisplay] =
    useState<DataSourceViewType | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <DataSourceViewDocumentModal
        owner={owner}
        dataSourceView={dataSourceViewToDisplay}
        documentId={documentToDisplay}
        isOpen={!!documentToDisplay}
        onClose={() => setDocumentToDisplay(null)}
      />
      <Tree>
        {dataSourceConfigurations.map((dsConfig) => {
          const dataSourceView = dataSourceViews.find(
            (dsv) => dsv.sId === dsConfig.dataSourceViewId
          );

          // We won't throw here if dataSourceView is null to avoid crashing the UI but this is not
          // supposed to happen as we delete the configurations when data sources are deleted.
          let dsLogo = null;
          let dataSourceName = "Deleted data source";

          if (dataSourceView) {
            const { dataSource } = dataSourceView;
            dsLogo = getConnectorProviderLogoWithFallback(
              dataSource.connectorProvider,
              FolderIcon
            );
            dataSourceName = getDisplayNameForDataSource(dataSource);
          }

          const isAllSelected = dsConfig.filter.parents === null;

          return (
            <Tree.Item
              key={`${dsConfig.dataSourceViewId}-${JSON.stringify(dsConfig.filter)}`}
              type={
                canBeExpanded(viewType, dataSourceView?.dataSource)
                  ? "node"
                  : "leaf"
              }
              label={dataSourceName}
              visual={dsLogo ?? FolderIcon}
              className="whitespace-nowrap"
            >
              {dataSourceView && isAllSelected && (
                <DataSourceViewPermissionTree
                  owner={owner}
                  dataSourceView={dataSourceView}
                  onDocumentViewClick={(documentId: string) => {
                    setDataSourceViewToDisplay(dataSourceView);
                    setDocumentToDisplay(documentId);
                  }}
                  viewType={viewType}
                />
              )}
              {dataSourceView && !isAllSelected && (
                <DataSourceViewSelectedNodes
                  owner={owner}
                  dataSourceView={dataSourceView}
                  dataSourceConfiguration={dsConfig}
                  setDataSourceViewToDisplay={setDataSourceViewToDisplay}
                  setDocumentToDisplay={setDocumentToDisplay}
                  viewType={viewType}
                />
              )}
            </Tree.Item>
          );
        })}
      </Tree>
    </div>
  );
}

interface DataSourceViewSelectedNodesProps {
  dataSourceConfiguration: DataSourceConfiguration;
  dataSourceView: DataSourceViewType;
  owner: LightWorkspaceType;
  viewType: ContentNodesViewType;
  setDataSourceViewToDisplay: (dsv: DataSourceViewType) => void;
  setDocumentToDisplay: (documentId: string) => void;
}

function DataSourceViewSelectedNodes({
  dataSourceConfiguration,
  dataSourceView,
  owner,
  viewType,
  setDataSourceViewToDisplay,
  setDocumentToDisplay,
}: DataSourceViewSelectedNodesProps) {
  const { nodes } = useDataSourceViewContentNodes({
    owner,
    dataSourceView,
    internalIds: dataSourceConfiguration.filter.parents?.in ?? undefined,
    viewType,
  });

  return (
    <>
      {nodes.map((node) => (
        <Tree.Item
          key={node.internalId}
          label={node.titleWithParentsContext ?? node.title}
          type={node.expandable && viewType !== "tables" ? "node" : "leaf"}
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
                  node.sourceUrl ? "" : "pointer-events-none opacity-0"
                )}
                disabled={!node.sourceUrl}
                variant="tertiary"
              />
              <IconButton
                size="xs"
                icon={BracesIcon}
                onClick={() => {
                  if (node.dustDocumentId) {
                    setDataSourceViewToDisplay(dataSourceView);
                    setDocumentToDisplay(node.dustDocumentId);
                  }
                }}
                className={classNames(
                  node.dustDocumentId ? "" : "pointer-events-none opacity-0"
                )}
                disabled={!node.dustDocumentId}
                variant="tertiary"
              />
            </div>
          }
        >
          <DataSourceViewPermissionTree
            owner={owner}
            dataSourceView={dataSourceView}
            parentId={node.internalId}
            onDocumentViewClick={(documentId: string) => {
              setDataSourceViewToDisplay(dataSourceView);
              setDocumentToDisplay(documentId);
            }}
            viewType="documents"
          />
        </Tree.Item>
      ))}
    </>
  );
}

interface DustAppSectionProps {
  dustApp: DustAppRunConfigurationType;
}

function DustAppSection({ dustApp }: DustAppSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <div>The following tool is run before answering:</div>
      <div className="flex items-center gap-2 capitalize">
        <div>
          <CommandLineIcon />
        </div>
        <div>{dustApp.name}</div>
      </div>
    </div>
  );
}
