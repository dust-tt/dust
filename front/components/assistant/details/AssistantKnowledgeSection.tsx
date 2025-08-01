import {
  BracesIcon,
  Button,
  Chip,
  DocumentIcon,
  ExternalLinkIcon,
  FolderIcon,
  IconButton,
  Label,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SparklesIcon,
  Spinner,
  TableIcon,
  Tree,
} from "@dust-tt/sparkle";
import _ from "lodash";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { DataSourceViewPermissionTree } from "@app/components/DataSourceViewPermissionTree";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type {
  DataSourceConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import { getContentNodeInternalIdFromTableId } from "@app/lib/api/content_nodes";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import {
  canBeExpanded,
  getDisplayNameForDataSource,
} from "@app/lib/data_sources";
import {
  useDataSourceViewContentNodes,
  useDataSourceViews,
} from "@app/lib/swr/data_source_views";
import { classNames } from "@app/lib/utils";
import { setQueryParam } from "@app/lib/utils/router";
import type {
  AgentConfigurationType,
  ConnectorProvider,
  ContentNodesViewType,
  DataSourceTag,
  DataSourceViewType,
  LightWorkspaceType,
  TagsFilter,
} from "@app/types";
import { DocumentViewRawContentKey } from "@app/types";

interface AssistantKnowledgeSectionProps {
  agentConfiguration: AgentConfigurationType;
  owner: LightWorkspaceType;
}

export function AssistantKnowledgeSection({
  agentConfiguration,
  owner,
}: AssistantKnowledgeSectionProps) {
  const { dataSourceViews, isDataSourceViewsLoading } = useDataSourceViews(
    owner,
    {
      disabled: agentConfiguration.actions.length === 0,
    }
  );

  const categorizedActions = useMemo(() => {
    const initial = {
      retrieval: [] as { dataSources: DataSourceConfiguration[] }[],
      queryTables: [] as { tables: TableDataSourceConfiguration[] }[],
    };

    return agentConfiguration.actions.reduce((acc, action) => {
      if (isServerSideMCPServerConfiguration(action)) {
        const { tables, dataSources } = action;
        if (dataSources) {
          acc.retrieval.push({ dataSources });
        }
        if (tables) {
          acc.queryTables.push({ tables });
        }
      }
      return acc;
    }, initial);
  }, [agentConfiguration.actions]);

  const retrievalByDataSources = useMemo(() => {
    const acc: Record<string, DataSourceConfiguration> = {};
    categorizedActions.retrieval.forEach(
      (action: { dataSources: DataSourceConfiguration[] }) => {
        action.dataSources.forEach((ds: DataSourceConfiguration) => {
          if (!acc[ds.dataSourceViewId]) {
            // First one sets the filter
            acc[ds.dataSourceViewId] = ds;
          } else {
            if (ds.filter.parents) {
              const existingFilter = acc[ds.dataSourceViewId].filter.parents;
              // Merge the filters if they are not null
              if (existingFilter) {
                existingFilter.in = existingFilter.in.concat(
                  ds.filter.parents.in
                );
                existingFilter.not = existingFilter.not.concat(
                  ds.filter.parents.not
                );

                // We need to remove duplicates
                existingFilter.in = _.uniq(existingFilter.in);
                existingFilter.not = _.uniq(existingFilter.not);
              }
            } else {
              // But if the new one is null, we reset the filter (as it means "all" and all wins over specific)
              acc[ds.dataSourceViewId].filter.parents = null;
            }
          }
        });
      }
    );
    return acc;
  }, [categorizedActions.retrieval]);

  const queryTableByDataSources = useMemo(() => {
    const acc: Record<string, DataSourceConfiguration> = {};
    categorizedActions.queryTables.forEach(
      (action: { tables: TableDataSourceConfiguration[] }) => {
        const dataSources = getDataSourceConfigurationsForTableAction(
          action,
          dataSourceViews
        );
        dataSources.forEach((ds) => {
          if (!acc[ds.dataSourceViewId]) {
            // First one sets the filter
            acc[ds.dataSourceViewId] = ds;
          } else {
            if (ds.filter.parents) {
              const existingFilter = acc[ds.dataSourceViewId].filter.parents;
              // Merge the filters if they are not null
              if (existingFilter) {
                existingFilter.in = existingFilter.in.concat(
                  ds.filter.parents.in
                );
                existingFilter.not = existingFilter.not.concat(
                  ds.filter.parents.not
                );

                // We need to remove duplicates
                existingFilter.in = _.uniq(existingFilter.in);
                existingFilter.not = _.uniq(existingFilter.not);
              }
            } else {
              // But if the new one is null, we reset the filter (as it means "all" and all wins over specific)
              acc[ds.dataSourceViewId].filter.parents = null;
            }
          }
        });
      }
    );
    return acc;
  }, [categorizedActions.queryTables, dataSourceViews]);

  const hasDocuments = Object.values(retrievalByDataSources).length > 0;
  const hasTables = Object.values(queryTableByDataSources).length > 0;

  if (!hasDocuments && !hasTables) {
    return null;
  }

  const dataSourcesDocuments = Object.values(retrievalByDataSources).map(
    (dataSources, index) => (
      <div className="flex flex-col gap-2" key={`retrieval-${index}`}>
        <DataSourceViewsSection
          owner={owner}
          dataSourceViews={dataSourceViews}
          isLoading={isDataSourceViewsLoading}
          dataSourceConfigurations={[dataSources]}
          viewType="document"
        />
      </div>
    )
  );

  const dataSourcesTables = Object.values(queryTableByDataSources).map(
    (dataSources, index) => (
      <div className="flex flex-col gap-2" key={`query-tables-${index}`}>
        <DataSourceViewsSection
          owner={owner}
          dataSourceViews={dataSourceViews}
          isLoading={isDataSourceViewsLoading}
          dataSourceConfigurations={[dataSources]}
          viewType="table"
        />
      </div>
    )
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="heading-lg text-foreground dark:text-foreground-night">
        Knowledge
      </div>
      {hasDocuments && hasTables ? (
        <Tree isBoxed>
          <Tree.Item label="Documents" visual={DocumentIcon}>
            {dataSourcesDocuments}
          </Tree.Item>
          <Tree.Item label="Tables" visual={TableIcon}>
            {dataSourcesTables}
          </Tree.Item>
        </Tree>
      ) : (
        <Tree isBoxed>
          {hasDocuments && dataSourcesDocuments}
          {hasTables && dataSourcesTables}
        </Tree>
      )}
    </div>
  );
}

function getDataSourceConfigurationsForTableAction(
  action: { tables: TableDataSourceConfiguration[] },
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
              parents: dataSourceView ? { in: [], not: [] } : null,
              tags: null, // Tags are not supported for tables query.
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

interface DataSourceViewsSectionProps {
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  dataSourceConfigurations: DataSourceConfiguration[];
  viewType: ContentNodesViewType;
  isLoading: boolean;
}

function DataSourceViewsSection({
  owner,
  dataSourceViews,
  dataSourceConfigurations,
  viewType,
  isLoading,
}: DataSourceViewsSectionProps) {
  const router = useRouter();
  const { isDark } = useTheme();
  const [dataSourceViewToDisplay, setDataSourceViewToDisplay] =
    useState<DataSourceViewType | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <DataSourceViewDocumentModal
        owner={owner}
        dataSourceView={dataSourceViewToDisplay}
      />
      {isLoading ? (
        <Spinner variant="sm" />
      ) : (
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
              dsLogo = getConnectorProviderLogoWithFallback({
                provider: dataSource.connectorProvider,
                isDark,
              });
              dataSourceName = getDisplayNameForDataSource(dataSource);
            }

            const isAllSelected = dsConfig.filter.parents === null;

            return (
              <Tree.Item
                key={`${dsConfig.dataSourceViewId}-${JSON.stringify(dsConfig.filter)}`}
                type={
                  canBeExpanded(dataSourceView?.dataSource) ? "node" : "leaf"
                }
                label={dataSourceName}
                visual={dsLogo ?? FolderIcon}
                className="whitespace-nowrap"
                actions={
                  <RetrievalActionTagsFilterPopover
                    dustAPIDataSourceId={dsConfig.dataSourceViewId}
                    tagsFilter={dsConfig.filter.tags ?? null}
                    connectorProvider={
                      dataSourceView?.dataSource.connectorProvider ?? null
                    }
                  />
                }
                areActionsFading={false}
              >
                {dataSourceView && isAllSelected && (
                  <DataSourceViewPermissionTree
                    owner={owner}
                    dataSourceView={dataSourceView}
                    onDocumentViewClick={(documentId: string) => {
                      setDataSourceViewToDisplay(dataSourceView);
                      setQueryParam(router, DocumentViewRawContentKey, "true");
                      setQueryParam(router, "documentId", documentId);
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
                    setDocumentToDisplay={(documentId: string) => {
                      setQueryParam(router, DocumentViewRawContentKey, "true");
                      setQueryParam(router, "documentId", documentId);
                    }}
                    viewType={viewType}
                  />
                )}
              </Tree.Item>
            );
          })}
        </Tree>
      )}
    </div>
  );
}

