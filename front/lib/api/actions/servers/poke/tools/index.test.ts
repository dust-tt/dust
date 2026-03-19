import { Authenticator } from "@app/lib/auth";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it, vi } from "vitest";

import { TOOLS } from ".";

function getToolByName(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

function createTestExtra(auth: Authenticator, agentLoopContext?: unknown) {
  return {
    signal: new AbortController().signal,
    auth,
    agentLoopContext,
  } as Parameters<(typeof TOOLS)[0]["handler"]>[1];
}

describe("poke tools - security gates", () => {
  describe("get_workspace_metadata", () => {
    it("denies access to non-super-user", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);

      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const tool = getToolByName("get_workspace_metadata");
      const result = await tool.handler(
        { workspace_id: workspace.sId },
        createTestExtra(auth)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("super user privileges");
      }
    });

    it("denies access from non-Dust workspace even for super users", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);

      const superUser = await UserFactory.superUser();
      await MembershipFactory.associate(workspace, superUser, {
        role: "admin",
      });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        superUser.sId,
        workspace.sId
      );

      // Sanity: auth IS a super user but the workspace is NOT the Dust workspace.
      expect(auth.isDustSuperUser()).toBe(true);

      const tool = getToolByName("get_workspace_metadata");
      const result = await tool.handler(
        { workspace_id: workspace.sId },
        createTestExtra(auth)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("Dust-internal workspace");
      }
    });

    it("denies access when poke_mcp feature flag is disabled", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);

      const superUser = await UserFactory.superUser();
      await MembershipFactory.associate(workspace, superUser, {
        role: "admin",
      });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        superUser.sId,
        workspace.sId
      );

      // Make isDustWorkspace return true by setting the env var.
      vi.stubEnv("PRODUCTION_DUST_WORKSPACE_ID", workspace.sId);

      // Mock getFeatureFlags to return an empty array (no poke_mcp flag).
      const authModule = await import("@app/lib/auth");
      vi.spyOn(authModule, "getFeatureFlags").mockResolvedValueOnce([]);

      const tool = getToolByName("get_workspace_metadata");
      const result = await tool.handler(
        { workspace_id: workspace.sId },
        createTestExtra(auth)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("poke_mcp feature flag");
      }

      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it("returns workspace metadata when all security gates pass", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);

      const superUser = await UserFactory.superUser();
      await MembershipFactory.associate(workspace, superUser, {
        role: "admin",
      });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        superUser.sId,
        workspace.sId
      );

      // Make isDustWorkspace return true.
      vi.stubEnv("PRODUCTION_DUST_WORKSPACE_ID", workspace.sId);

      // Mock getFeatureFlags to include poke_mcp.
      const authModule = await import("@app/lib/auth");
      vi.spyOn(authModule, "getFeatureFlags").mockResolvedValueOnce([
        "poke_mcp",
      ]);

      const tool = getToolByName("get_workspace_metadata");
      const result = await tool.handler(
        { workspace_id: workspace.sId },
        createTestExtra(auth)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.sId).toBe(workspace.sId);
          expect(parsed.name).toBe(workspace.name);
          expect(parsed.plan).toBeDefined();
        }
      }

      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it("returns error for non-existent target workspace", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await SpaceFactory.defaults(adminAuth);

      const superUser = await UserFactory.superUser();
      await MembershipFactory.associate(workspace, superUser, {
        role: "admin",
      });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        superUser.sId,
        workspace.sId
      );

      // Make isDustWorkspace return true.
      vi.stubEnv("PRODUCTION_DUST_WORKSPACE_ID", workspace.sId);

      // Mock getFeatureFlags to include poke_mcp.
      const authModule = await import("@app/lib/auth");
      vi.spyOn(authModule, "getFeatureFlags").mockResolvedValueOnce([
        "poke_mcp",
      ]);

      const tool = getToolByName("get_workspace_metadata");
      const result = await tool.handler(
        { workspace_id: "nonexistent-workspace-id" },
        createTestExtra(auth)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("Workspace not found");
      }

      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });
  });
});
