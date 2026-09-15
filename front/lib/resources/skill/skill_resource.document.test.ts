import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import skillSearchMapping from "@app/lib/skill_search/indices/skills_1.mappings.json";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

describe("SkillResource.toSearchDocument", () => {
  it.each([
    "active",
    "archived",
  ] as const)("serializes every mapped field for a normally fetched %s skill", async (status) => {
    const {
      authenticator: auth,
      workspace,
      globalSpace,
      user,
    } = await createResourceTest({ role: "admin" });
    const pod = await SpaceFactory.project(workspace, user.id);
    const server = await RemoteMCPServerFactory.create(workspace);
    const tool = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const created = await SkillFactory.create(auth, {
      name: "WeeklyReportBot",
      status,
      availability: "users_and_agents",
      instructions: "Private instructions",
      agentFacingDescription: "Private agent description",
      requestedSpaceIds: [globalSpace.id, pod.id],
      manuallyRequestedSpaceIds: [pod.id],
      mcpServerViews: [tool],
    });
    const [skill] = await SkillResource.fetchByIds(auth, [created.sId], {
      permissionFiltering: "dangerously_skip",
      withInstructions: false,
      withTools: true,
      withFileAttachments: false,
    });
    const editorIds = [user.id, user.id];
    const document = skill.toSearchDocument(workspace, {
      editorIds,
      editorGroupIds: [3, 2, 3],
      activeUsersCount: 12,
      isDefault: false,
    });

    expect(document).toEqual({
      workspace_id: workspace.sId,
      skill_id: skill.sId,
      status,
      availability: "users_and_agents",
      name: skill.name,
      description: skill.userFacingDescription,
      icon: skill.icon,
      last_edited_by_user_id: user.id,
      editor_ids: [user.id],
      editor_group_ids: [2, 3],
      requested_space_ids: [globalSpace.sId, pod.sId],
      mcp_server_view_ids: [tool.sId],
      active_users_count: 12,
      favorite_count: skill.favoriteCount,
      is_default: false,
      created_at: skill.createdAt.toISOString(),
      updated_at: skill.updatedAt.toISOString(),
    });
    expect(Object.keys(document).sort()).toEqual(
      Object.keys(skillSearchMapping.properties).sort()
    );
    expect(editorIds).toEqual([user.id, user.id]);
    expect(JSON.stringify(document)).not.toContain("Private");
    expect(
      skill.toSearchDocument(workspace, {
        editorIds: [],
        editorGroupIds: [],
        activeUsersCount: 0,
        isDefault: true,
      }).is_default
    ).toBe(true);
  });

  it("rejects a different workspace", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const skill = await SkillFactory.create(auth);
    const otherWorkspace = await WorkspaceFactory.basic();

    expect(() =>
      skill.toSearchDocument(otherWorkspace, {
        editorIds: [],
        editorGroupIds: [],
        activeUsersCount: 0,
        isDefault: false,
      })
    ).toThrow("Search documents require a custom skill in the workspace.");
  });
});
