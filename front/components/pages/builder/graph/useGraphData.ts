import { useMemo } from "react";

import type { GraphData, GraphLink, GraphNode } from "@app/components/pages/builder/graph/types";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";

export function useGraphData(
  agents: LightAgentConfigurationType[],
  skills: SkillWithRelationsType[]
): GraphData {
  return useMemo(() => {
    const links: GraphLink[] = [];
    const agentConnectionCounts = new Map<string, number>();
    const skillConnectionCounts = new Map<string, number>();

    // Build edges from skill relations and count connections.
    for (const skill of skills) {
      const usageAgents = skill.relations.usage.agents;
      for (const usageAgent of usageAgents) {
        links.push({
          source: `agent-${usageAgent.sId}`,
          target: `skill-${skill.sId}`,
        });
        agentConnectionCounts.set(
          usageAgent.sId,
          (agentConnectionCounts.get(usageAgent.sId) ?? 0) + 1
        );
        skillConnectionCounts.set(
          skill.sId,
          (skillConnectionCounts.get(skill.sId) ?? 0) + 1
        );
      }
    }

    // Only include agents that have at least one skill connection.
    const connectedAgentIds = new Set(agentConnectionCounts.keys());

    const agentNodes: GraphNode[] = agents
      .filter((a) => connectedAgentIds.has(a.sId))
      .map((agent) => ({
        id: `agent-${agent.sId}`,
        type: "agent" as const,
        name: agent.name,
        pictureUrl: agent.pictureUrl,
        connectionCount: agentConnectionCounts.get(agent.sId) ?? 0,
      }));

    // Only include skills that have at least one agent connection.
    const skillNodes: GraphNode[] = skills
      .filter((s) => (skillConnectionCounts.get(s.sId) ?? 0) > 0)
      .map((skill) => ({
        id: `skill-${skill.sId}`,
        type: "skill" as const,
        name: skill.name,
        icon: skill.icon,
        connectionCount: skillConnectionCounts.get(skill.sId) ?? 0,
      }));

    return {
      nodes: [...agentNodes, ...skillNodes],
      links,
    };
  }, [agents, skills]);
}
