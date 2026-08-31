import { Authenticator } from "@app/lib/auth";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("workspace-analytics code-defined skill", () => {
  it("is hidden from non-admins", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });

    const skill = await GlobalSkillsRegistry.getById(
      authenticator,
      "workspace-analytics"
    );
    expect(skill).toBeNull();
  });

  it("is hidden from admins when the workspace opts out", async () => {
    const { workspace, user } = await createResourceTest({
      role: "admin",
    });
    await WorkspaceResource.updateMetadata(workspace.id, {
      disableWorkspaceAnalytics: true,
    });
    const refreshedAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const skill = await GlobalSkillsRegistry.getById(
      refreshedAuth,
      "workspace-analytics"
    );
    expect(skill).toBeNull();
  });

  it("is visible to admins by default and wires the analytics and management servers", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });

    const skill = await GlobalSkillsRegistry.getById(
      authenticator,
      "workspace-analytics"
    );
    expect(skill).toMatchObject({
      sId: "workspace-analytics",
      name: "Workspace Analytics",
      mcpServers: [
        { name: "workspace_analytics" },
        { name: "workspace_management" },
      ],
    });
  });
});
