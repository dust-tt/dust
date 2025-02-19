import {
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { GLOBAL_AGENTS_SID } from "@dust-tt/types";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import { useState } from "react";

import { makeColumnsForAssistants } from "@app/components/poke/assistants/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeButton } from "@app/components/poke/shadcn/ui/button";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { getErrorFromResponse } from "@app/lib/swr/swr";
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

const importAssistant = async (
  owner: LightWorkspaceType,
  router: NextRouter,
  setImporting: (importing: boolean) => void
) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }
    setImporting(true);
    const fileContent = await file.text();
    const response = await fetch(
      `/api/poke/workspaces/${owner.sId}/agent_configurations/import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: fileContent,
      }
    );
    setImporting(false);
    if (!response.ok) {
      const errorData = await getErrorFromResponse(response);
      window.alert(`Failed to import agent. ${errorData.message}`);
    } else {
      router.reload();
    }
  };
  input.click();
};

export function AssistantsDataTable({ owner }: AssistantsDataTableProps) {
  const router = useRouter();
  const [showRestoreAssistantModal, setShowRestoreAssistantModal] =
    useState(false);
  const [importing, setImporting] = useState(false);

  const assistantButtons = (
    <div className="flex flex-row gap-2">
      <PokeButton
        aria-label="Restore an agent"
        variant="outline"
        size="sm"
        onClick={() => setShowRestoreAssistantModal(true)}
      >
        🔥 Restore an agent
      </PokeButton>
      <PokeButton
        aria-label="Import an agent"
        variant="outline"
        size="sm"
        onClick={() => importAssistant(owner, router, setImporting)}
      >
        {importing ? <Spinner size="xs" /> : "📥"} Import agent
      </PokeButton>
    </div>
  );

  return (
    <>
      <RestoreAssistantModal
        show={showRestoreAssistantModal}
        onClose={() => setShowRestoreAssistantModal(false)}
        owner={owner}
      />
      <PokeDataTableConditionalFetch
        header="Agents"
        globalActions={assistantButtons}
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
    <Sheet
      open={show}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>Restore an agent</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          {!!archivedAssistants?.length && (
            <PokeDataTable
              columns={makeColumnsForAssistants(owner, router.reload)}
              data={prepareAgentConfigurationForDisplay(archivedAssistants)}
            />
          )}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
