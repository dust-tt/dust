import {
  BracesIcon,
  Button,
  ChatBubbleThoughtIcon,
  Chip,
  CommandLineIcon,
  ExternalLinkIcon,
  FolderIcon,
  GithubIcon,
  Icon,
  IconButton,
  Label,
  PlanetIcon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  SparklesIcon,
  Tree,
} from "@dust-tt/sparkle";
import type {
  AgentActionConfigurationType,
  AgentConfigurationType,
  ConnectorProvider,
  ContentNodesViewType,
  DataSourceConfiguration,
  DataSourceTag,
  DataSourceViewType,
  DustAppRunConfigurationType,
  LightWorkspaceType,
  RetrievalConfigurationType,
  TablesQueryConfigurationType,
  TagsFilter,
} from "@dust-tt/types";
import {
  assertNever,
  GLOBAL_AGENTS_SID,
  isBrowseConfiguration,
  isDustAppRunConfiguration,
  isGithubCreateIssueConfiguration,
  isGithubGetPullRequestConfiguration,
  isProcessConfiguration,
  isReasoningConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  isWebsearchConfiguration,
} from "@dust-tt/types";
import _ from "lodash";
import { useMemo, useState } from "react";

import DataSourceViewDocumentModal from "@app/components/DataSourceViewDocumentModal";
import { DataSourceViewPermissionTree } from "@app/components/DataSourceViewPermissionTree";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getContentNodeInternalIdFromTableId } from "@app/lib/api/content_nodes";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getVisualForContentNode } from "@app/lib/content_nodes";
import {
  canBeExpanded,
  getDisplayNameForDataSource,
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

  const retrievalByDataSources = useMemo(() => {
    const acc: Record<string, DataSourceConfiguration> = {};
    categorizedActions.retrieval.forEach((action) => {
      action.dataSources.forEach((ds) => {
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
    });
    return acc;
  }, [categorizedActions.retrieval]);

  const queryTableByDataSources = useMemo(() => {
    const acc: Record<string, DataSourceConfiguration> = {};
    categorizedActions.queryTables.forEach((action) => {
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
    });
    return acc;
  }, [categorizedActions.queryTables, dataSourceViews]);

  if (agentConfiguration.actions.length === 0) {
    return null;
  }

  return (
    <>
      {Object.values(retrievalByDataSources).length > 0 && (
        <ActionSection title="Retrieve from Documents">
          {Object.values(retrievalByDataSources).map((dataSources, index) => (
            <div className="flex flex-col gap-2" key={`retrieval-${index}`}>
              <DataSourceViewsSection
                owner={owner}
                dataSourceViews={dataSourceViews}
                dataSourceConfigurations={[dataSources]}
                viewType="documents"
              />
            </div>
          ))}
        </ActionSection>
      )}

      {Object.values(queryTableByDataSources).length > 0 && (
        <ActionSection title="Query Tables">
          {Object.values(queryTableByDataSources).map((dataSources, index) => (
            <div className="flex flex-col gap-2" key={`query-tables-${index}`}>
              <DataSourceViewsSection
                owner={owner}
                dataSourceViews={dataSourceViews}
                dataSourceConfigurations={[dataSources]}
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
        <div className="flex gap-2 text-muted-foreground">
          <Icon visual={PlanetIcon} size="sm" />
          <div>
            Agent can navigate the web (browse any provided links, make a google
            search, etc.) to answer.
          </div>
        </div>
      </ActionSection>
    );
  } else if (isReasoningConfiguration(action)) {
    return (
      <ActionSection title="Reasoning" key={`other-${index}`}>
        <Icon visual={ChatBubbleThoughtIcon} size="sm" />
        <div>
          Agent can perform step by step reasoning to solve complex problems.
          Slow but powerful.
        </div>
      </ActionSection>
    );
  } else if (isBrowseConfiguration(action)) {
    return null;
  } else if (isGithubGetPullRequestConfiguration(action)) {
    return (
      <ActionSection title="Github" key={`other-${index}`}>
        <div className="flex gap-2 text-muted-foreground">
          <Icon visual={GithubIcon} size="sm" />
          <div>Agent can retrieve pull requests from Github.</div>
        </div>
      </ActionSection>
    );
  } else if (isGithubCreateIssueConfiguration(action)) {
    return (
      <ActionSection title="Github" key={`other-${index}`}>
        <div className="flex gap-2 text-muted-foreground">
          <Icon visual={GithubIcon} size="sm" />
          <div>Agent can create issues on Github.</div>
        </div>
      </ActionSection>
    );
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
      <div className="text-text-foreground dark:text-text-foreground-night pb-2 text-lg font-medium">
        {title}
      </div>
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
  const { isDark } = useTheme();
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
              type={canBeExpanded(dataSourceView?.dataSource) ? "node" : "leaf"}
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
                  <Chip key={tag.tag} label={tag.tag} color="slate" />
                ))}
              </div>
            </div>
          )}
          {tagsNot.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Must-not-have</Label>
              <div className="flex flex-row flex-wrap gap-1">
                {tagsNot.map((tag) => (
                  <Chip key={tag.tag} label={tag.tag} color="red" />
                ))}
              </div>
            </div>
          )}
          {isTagsAuto && (
            <div className="flex flex-col gap-2">
              <Label>In-Conversation filtering</Label>
              <div className="flex flex-row flex-wrap gap-1">
                <Chip
                  color="emerald"
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
                variant="ghost"
              />
              <IconButton
                size="xs"
                icon={BracesIcon}
                onClick={() => {
                  if (node.type === "Document" || node.type === "document") {
                    setDataSourceViewToDisplay(dataSourceView);
                    setDocumentToDisplay(node.internalId);
                  }
                }}
                className={classNames(
                  node.type === "Document" || node.type === "document"
                    ? ""
                    : "pointer-events-none opacity-0"
                )}
                disabled={node.type !== "Document" && node.type !== "document"}
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

interface DustAppSectionProps {
  dustApp: DustAppRunConfigurationType;
}

function DustAppSection({ dustApp }: DustAppSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <div>The following tool is run before answering:</div>
      <div className="flex gap-2 capitalize text-muted-foreground">
        <div>
          <CommandLineIcon />
        </div>
        <div>{dustApp.name}</div>
      </div>
    </div>
  );
}
