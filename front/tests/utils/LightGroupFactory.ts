import type { GroupType } from "@app/types/groups";

export class LightGroupFactory {
  private static counter = 0;

  static build(overrides: Partial<GroupType> = {}): GroupType {
    const id = ++LightGroupFactory.counter;
    return {
      id,
      sId: `group_${id}`,
      name: `Group ${id}`,
      kind: "regular_manual",
      workspaceId: 1,
      memberCount: 0,
      poolCapAwuCredits: null,
      grantedRole: null,
      grantedSeatType: null,
      ...overrides,
    };
  }
}