function RetrievalActionTagsFilterPopover({
  dustAPIDataSourceId,
  tagsFilter,
  connectorProvider,
}: {
  dustAPIDataSourceId: string;
  tagsFilter: TagsFilter;
  connectorProvider: ConnectorProvider | null;
}) {
  if (tagsFilter === null) {
    return null;
  }

  const isTagsAuto: boolean = tagsFilter.mode === "auto";
  const tagsIn: DataSourceTag[] = [];
  const tagsNot: DataSourceTag[] = [];

  tagsIn.push(
    ...tagsFilter.in.map((tag) => ({
      tag,
      dustAPIDataSourceId,
      connectorProvider,
    }))
  );
  if (tagsFilter.not) {
    tagsNot.push(
      ...tagsFilter.not.map((tag) => ({
        tag,
        dustAPIDataSourceId,
        connectorProvider,
      }))
    );
  }

  const tagsCounter =
    tagsFilter.in.length + tagsFilter.not.length + (isTagsAuto ? 1 : 0);

  return (
    <PopoverRoot modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          label="Filters"
          isSelect
          counterValue={tagsCounter ? tagsCounter.toString() : "auto"}
          isCounter={tagsCounter !== null}
        />
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-4">
          {tagsIn.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Must-have</Label>
              <div className="flex flex-row flex-wrap gap-1">
                {tagsIn.map((tag) => (
                  <Chip key={tag.tag} label={tag.tag} />
                ))}
              </div>
            </div>
          )}
          {tagsNot.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Must-not-have</Label>
              <div className="flex flex-row flex-wrap gap-1">
                {tagsNot.map((tag) => (
                  <Chip key={tag.tag} label={tag.tag} color="warning" />
                ))}
              </div>
            </div>
          )}
          {isTagsAuto && (
            <div className="flex flex-col gap-2">
              <Label>In-Conversation filtering</Label>
              <div className="flex flex-row flex-wrap gap-1">
                <Chip
                  color="success"
                  label="Activated"
                  icon={SparklesIcon}
                  isBusy
                />
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
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
          label={node.title}
          type={node.expandable && viewType !== "table" ? "node" : "leaf"}
          visual={getVisualForDataSourceViewContentNode(node)}
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
                variant="ghost"
              />
              <IconButton
                size="xs"
                icon={BracesIcon}
                onClick={() => {
                  if (node.type === "document") {
                    setDataSourceViewToDisplay(dataSourceView);
                    setDocumentToDisplay(node.internalId);
                  }
                }}
                className={classNames(
                  node.type === "document"
                    ? ""
                    : "pointer-events-none opacity-0"
                )}
                disabled={node.type !== "document"}
                variant="outline"
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
            viewType="all"
          />
        </Tree.Item>
      ))}
    </>
  );
}
