import type { AgentSearchDocument, ExportedAgent } from "./types.ts";

export function toAgentSearchDocument(
  agent: ExportedAgent
): AgentSearchDocument {
  // A requested space missing from both classes is deniable by no clause, so the agent would
  // outlive `canReadRequestedSpaces` and reach users who cannot read it.
  const requestedSpaceIds = [...agent.requestedSpaceIds].sort();
  const classifiedSpaceIds = [
    ...agent.nonPodSpaceIds,
    ...agent.podSpaceIds,
  ].sort();
  if (
    requestedSpaceIds.length !== classifiedSpaceIds.length ||
    requestedSpaceIds.some(
      (spaceId, index) => spaceId !== classifiedSpaceIds[index]
    )
  ) {
    throw new Error(
      `${agent.sId}: requested spaces ${agent.requestedSpaceIds.join(",")} do not split into ${agent.nonPodSpaceIds.join(",")} and ${agent.podSpaceIds.join(",")}`
    );
  }
  return {
    agent_id: agent.sId,
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    tags: agent.tags,
    scope: agent.scope,
    status: agent.status,
    author: agent.author,
    editors: agent.editors,
    non_pod_space_ids: agent.nonPodSpaceIds,
    non_pod_space_count: agent.nonPodSpaceIds.length,
    pod_space_ids: agent.podSpaceIds,
    pod_space_count: agent.podSpaceIds.length,
    usage: {
      messages: agent.usage.messages,
      conversations: agent.usage.conversations,
      users: agent.usage.users,
      credits: agent.usage.credits,
      feedbacks_up: agent.usage.feedbacksUp,
      feedbacks_down: agent.usage.feedbacksDown,
      by_group: agent.usage.byGroup.map((group) => ({
        group_id: group.groupId,
        group_name: group.groupName,
        messages: group.messages,
        users: group.users,
      })),
    },
  };
}
