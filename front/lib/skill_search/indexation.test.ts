import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { launchSkillsSearchIndexationForGroups } from "@app/lib/skill_search/indexation";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  launchIndexSkillSearchWorkflow: vi.fn(),
}));

vi.mock("@app/temporal/es_indexation/client", () => ({
  launchDeleteWorkspaceSkillSearchWorkflow: vi.fn(),
  launchIndexSkillSearchWorkflow: mocks.launchIndexSkillSearchWorkflow,
}));

describe("skill search indexation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.launchIndexSkillSearchWorkflow.mockReset();
    mocks.launchIndexSkillSearchWorkflow.mockResolvedValue(new Ok(undefined));
  });

  it("reindexes each skill granted to the affected editor groups", async () => {
    const workspace = {
      id: 1,
      sId: "workspace-1",
    } as LightWorkspaceType;
    const listForGroupsSpy = vi
      .spyOn(GroupPermissionResource, "listForGroups")
      .mockResolvedValue([
        {
          groupId: 10,
          grantType: "editor",
          resourceType: "skill",
          resourceId: 20,
        },
        {
          groupId: 11,
          grantType: "editor",
          resourceType: "skill",
          resourceId: 20,
        },
        {
          groupId: 11,
          grantType: "editor",
          resourceType: "skill",
          resourceId: 21,
        },
      ]);

    await launchSkillsSearchIndexationForGroups({
      workspace,
      groupModelIds: [10, 11, 10],
    });

    expect(listForGroupsSpy).toHaveBeenCalledWith(workspace, {
      groupModelIds: [10, 11],
      grantType: "editor",
      resourceType: "skill",
    });
    expect(mocks.launchIndexSkillSearchWorkflow.mock.calls).toEqual([
      [
        {
          workspaceId: workspace.sId,
          skillId: makeSId("skill", { id: 20, workspaceId: workspace.id }),
        },
      ],
      [
        {
          workspaceId: workspace.sId,
          skillId: makeSId("skill", { id: 21, workspaceId: workspace.id }),
        },
      ],
    ]);
  });
});
