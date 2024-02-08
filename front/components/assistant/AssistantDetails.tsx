import {
  Avatar,
  CloudArrowDownIcon,
  CommandLineIcon,
  Modal,
  Page,
  ServerIcon,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  ConnectorProvider,
  CoreAPITable,
  DataSourceConfiguration,
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
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { assistantUsageMessage } from "@app/lib/assistant";
import { updateAgentScope } from "@app/lib/client/dust_api";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useAgentConfiguration, useAgentUsage, useApp } from "@app/lib/swr";
import { timeAgoFrom } from "@app/lib/utils";
import type { GetAgentConfigurationsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations";

type AssistantDetailsProps = {
  owner: WorkspaceType;
  show: boolean;
  onClose: () => void;
  mutateAgentConfigurations?: KeyedMutator<GetAgentConfigurationsResponseBody>;
  assistantId: string;
};

export function AssistantDetails({
  assistantId,
  onClose,
  mutateAgentConfigurations,
  owner,
  show,
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
          <div className="text-lg font-bold text-element-900">{`@${agentConfiguration.name}`}</div>
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
          <div>{editedSentence + ", " + usageSentence}</div>
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
          <DataSourcesSection dataSourceConfigurations={action.dataSources} />
        </div>
      ) : isTablesQueryConfiguration(action) ? (
        <div className="flex flex-col gap-2">
          <div className="text-lg font-bold text-element-800">Tables</div>
          <TablesQuerySection tablesQueryConfig={action} />
        </div>
      ) : null
    ) : null;

  return (
    <Modal
      isOpen={show}
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
    </Modal>
  );
}

function DataSourcesSection({
  dataSourceConfigurations,
}: {
  dataSourceConfigurations: DataSourceConfiguration[];
}) {
  const getProviderName = (ds: DataSourceConfiguration) =>
    ds.dataSourceId.startsWith("managed-")
      ? (ds.dataSourceId.slice(8) as ConnectorProvider)
      : undefined;

  const compareDatasourceNames = (
    a: DataSourceConfiguration,
    b: DataSourceConfiguration
  ) => {
    const aProviderName = getProviderName(a);
    const bProviderName = getProviderName(b);
    if (aProviderName && bProviderName) {
      return aProviderName > bProviderName ? -1 : 1;
    }
    if (aProviderName) {
      return -1;
    }
    if (bProviderName) {
      return 1;
    }
    return a.dataSourceId > b.dataSourceId ? -1 : 1;
  };

  return (
    <div className="flex flex-col gap-1">
      {dataSourceConfigurations.sort(compareDatasourceNames).map((ds) => {
        const providerName = getProviderName(ds);
        const DsLogo = providerName
          ? CONNECTOR_CONFIGURATIONS[providerName].logoComponent
          : CloudArrowDownIcon;
        const dsDocumentNumberText = `(${
          ds.filter.parents?.in.length ?? "all"
        } element(s))`;
        return (
          <div className="flex flex-col gap-2" key={ds.dataSourceId}>
            <div className="flex items-center gap-2">
              <div>
                <DsLogo />
              </div>
              <div>{`${
                providerName ?? ds.dataSourceId
              } ${dsDocumentNumberText}`}</div>
            </div>
          </div>
        );
      })}
    </div>
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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <div>Loading...</div>;
      </div>
    );
  }

  if (!tables) {
    return (
      <div className="flex flex-col gap-2">
        <div>Error loading tables.</div>;
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
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
    </div>
  );
}
