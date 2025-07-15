import type { AgentConfigurationType, LightWorkspaceType } from "@app/types";

interface AgentMemorySectionProps {
  owner: LightWorkspaceType;
  agentConfiguration: AgentConfigurationType;
}

export function AgentMemorySection({
  owner,
  agentConfiguration,
}: AgentMemorySectionProps) {
  return (
    <>
      <div>Mem2</div>
    </>
  );
}
