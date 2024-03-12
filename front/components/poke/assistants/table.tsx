import { Modal } from "@dust-tt/sparkle";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useState } from "react";

import { makeColumnsForAssistants } from "@app/components/poke/assistants/columns";
import { DataTable } from "@app/components/poke/shadcn/ui/data_table";
import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";
import { usePokeAgentConfigurations } from "@app/lib/swr";

interface AssistantsDataTableProps {
  agentConfigurations: AgentConfigurationType[];
  owner: WorkspaceType;
}

function prepareAgentConfigurationForDisplay(
  agenConfigurations: LightAgentConfigurationType[]
) {
  return agenConfigurations.filter(
    (ac) =>
      !Object.values(GLOBAL_AGENTS_SID).includes(ac.sId as GLOBAL_AGENTS_SID)
  );
}

export function AssistantsDataTable({
  owner,
  agentConfigurations,
}: AssistantsDataTableProps) {
  const router = useRouter();
  const [showRestoreAssistantModal, setShowRestoreAssistantModal] =
    useState(false);

  return (
    <>
      <RestoreAssistantModal
        show={showRestoreAssistantModal}
        onClose={() => setShowRestoreAssistantModal(false)}
        owner={owner}
      />
      <div className="border-material-200 my-4 flex flex-col rounded-lg border p-4">
        <a
          className="mb-4 cursor-pointer text-xs text-action-400"
          onClick={() => {
            setShowRestoreAssistantModal(true);
          }}
        >
          restore an assistant
        </a>
        <h2 className="text-md mb-4 font-bold">Assistants:</h2>
        <DataTable
          columns={makeColumnsForAssistants(
            owner,
            agentConfigurations,
            router.reload
          )}
          data={prepareAgentConfigurationForDisplay(agentConfigurations)}
        />
      </div>
    </>
  );
}

function RestoreAssistantModal({
  show,
  onClose,
  owner,
}: {
  show: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}) {
  const { agentConfigurations: archivedAssistants } =
    usePokeAgentConfigurations({
      workspaceId: owner.sId,
      agentsGetView: show ? "archived" : null,
    });
  const router = useRouter();
  return (
    <Modal
      isOpen={show}
      onClose={onClose}
      hasChanged={false}
      title="Restore an assistant"
      variant="full-screen"
    >
      <div className="mx-auto mt-4 max-w-4xl">
        {!!archivedAssistants?.length && (
          <DataTable
            columns={makeColumnsForAssistants(
              owner,
              archivedAssistants,
              router.reload
            )}
            data={prepareAgentConfigurationForDisplay(archivedAssistants)}
          />
        )}
      </div>
    </Modal>
  );
}
