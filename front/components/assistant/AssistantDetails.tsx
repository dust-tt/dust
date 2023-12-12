import {
  Avatar,
  Button,
  CloudArrowDownIcon,
  CommandLineIcon,
  DashIcon,
  Modal,
  PlusIcon,
  TrashIcon,
} from "@dust-tt/sparkle";
import { AgentUserListStatus, ConnectorProvider } from "@dust-tt/types";
import {
  DustAppRunConfigurationType,
  isDustAppRunConfiguration,
} from "@dust-tt/types";
import {
  DataSourceConfiguration,
  isRetrievalConfiguration,
} from "@dust-tt/types";
import { AgentConfigurationType } from "@dust-tt/types";
import { WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";
import ReactMarkdown from "react-markdown";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { useApp } from "@app/lib/swr";
import { PostAgentListStatusRequestBody } from "@app/pages/api/w/[wId]/members/me/agent_list_status";

export function AssistantDetails({
  owner,
  assistant,
  show,
  onClose,
  onUpdate,
}: {
  owner: WorkspaceType;
  assistant: AgentConfigurationType;
  show: boolean;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const DescriptionSection = () => (
    <div className="flex flex-col gap-4 sm:flex-row">
      <Avatar
        visual={<img src={assistant.pictureUrl} alt="Assistant avatar" />}
        size="md"
      />
      <div>{assistant.description}</div>
    </div>
  );

  const InstructionsSection = () =>
    assistant.generation?.prompt ? (
      <div className="flex flex-col gap-2">
        <div className="text-lg font-bold text-element-800">Instructions</div>
        <ReactMarkdown>{assistant.generation.prompt}</ReactMarkdown>
      </div>
    ) : (
      "This assistant has no instructions."
    );

  const ActionSection = () =>
    assistant.action ? (
      isDustAppRunConfiguration(assistant.action) ? (
        <div className="flex flex-col gap-2">
          <div className="text-lg font-bold text-element-800">Action</div>
          <DustAppSection dustApp={assistant.action} owner={owner} />
        </div>
      ) : isRetrievalConfiguration(assistant.action) ? (
        <div className="flex flex-col gap-2">
          <div className="text-lg font-bold text-element-800">
            Data source(s)
          </div>
          <DataSourcesSection
            dataSourceConfigurations={assistant.action.dataSources}
          />
        </div>
      ) : null
    ) : null;

  return (
    <Modal
      isOpen={show}
      title={`@${assistant.name}`}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <div className="flex flex-col gap-5 p-6 text-sm text-element-700">
        <ButtonsSection
          owner={owner}
          agentConfiguration={assistant}
          detailsModalClose={onClose}
          onUpdate={onUpdate}
          onClose={onClose}
        />
        <DescriptionSection />
        <InstructionsSection />
        <ActionSection />
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
}: {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
  detailsModalClose: () => void;
  onUpdate: () => void;
  onClose: () => void;
}) {
  const [showDeletionModal, setShowDeletionModal] = useState<boolean>(false);

  const canDelete =
    (agentConfiguration.scope === "workspace" &&
      ["builder", "admin"].includes(owner.role)) ||
    ["published", "private"].includes(agentConfiguration.scope);

  const canAddRemoveList = ["published", "workspace"].includes(
    agentConfiguration.scope
  );

  const [isAddingOrRemoving, setIsAddingOrRemoving] = useState<boolean>(false);
  const sendNotification = useContext(SendNotificationsContext);

  const updateAgentUserListStatus = async (listStatus: AgentUserListStatus) => {
    setIsAddingOrRemoving(true);

    const body: PostAgentListStatusRequestBody = {
      agentId: agentConfiguration.sId,
      listStatus,
    };

    const res = await fetch(
      `/api/w/${owner.sId}/members/me/agent_list_status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const data = await res.json();
      sendNotification({
        title: `Error ${
          listStatus === "in-list" ? "adding" : "removing"
        } Assistant`,
        description: data.error.message,
        type: "error",
      });
    } else {
      sendNotification({
        title: `Assistant ${listStatus === "in-list" ? "added" : "removed"}`,
        type: "success",
      });
      onUpdate();
    }

    setIsAddingOrRemoving(false);
    onClose();
  };

  return (
    <Button.List className="flex items-center justify-end gap-1">
      {canAddRemoveList &&
        (agentConfiguration.userListStatus === "in-list" ? (
          <Button
            label={isAddingOrRemoving ? "Removing..." : "Remove from my list"}
            disabled={isAddingOrRemoving}
            variant="tertiary"
            icon={DashIcon}
            size="xs"
            onClick={async () => {
              await updateAgentUserListStatus("not-in-list");
            }}
          />
        ) : (
          <Button
            label={isAddingOrRemoving ? "Adding..." : "Add to my list"}
            disabled={isAddingOrRemoving}
            variant="tertiary"
            icon={PlusIcon}
            size="xs"
            onClick={async () => {
              await updateAgentUserListStatus("in-list");
            }}
          />
        ))}

      {canDelete && (
        <>
          <DeletionModal
            owner={owner}
            agentConfiguration={agentConfiguration}
            show={showDeletionModal}
            onClose={() => setShowDeletionModal(false)}
            onDelete={onUpdate}
            detailsModalClose={detailsModalClose}
          />
          <Button
            label={"Delete"}
            icon={TrashIcon}
            variant="secondaryWarning"
            size="xs"
            disabled={!["builder", "admin"].includes(owner.role)}
            onClick={() => setShowDeletionModal(true)}
          />
        </>
      )}
    </Button.List>
  );
}

function DeletionModal({
  owner,
  agentConfiguration,
  show,
  onClose,
  onDelete,
  detailsModalClose,
}: {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType;
  show: boolean;
  onClose: () => void;
  onDelete: () => void;
  detailsModalClose: () => void;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  return (
    <Modal
      isOpen={show}
      title={`Delete @${agentConfiguration.name}`}
      onClose={onClose}
      hasChanged={false}
      variant="dialogue"
    >
      <div className="flex flex-col gap-2 p-6">
        <div className="grow text-sm font-medium text-element-900">
          Are you sure you want to delete?
        </div>

        <div className="text-sm font-normal text-element-800">
          This will be permanent and delete the&nbsp;assistant
          for&nbsp;everyone.
        </div>
      </div>
      <div className="flex flex-row justify-end gap-1">
        <Button
          label={isDeleting ? "Deleting..." : "Delete for Everyone"}
          disabled={isDeleting}
          variant="primaryWarning"
          onClick={async () => {
            setIsDeleting(true);
            try {
              const res = await fetch(
                `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfiguration.sId}`,
                {
                  method: "DELETE",
                }
              );
              if (!res.ok) {
                const data = await res.json();
                sendNotification({
                  title: "Error deleting Assistant",
                  description: data.error.message,
                  type: "error",
                });
              } else {
                sendNotification({
                  title: "Assistant deleted",
                  type: "success",
                });
                onDelete();
              }
            } catch (e) {
              sendNotification({
                title: "Error deleting Assistant",
                description: (e as Error).message,
                type: "error",
              });
            }

            onClose();
            detailsModalClose();
            setIsDeleting(false);
          }}
        />
      </div>
    </Modal>
  );
}
