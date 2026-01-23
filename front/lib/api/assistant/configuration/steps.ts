import type { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";

export function getMaximalVersionAgentStepContent(
  agentStepContents: AgentStepContentModel[]
): AgentStepContentModel[] {
  const maxVersionStepContents = agentStepContents.reduce((acc, current) => {
    const key = `${current.step}-${current.index}`;
    const existing = acc.get(key);
    if (!existing || current.version > existing.version) {
      acc.set(key, current);
    }
    return acc;
  }, new Map<string, AgentStepContentModel>());

  return Array.from(maxVersionStepContents.values());
}
