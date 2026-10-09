import type { AgentSearchListItemType } from "@app/types/agent_search/agent_search";

export class AgentSearchListItemFactory {
  private static counter = 0;

  static build(
    overrides: Partial<AgentSearchListItemType> = {}
  ): AgentSearchListItemType {
    const id = ++AgentSearchListItemFactory.counter;
    return {
      sId: `agent_${id}`,
      status: "active",
      scope: "visible",
      name: "Search result",
      description: "Description",
      pictureUrl: "https://dust.tt/static/agent.png",
      model: null,
      feedbacks: { up: 0, down: 0 },
      requestedSpaceIds: [],
      tagIds: [],
      editorIds: [],
      editedBy: null,
      activeUsersCount: null,
      updatedAt: null,
      ...overrides,
    };
  }
}
