import {
  Avatar,
  BracesIcon,
  CommandLineIcon,
  ElementModal,
  ExternalLinkIcon,
  IconButton,
  Page,
  ServerIcon,
  Spinner,
  Tree,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  ContentNode,
  CoreAPITable,
  DataSourceConfiguration,
  DataSourceType,
  DustAppRunConfigurationType,
  TablesQueryConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  isDustAppRunConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
} from "@dust-tt/types";
import { useCallback, useContext, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { KeyedMutator } from "swr";

import AssistantListActions from "@app/components/assistant/AssistantListActions";
import { AssistantEditionMenu } from "@app/components/assistant/conversation/AssistantEditionMenu";
import { SharingDropdown } from "@app/components/assistant/Sharing";
import { assistantUsageMessage } from "@app/components/assistant/Usage";
import { PermissionTreeChildren } from "@app/components/ConnectorPermissionsTree";
import ManagedDataSourceDocumentModal from "@app/components/ManagedDataSourceDocumentModal";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { updateAgentScope } from "@app/lib/client/dust_api";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import {
  useAgentConfiguration,
  useAgentUsage,
  useApp,
  useConnectorPermissions,
  useDataSourceContentNodes,
  useDataSources,
} from "@app/lib/swr";
import { classNames, timeAgoFrom } from "@app/lib/utils";
import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";

type AssistantDetailsProps = {
  owner: WorkspaceType;
  onClose: () => void;
  mutateAgentConfigurations?: KeyedMutator<GetAgentConfigurationsResponseBody>;
  assistantId: string | null;
};

export function AssistantDetails({
  assistantId,
  onClose,
  mutateAgentConfigurations,
  owner,
}: AssistantDetailsProps) {
  const sendNotification = useContext(SendNotificationsContext);
  const agentUsage = useAgentUsage({
    workspaceId: owner.sId,
    agentConfigurationId: assistantId,
  });
  const {
    agentConfiguration,
    mutateAgentConfiguration: mutateCurrentAgentConfiguration,
  } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: assistantId,
  });

  const { dataSources } = useDataSources(owner);

  const [isUpdatingScope, setIsUpdatingScope] = useState(false);

  if (!agentConfiguration) {
    return <></>;
  }
  const updateScope = async (
    scope: Exclude<AgentConfigurationScope, "global">
  ) => {
    setIsUpdatingScope(true);

    const { success, errorMessage } = await updateAgentScope({
      scope,
      owner,
      agentConfigurationId: agentConfiguration.sId,
    });

    if (success) {
      sendNotification({
        title: `Assistant sharing updated.`,
        type: "success",
      });
      if (mutateAgentConfigurations) {
        await mutateAgentConfigurations();
      }
      await mutateCurrentAgentConfiguration();
    } else {
      sendNotification({
        title: `Error updating assistant sharing.`,
        description: errorMessage,
        type: "error",
      });
    }

    setIsUpdatingScope(false);
  };

  const usageSentence = assistantUsageMessage({
    assistantName: agentConfiguration.name,
    usage: agentUsage.agentUsage,
    isLoading: agentUsage.isAgentUsageLoading,
    isError: agentUsage.isAgentUsageError,
    shortVersion: true,
  });
  const editedSentence =
    agentConfiguration.versionCreatedAt &&
    `Last edited ${timeAgoFrom(
      Date.parse(agentConfiguration.versionCreatedAt)
    )} ago`;
  const DescriptionSection = () => (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Avatar
          visual={
            <img src={agentConfiguration.pictureUrl} alt="Assistant avatar" />
          }
          size="lg"
        />
        <div className="flex grow flex-col gap-1">
          <div
            className={classNames(
              "font-bold text-element-900",
              agentConfiguration.name.length > 20 ? "text-md" : "text-lg"
            )}
          >{`@${agentConfiguration.name}`}</div>
          <SharingDropdown
            owner={owner}
            agentConfiguration={agentConfiguration}
            initialScope={agentConfiguration.scope}
            newScope={agentConfiguration.scope}
            disabled={isUpdatingScope}
            setNewScope={(scope) => updateScope(scope)}
          />
          <AssistantListActions
            agentConfiguration={agentConfiguration}
            owner={owner}
            isParentHovered={true}
            onAssistantListUpdate={() => void mutateAgentConfigurations?.()}
          />
        </div>
        <div>
          <AssistantEditionMenu
            agentConfigurationId={agentConfiguration.sId}
            owner={owner}
            variant="button"
            tryButton
            onAgentDeletion={() => {
              void mutateCurrentAgentConfiguration();
              void mutateAgentConfigurations?.();
            }}
          />
        </div>
      </div>
      <div className="text-sm text-element-900">
        {agentConfiguration.description}
      </div>
      {agentConfiguration.scope === "global" && usageSentence && (
        <div className="text-xs">{usageSentence}</div>
      )}
      {(agentConfiguration.scope === "workspace" ||
        agentConfiguration.scope === "published") && (
        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {agentConfiguration.lastAuthors && (
            <div>
              <span className="font-bold">By: </span>{" "}
              {agentConfiguration.lastAuthors.join(", ")}
            </div>
          )}
          <div>
            {editedSentence + ", "} {usageSentence}
          </div>
        </div>
      )}
      <Page.Separator />
    </div>
  );

  const InstructionsSection = () =>
    agentConfiguration.generation?.prompt ? (
      <div className="flex flex-col gap-2">
        <div className="text-lg font-bold text-element-800">Instructions</div>
        <ReactMarkdown>{agentConfiguration.generation.prompt}</ReactMarkdown>
      </div>
    ) : (
      "This assistant has no instructions."
    );

  const ActionSection = ({
    action,
  }: {
    action: AgentConfigurationType["action"];
  }) =>
    action ? (
      isDustAppRunConfiguration(action) ? (
        <div className="flex flex-col gap-2">
          <div className="text-lg font-bold text-element-800">Action</div>
          <DustAppSection dustApp={action} owner={owner} />
        </div>
      ) : isRetrievalConfiguration(action) ? (
        <div className="flex flex-col gap-2">
          <div className="text-lg font-bold text-element-800">
            Data source(s)
          </div>
          <DataSourcesSection
            owner={owner}
            dataSources={dataSources}
            dataSourceConfigurations={action.dataSources}
          />
        </div>
      ) : isTablesQueryConfiguration(action) ? (
        <div className="flex flex-col gap-2">
          <div className="text-lg font-bold text-element-800">Tables</div>
          <TablesQuerySection tablesQueryConfig={action} />
        </div>
      ) : null
    ) : null;

  return (
    <ElementModal
      openOnElement={agentConfiguration}
      title=""
      onClose={() => onClose()}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="flex flex-col gap-5 pt-6 text-sm text-element-700">
        <DescriptionSection />
        <InstructionsSection />
        <ActionSection action={agentConfiguration?.action || null} />
      </div>
    </ElementModal>
  );
}

