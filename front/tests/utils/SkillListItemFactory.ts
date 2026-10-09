import type { SkillListItemType } from "@app/types/assistant/skill_configuration";

export class SkillListItemFactory {
  private static counter = 0;

  static build(
    overrides: Partial<Omit<SkillListItemType, "editors">> = {}
  ): Omit<SkillListItemType, "editors"> {
    const id = ++SkillListItemFactory.counter;
    return {
      sId: `skill_${id}`,
      status: "active",
      canWrite: false,
      canAdministrate: false,
      availability: "workspace_users",
      name: "Search result",
      userFacingDescription: "Description",
      icon: null,
      requestedSpaceIds: [],
      mcpServerViewIds: [],
      editorIds: [],
      editedBy: null,
      activeUsersCount: null,
      updatedAt: null,
      ...overrides,
    };
  }
}
