import { Modal } from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useState } from "react";

import { makeColumnsForAssistants } from "@app/components/poke/assistants/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";

interface AssistantsDataTableProps {
  owner: LightWorkspaceType;
}

function prepareAgentConfigurationForDisplay(
  agenConfigurations: LightAgentConfigurationType[]
) {
  return agenConfigurations.filter(
    (ac) =>
      !Object.values(GLOBAL_AGENTS_SID).includes(ac.sId as GLOBAL_AGENTS_SID)
  );
}

export function AssistantsDataTable({ owner }: AssistantsDataTableProps) {
  const router = useRouter();
  const [showRestoreAssistantModal, setShowRestoreAssistantModal] =
    useState(false);

  const restoreAssistantButton = (
    <PokeButton
      aria-label="Restore an assistant"
      variant="outline"
      size="sm"
      onClick={() => setShowRestoreAssistantModal(true)}
    >
      🔥 Restore an assistant
    </PokeButton>
  );

  return (
    <>
      <RestoreAssistantModal
        show={showRestoreAssistantModal}
        onClose={() => setShowRestoreAssistantModal(false)}
        owner={owner}
      />
      <PokeDataTableConditionalFetch
        header="Assistants"
        globalActions={restoreAssistantButton}
        owner={owner}
        useSWRHook={usePokeAgentConfigurations}
      >
        {(data) => (
          <PokeDataTable
            columns={makeColumnsForAssistants(owner, router.reload)}
            data={prepareAgentConfigurationForDisplay(data)}
          />
        )}
      </PokeDataTableConditionalFetch>
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
  owner: LightWorkspaceType;
}) {
  const { data: archivedAssistants } = usePokeAgentConfigurations({
    owner,
    disabled: !show,
    agentsGetView: "archived",
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
          <PokeDataTable
            columns={makeColumnsForAssistants(owner, router.reload)}
            data={prepareAgentConfigurationForDisplay(archivedAssistants)}
          />
        )}
      </div>
    </Modal>
  );
}
