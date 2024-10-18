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
  const { dataSourceViews } = useDataSourceViews(owner, {
    disabled: agentConfiguration.actions.length === 0,
  });

  const categorizedActions = useMemo(() => {
    const initial = {
      retrieval: [] as RetrievalConfigurationType[],
      queryTables: [] as TablesQueryConfigurationType[],
      other: [] as AgentActionConfigurationType[],
    };

    const isDustGlobalAgent = agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST;

    return agentConfiguration.actions.reduce((acc, action) => {
      // Since Dust is configured with one search for all, plus individual searches for each managed data source,
      // we hide these additional searches from the user in the UI to avoid displaying the same data source twice.
      // We use the `hidden_dust_search_` prefix to identify these additional searches.
      if (
        isRetrievalConfiguration(action) &&
        (!isDustGlobalAgent || !action.name.startsWith("hidden_dust_search_"))
      ) {
        acc.retrieval.push(action);
      } else if (isTablesQueryConfiguration(action)) {
        acc.queryTables.push(action);
      } else {
        acc.other.push(action);
      }
      return acc;
    }, initial);
  }, [agentConfiguration.actions, agentConfiguration.sId]);

  if (agentConfiguration.actions.length === 0) {
    return null;
  }

  return (
    <>
      {categorizedActions.retrieval.length > 0 && (
        <ActionSection title="Retrieve from Documents">
          {categorizedActions.retrieval.map((action, index) => (
            <div className="flex flex-col gap-2" key={`retrieval-${index}`}>
              <DataSourceViewsSection
                owner={owner}
                dataSourceViews={dataSourceViews}
                dataSourceConfigurations={action.dataSources}
                viewType="documents"
              />
            </div>
          ))}
        </ActionSection>
      )}

      {categorizedActions.queryTables.length > 0 && (
        <ActionSection title="Query Tables">
          {categorizedActions.queryTables.map((action, index) => (
            <div className="flex flex-col gap-2" key={`query-tables-${index}`}>
              <DataSourceViewsSection
                owner={owner}
                dataSourceViews={dataSourceViews}
                dataSourceConfigurations={getDataSourceConfigurationsForTableAction(
                  action,
                  dataSourceViews
                )}
                viewType="tables"
              />
            </div>
          ))}
        </ActionSection>
      )}

      {categorizedActions.other.map((action, index) =>
        renderOtherAction(action, index, owner, dataSourceViews)
      )}
    </>
  );
}

function getDataSourceConfigurationsForTableAction(
  action: TablesQueryConfigurationType,
  dataSourceViews: DataSourceViewType[]
) {
  return Object.values(
    action.tables.reduce(
      (dsConfigs, table) => {
        // We should never have an undefined dataSourceView here as if it's undefined,
        // it means the dataSourceView was deleted and the configuration is invalid But
        // we need to handle this case to avoid crashing the UI
        const dataSourceView = dataSourceViews.find(
          (dsv) => dsv.sId === table.dataSourceViewId
        );

        if (!dsConfigs[table.dataSourceViewId]) {
          dsConfigs[table.dataSourceViewId] = {
            workspaceId: table.workspaceId,
            dataSourceViewId: table.dataSourceViewId,
            filter: {
              parents:
                dataSourceView && isFolder(dataSourceView.dataSource)
                  ? null
                  : { in: [], not: [] },
            },
          };
        }

        if (dataSourceView) {
          dsConfigs[table.dataSourceViewId].filter.parents?.in.push(
            getContentNodeInternalIdFromTableId(dataSourceView, table.tableId)
          );
        }

        return dsConfigs;
      },
      {} as Record<string, DataSourceConfiguration>
    )
  );
}

function renderOtherAction(
  action: AgentActionConfigurationType,
  index: number,
  owner: LightWorkspaceType,
  dataSourceViews: DataSourceViewType[]
) {
  if (isDustAppRunConfiguration(action)) {
    return (
      <ActionSection title="Run Actions" key={`other-${index}`}>
        <DustAppSection dustApp={action} />
      </ActionSection>
    );
  } else if (isProcessConfiguration(action)) {
    return (
      <ActionSection title="Extract from documents" key={`other-${index}`}>
        <DataSourceViewsSection
          owner={owner}
          dataSourceViews={dataSourceViews}
          dataSourceConfigurations={action.dataSources}
          viewType="documents"
        />
      </ActionSection>
    );
  } else if (isWebsearchConfiguration(action)) {
    return (
      <ActionSection title="Web navigation" key={`other-${index}`}>
        <div className="flex items-center gap-2">
          <Icon visual={PlanetIcon} size="xs" />
          <div>
            Assistant can navigate the web (browse any provided links, make a
            google search, etc.) to answer
          </div>
        </div>
      </ActionSection>
    );
  } else if (isBrowseConfiguration(action)) {
    return null;
  } else if (
    !isRetrievalConfiguration(action) &&
    !isTablesQueryConfiguration(action)
  ) {
    return assertNever(action);
  }
}

interface ActionSectionProps {
  title: string;
  children: React.ReactNode;
}

function ActionSection({ title, children }: ActionSectionProps) {
  return (
    <div>
      <div className="pb-2 text-lg font-bold text-element-800">{title}</div>
      {children}
    </div>
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