function DataSourcesSection({
  owner,
  dataSources,
  dataSourceConfigurations,
}: {
  owner: WorkspaceType;
  dataSources: DataSourceType[];
  dataSourceConfigurations: DataSourceConfiguration[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [documentToDisplay, setDocumentToDisplay] = useState<string | null>(
    null
  );
  const [dataSourceToDisplay, setDataSourceToDisplay] =
    useState<DataSourceType | null>(null);

  return (
    <div className="flex flex-col gap-1">
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
      <Tree>
        {dataSourceConfigurations.map((dsConfig) => {
          const ds = dataSources.find(
            (ds) => ds.name === dsConfig.dataSourceId
          );

          let DsLogo = null;
          let dataSourceName = dsConfig.dataSourceId;

          if (ds) {
            DsLogo = ds.connectorProvider
              ? CONNECTOR_CONFIGURATIONS[ds.connectorProvider].logoComponent
              : null;
            dataSourceName = getDisplayNameForDataSource(ds);
          }

          const isAllSelected = dsConfig.filter.parents === null;

          return (
            <Tree.Item
              key={dsConfig.dataSourceId}
              collapsed={!expanded[dsConfig.dataSourceId]}
              onChevronClick={() => {
                setExpanded((prev) => ({
                  ...prev,
                  [dsConfig.dataSourceId]: prev[dsConfig.dataSourceId]
                    ? false
                    : true,
                }));
              }}
              type={ds && ds.connectorId ? "node" : "leaf"}
              label={dataSourceName}
              visual={DsLogo ? <DsLogo className="s-h-5 s-w-5" /> : null}
              variant="folder" // in case LogoComponent is null
              className="whitespace-nowrap"
            >
              {ds && isAllSelected && (
                <PermissionTreeChildren
                  owner={owner}
                  dataSource={ds}
                  parentId={null}
                  permissionFilter="read"
                  canUpdatePermissions={false}
                  displayDocumentSource={(documentId: string) => {
                    setDataSourceToDisplay(ds);
                    setDocumentToDisplay(documentId);
                  }}
                  useConnectorPermissionsHook={useConnectorPermissions}
                />
              )}
              {ds && !isAllSelected && (
                <DataSourceSelectedNodes
                  owner={owner}
                  dataSource={ds}
                  dataSourceConfiguration={dsConfig}
                  setDataSourceToDisplay={setDataSourceToDisplay}
                  setDocumentToDisplay={setDocumentToDisplay}
                />
              )}
            </Tree.Item>
          );
        })}
      </Tree>
    </div>
  );
}

function DataSourceSelectedNodes({
  owner,
  dataSource,
  dataSourceConfiguration,
  setDataSourceToDisplay,
  setDocumentToDisplay,
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  dataSourceConfiguration: DataSourceConfiguration;
  setDataSourceToDisplay: (ds: DataSourceType) => void;
  setDocumentToDisplay: (documentId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const dataSourceSelectedNodes = useDataSourceContentNodes({
    owner,
    dataSource,
    internalIds: dataSourceConfiguration.filter.parents?.in ?? [],
  });

  return (
    <>
      {dataSourceSelectedNodes.nodes.map((node: ContentNode) => (
        <Tree.Item
          key={node.internalId}
          collapsed={!expanded[node.internalId]}
          onChevronClick={() => {
            setExpanded((prev) => ({
              ...prev,
              [node.internalId]: prev[node.internalId] ? false : true,
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
                  node.sourceUrl ? "" : "pointer-events-none opacity-0"
                )}
                disabled={!node.sourceUrl}
              />
              <IconButton
                size="xs"
                icon={BracesIcon}
                onClick={() => {
                  if (node.dustDocumentId) {
                    setDataSourceToDisplay(dataSource);
                    setDocumentToDisplay(node.dustDocumentId);
                  }
                }}
                className={classNames(
                  node.dustDocumentId ? "" : "pointer-events-none opacity-0"
                )}
                disabled={!node.dustDocumentId}
              />
            </div>
          }
        >
          <PermissionTreeChildren
            owner={owner}
            dataSource={dataSource}
            parentId={node.internalId}
            permissionFilter="read"
            canUpdatePermissions={true}
            displayDocumentSource={(documentId: string) => {
              setDataSourceToDisplay(dataSource);
              setDocumentToDisplay(documentId);
            }}
            useConnectorPermissionsHook={useConnectorPermissions}
          />
        </Tree.Item>
      ))}
    </>
  );
}

function DustAppSection({
  owner,
  dustApp,
}: {
  owner: WorkspaceType;
  dustApp: DustAppRunConfigurationType;
}) {
  const { app } = useApp({ workspaceId: owner.sId, appId: dustApp.appId });
  return (
    <div className="flex flex-col gap-2">
      <div>The following action is run before answering:</div>
      <div className="flex items-center gap-2 capitalize">
        <div>
          <CommandLineIcon />
        </div>
        <div>{app ? app.name : ""}</div>
      </div>
    </div>
  );
}

function TablesQuerySection({
  tablesQueryConfig,
}: {
  tablesQueryConfig: TablesQueryConfigurationType;
}) {
  const [tables, setTables] = useState<CoreAPITable[] | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);

  const getTables = useCallback(async () => {
    if (!tablesQueryConfig.tables.length) {
      return;
    }

    const tableEndpoints = tablesQueryConfig.tables.map(
      (t) =>
        `/api/w/${t.workspaceId}/data_sources/${t.dataSourceId}/tables/${t.tableId}`
    );

    const results = await Promise.all(
      tableEndpoints.map((endpoint) =>
        fetch(endpoint, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const tablesParsed = [];
    for (const res of results) {
      if (!res.ok) {
        throw new Error((await res.json()).error.message);
      }
      tablesParsed.push((await res.json()).table);
    }

    setTables(tablesParsed);
  }, [tablesQueryConfig.tables]);

  useEffect(() => {
    if (!tablesQueryConfig.tables || isLoading || isError || tables?.length) {
      return;
    }
    setIsLoading(true);
    getTables()
      .catch(() => setIsError(true))
      .finally(() => setIsLoading(false));
  }, [getTables, isLoading, tablesQueryConfig.tables, tables?.length, isError]);

  return (
    <div className="flex flex-col gap-2">
      {isLoading ? (
        <Spinner />
      ) : !tablesQueryConfig.tables.length ? (
        <span>No tables are currently linked to this assistant.</span>
      ) : tables ? (
        <>
          <div>The following tables are queried before answering:</div>
          {tables.map((t) => (
            <div
              className="flex flex-row items-center gap-2"
              key={`${t.data_source_id}/${t.table_id}`}
            >
              <div>
                <ServerIcon />
              </div>
              <div key={`${t.data_source_id}/${t.table_id}`}>{t.name}</div>
            </div>
          ))}
        </>
      ) : (
        <div>Error loading tables.</div>
      )}
    </div>
  );
}
