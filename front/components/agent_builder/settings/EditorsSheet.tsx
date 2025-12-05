import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { EditorsSheetBase } from "@app/components/shared/EditorsSheet";

export function EditorsSheet() {
  const { owner } = useAgentBuilderContext();

  const {
    field: { onChange, value: editors },
  } = useController<AgentBuilderFormData, "agentSettings.editors">({
    name: "agentSettings.editors",
  });

  return (
    <EditorsSheetBase
      owner={owner}
      editors={editors || []}
      onChangeEditors={onChange}
      description="People who can use and edit the agent."
    />
  );
}
