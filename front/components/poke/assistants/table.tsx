import { makeColumnsForAssistants } from "@app/components/poke/assistants/columns";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { AppRouter } from "@app/lib/platform";
import { useAppRouter } from "@app/lib/platform";
import { useFetcher } from "@app/lib/swr/swr";
import type { PokeAgentConfigurationType } from "@app/pages/api/poke/workspaces/[wId]/agent_configurations";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface AssistantsDataTableProps {
  owner: LightWorkspaceType;
  agentsRetention: Record<string, number>;
  loadOnInit?: boolean;
}

function prepareAgentConfigurationForDisplay(
  agentConfigurations: PokeAgentConfigurationType[]
) {
  return agentConfigurations.filter(
    (ac) =>
      !Object.values(GLOBAL_AGENTS_SID).includes(ac.sId as GLOBAL_AGENTS_SID)
  );
}

const importAssistant = async (
  owner: LightWorkspaceType,
  router: AppRouter,
  setImporting: (importing: boolean) => void,
  fetcherWithBody: (args: [string, any, string]) => Promise<any>
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
    try {
      const parsedContent = JSON.parse(fileContent);
      await fetcherWithBody([
        `/api/poke/workspaces/${owner.sId}/agent_configurations/import`,
        parsedContent,
        "POST",
      ]);
      setImporting(false);
      router.reload();
    } catch (e) {
      setImporting(false);
      if (isAPIErrorResponse(e)) {
        window.alert(`Failed to import agent. ${e.error.message}`);
      } else {
        window.alert("Failed to import agent.");
      }
    }
  };
  input.click();
};

export function AssistantsDataTable({
  owner,
  agentsRetention,
  loadOnInit,
}: AssistantsDataTableProps) {
  const router = useAppRouter();
  const { fetcher, fetcherWithBody } = useFetcher();
  const [showRestoreAssistantModal, setShowRestoreAssistantModal] =
    useState(false);
  const [importing, setImporting] = useState(false);

  const assistantButtons = (
    <div className="flex flex-row gap-2">
      <Button
        aria-label="Restore an agent"
        variant="outline"
        size="sm"
        onClick={() => setShowRestoreAssistantModal(true)}
        label="🔥 Restore an agent"
      />
      <Button
        aria-label="Import an agent"
        variant="outline"
        size="sm"
        onClick={() =>
          importAssistant(owner, router, setImporting, fetcherWithBody)
        }
        label={importing ? "📥 Importing..." : "📥 Import agent"}
        isLoading={importing}
      />
    </div>
  );

  return (
    <>
      <RestoreAssistantModal
        show={showRestoreAssistantModal}
        onClose={() => setShowRestoreAssistantModal(false)}
        agentsRetention={agentsRetention}
        owner={owner}
      />
      <PokeDataTableConditionalFetch
        header="Agents"
        globalActions={assistantButtons}
        owner={owner}
        loadOnInit={loadOnInit}
        useSWRHook={usePokeAgentConfigurations}
      >
        {(data, mutate) => (
          <PokeDataTable
            columns={makeColumnsForAssistants(
              owner,
              agentsRetention,
              async () => {
                await mutate();
              },
              fetcher
            )}
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
  agentsRetention,
}: {
  show: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  agentsRetention: Record<string, number>;
}) {
  const { fetcher } = useFetcher();
  const { data: archivedAssistants, mutate } = usePokeAgentConfigurations({
    owner,
    disabled: !show,
    agentsGetView: "archived",
  });

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
              columns={makeColumnsForAssistants(
                owner,
                agentsRetention,
                async () => {
                  await mutate();
                },
                fetcher
              )}
              data={prepareAgentConfigurationForDisplay(archivedAssistants)}
            />
          )}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
