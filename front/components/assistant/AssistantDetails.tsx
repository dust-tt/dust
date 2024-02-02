import {
  Avatar,
  Button,
  ClipboardIcon,
  CloudArrowDownIcon,
  CommandLineIcon,
  Modal,
  PlusIcon,
  ServerIcon,
  TrashIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationType,
  AgentUsageType,
  AgentUserListStatus,
  ConnectorProvider,
  CoreAPITable,
  DataSourceConfiguration,
  DustAppRunConfigurationType,
  LightAgentConfigurationType,
  TablesQueryConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import {
  isBuilder,
  isDustAppRunConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
} from "@dust-tt/types";
import Link from "next/link";
import { useCallback, useContext, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { DeleteAssistantDialog } from "@app/components/assistant/AssistantActions";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { assistantUsageMessage } from "@app/lib/assistant";
import { updateAgentUserListStatus } from "@app/lib/client/dust_api";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useAgentConfiguration, useAgentUsage, useApp } from "@app/lib/swr";
import { useAgentConfigurations } from "@app/lib/swr";

type AssistantDetailsFlow = "personal" | "workspace";

type AssistantDetailsProps = {
  owner: WorkspaceType;
  show: boolean;
  onClose: () => void;
  flow: AssistantDetailsFlow;
} & (
  | { assistantSId: string; assistant?: never }
  | { assistant: LightAgentConfigurationType; assistantSId?: never }
);

export function AssistantDetails({
  assistant,
  assistantSId,
  flow,
  onClose,
  owner,
  show,
}: AssistantDetailsProps) {
  // TODO(2024-02-01 flav) Remove `assistant` once all the call sites have been refactored.
  const assistantId = assistantSId ?? assistant.sId;

  const agentUsage = useAgentUsage({
    workspaceId: owner.sId,
    agentConfigurationId: assistantId,
  });
  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: assistantId,
  });

  const { mutateAgentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    includes: ["authors"],
  });

  const effectiveAssistant = assistant ?? agentConfiguration;
  if (!effectiveAssistant) {
    return <></>;
  }

  const DescriptionSection = () => (
    <div className="flex flex-col gap-4 sm:flex-row">
      <Avatar
        visual={
          <img src={effectiveAssistant.pictureUrl} alt="Assistant avatar" />
        }
        size="md"
      />
      <div>{effectiveAssistant.description}</div>
    </div>
  );

  const InstructionsSection = () =>
    effectiveAssistant.generation?.prompt ? (
      <div className="flex flex-col gap-2">
        <div className="text-lg font-bold text-element-800">Instructions</div>
        <ReactMarkdown>{effectiveAssistant.generation.prompt}</ReactMarkdown>
      </div>
    ) : (
      "This assistant has no instructions."
    );

  const UsageSection = ({
    assistantName,
    usage,
    isLoading,
    isError,
  }: {
    assistantName: string;
    usage: AgentUsageType | null;
    isLoading: boolean;
    isError: boolean;
  }) => (
    <div className="flex flex-col gap-2">
      <div className="text-lg font-bold text-element-800">Usage</div>
      {assistantUsageMessage({ assistantName, usage, isLoading, isError })}
    </div>
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
      title={`@${effectiveAssistant.name}`}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="flex flex-col gap-5 pt-6 text-sm text-element-700">
        <ButtonsSection
          owner={owner}
          agentConfiguration={effectiveAssistant}
          detailsModalClose={onClose}
          onUpdate={mutateAgentConfigurations}
          onClose={onClose}
          flow={flow}
        />
        <DescriptionSection />
        <InstructionsSection />
        <UsageSection
          assistantName={effectiveAssistant.name}
          usage={agentUsage.agentUsage}
          isLoading={agentUsage.isAgentUsageLoading}
          isError={agentUsage.isAgentUsageError}
        />
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

function ButtonsSection({
  owner,
  agentConfiguration,
  detailsModalClose,
  onUpdate,
  onClose,
  flow,
}: {
  owner: WorkspaceType;
  agentConfiguration: LightAgentConfigurationType;
  detailsModalClose: () => void;
  onUpdate: () => void;
  onClose: () => void;
  flow: AssistantDetailsFlow;
}) {
  const [showDeletionModal, setShowDeletionModal] = useState<boolean>(false);

  const canDelete =
    (agentConfiguration.scope === "workspace" && isBuilder(owner)) ||
    ["published", "private"].includes(agentConfiguration.scope);

  const canAddRemoveList =
    ["published", "workspace"].includes(agentConfiguration.scope) &&
    flow !== "workspace";

  const [isDuplicating, setIsDuplicating] = useState<boolean>(false);
  const [isAddingOrRemoving, setIsAddingOrRemoving] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);

  const updateAgentUserList = async (listStatus: AgentUserListStatus) => {
    setIsAddingOrRemoving(true);

    const { errorMessage, success } = await updateAgentUserListStatus({
      listStatus,
      owner,
      agentConfigurationId: agentConfiguration.sId,
    });
    if (success) {
      sendNotification({
        title: `Assistant ${
          listStatus === "in-list"
            ? "added to your list"
            : "removed from your list"
        }`,
        type: "success",
      });
      onUpdate();
    } else {
      sendNotification({
        title: `Error ${
          listStatus === "in-list" ? "adding" : "removing"
        } Assistant`,
        description: errorMessage,
        type: "error",
      });
    }

    setIsAddingOrRemoving(false);
    onClose();
  };
  return (
    <Button.List className="flex items-center justify-end gap-1">
      {flow === "personal" && (
        <Link
          href={`/w/${owner.sId}/builder/assistants/new?flow=personal_assistants&duplicate=${agentConfiguration.sId}`}
        >
          <Button
            label={isDuplicating ? "Duplicating..." : "Duplicate"}
            disabled={isDuplicating}
            variant="tertiary"
            icon={ClipboardIcon}
            size="xs"
            onClick={async () => {
              setIsDuplicating(true);
            }}
          />
        </Link>
      )}
      {canAddRemoveList &&
        (agentConfiguration.userListStatus === "in-list" ? (
          <Button
            label={isAddingOrRemoving ? "Removing..." : "Remove from my list"}
            disabled={isAddingOrRemoving}
            variant="tertiary"
            icon={XMarkIcon}
            size="xs"
            hasMagnifying={false}
            onClick={async () => {
              await updateAgentUserList("not-in-list");
            }}
          />
        ) : (
          <Button
            label={isAddingOrRemoving ? "Adding..." : "Add to my list"}
            disabled={isAddingOrRemoving}
            variant="tertiary"
            icon={PlusIcon}
            size="xs"
            hasMagnifying={false}
            onClick={async () => {
              await updateAgentUserList("in-list");
            }}
          />
        ))}

      {canDelete && (
        <>
          <DeleteAssistantDialog
            owner={owner}
            agentConfigurationId={agentConfiguration.sId}
            show={showDeletionModal}
            onClose={() => setShowDeletionModal(false)}
            onDelete={() => {
              detailsModalClose();
              onUpdate();
            }}
          />
          <Button
            label={"Delete"}
            icon={TrashIcon}
            variant="secondaryWarning"
            size="xs"
            disabled={!isBuilder(owner)}
            onClick={() => setShowDeletionModal(true)}
            hasMagnifying={false}
          />
        </>
      )}
    </Button.List>
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
