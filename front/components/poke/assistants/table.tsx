import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";

import { makeColumnsForAssistants } from "@app/components/poke/assistants/columns";
import { DataTable } from "@app/components/poke/shadcn/ui/data_table";
import { GLOBAL_AGENTS_SID } from "@app/lib/assistant";

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

  return (
    <div className="border-material-200 my-4 flex flex-col rounded-lg border p-4">
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
  );
}
