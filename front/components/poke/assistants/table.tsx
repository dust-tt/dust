import { SearchAgentsPage } from "@app/components/pages/builder/agents/SearchAgentsPage";
import {
  makeColumnsForAssistants,
  PokeAgentActions,
} from "@app/components/poke/assistants/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { clientFetch } from "@app/lib/egress/client";
import type { AppRouter } from "@app/lib/platform";
import { useAppRouter } from "@app/lib/platform";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { usePokeAgentConfigurations } from "@app/poke/swr/agent_configurations";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

interface AssistantsDataTableProps {
  owner: LightWorkspaceType;
  agentsRetention: Record<string, number>;
}

const importAssistant = async (
  owner: LightWorkspaceType,
  router: AppRouter,
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
    const response = await clientFetch(
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

export function AssistantsDataTable({
  owner,
  agentsRetention,
}: AssistantsDataTableProps) {
  const router = useAppRouter();
  const [showRestoreAssistantModal, setShowRestoreAssistantModal] =
    useState(false);
  const [importing, setImporting] = useState(false);
  const onSelect = useCallback(
    (agentId: string) =>
      void router.push(`/poke/${owner.sId}/assistants/${agentId}`),
    [owner.sId, router]
  );
  const renderActions = useCallback(
    (
      agent: SearchAgentsResponseBody["agents"][number],
      onRefresh: () => void
    ) => (
      <PokeAgentActions
        owner={owner}
        assistant={agent}
        onRefresh={async () => {
          await onRefresh();
        }}
      />
    ),
    [owner]
  );

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
        onClick={() => importAssistant(owner, router, setImporting)}
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
      <SearchAgentsPage
        showHeader={false}
        readOnly
        searchEndpoint={`/api/poke/workspaces/${owner.sId}/agent_configurations/search`}
        filterHashParam="agentSearch"
        permissionFiltering="unrestricted"
        searchActions={assistantButtons}
        onSelect={onSelect}
        renderActions={renderActions}
      />
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
                }
              )}
              data={archivedAssistants}
            />
          )}
        </SheetContainer>
      </SheetContent>
    </Sheet>
  );
}
