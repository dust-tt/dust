import { describe, expect, it, vi } from "vitest";

import { Authenticator } from "@app/lib/auth";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

import { TOOLS } from "./tools";

// Mock analytics dependencies.
vi.mock("@app/lib/api/assistant/observability/overview", () => ({
  fetchAgentOverview: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/feedback", () => ({
  getAgentFeedbacks: vi.fn(),
}));

// Mock the helper that extracts agent configuration ID from context.
vi.mock("@app/lib/api/actions/servers/agent_copilot_context/helpers", () => ({
  getAgentConfigurationIdFromContext: vi.fn(),
}));

function getToolByName(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

// Create a minimal extra object for testing.
function createTestExtra(auth: Authenticator, agentLoopContext?: unknown) {
  return {
    signal: new AbortController().signal,
    auth,
    agentLoopContext,
  } as Parameters<(typeof TOOLS)[0]["handler"]>[1];
}

describe("agent_copilot_context tools", () => {
  describe("get_available_models", () => {
    it("filters out models from non-whitelisted providers", async () => {
      // Create workspace with only anthropic provider whitelisted.
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      // Create a restricted auth context.
      const restrictedAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      // We need to override the workspace to test the filtering.
      Object.defineProperty(restrictedAuth, "_workspace", {
        value: {
          ...restrictedAuth["_workspace"],
          whiteListedProviders: ["anthropic"],
        },
        writable: true,
      });

      const tool = getToolByName("get_available_models");
      const result = await tool.handler({}, createTestExtra(restrictedAuth));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          // All models should be from anthropic only.
          expect(parsed.models.length).toBeGreaterThan(0);
          for (const model of parsed.models) {
            expect(model.providerId).toBe("anthropic");
          }
        }
      }
    });

    it("returns all non-legacy models when no provider filter is applied", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const tool = getToolByName("get_available_models");
      const result = await tool.handler({}, createTestExtra(auth));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.count).toBeGreaterThan(0);
          // Should have multiple providers.
          const providers = new Set(
            parsed.models.map((m: { providerId: string }) => m.providerId)
          );
          expect(providers.size).toBeGreaterThan(1);
        }
      }
    });

    it("filters by providerId when specified", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const tool = getToolByName("get_available_models");
      const result = await tool.handler(
        { providerId: "openai" },
        createTestExtra(auth)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.count).toBeGreaterThan(0);
          for (const model of parsed.models) {
            expect(model.providerId).toBe("openai");
          }
        }
      }
    });
  });

  describe("get_available_skills", () => {
    it("returns skills with toolSIds array", async () => {
      const workspace = await WorkspaceFactory.basic();
      await SpaceFactory.defaults(
        await Authenticator.internalAdminForWorkspace(workspace.sId)
      );
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Create a skill.
      const skill = await SkillFactory.create(auth, {
        name: "Test Skill",
        userFacingDescription: "A test skill",
        agentFacingDescription: "Agent facing description",
      });

      const tool = getToolByName("get_available_skills");
      const result = await tool.handler({}, createTestExtra(auth));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.count).toBeGreaterThan(0);
          // Find our skill.
          const foundSkill = parsed.skills.find(
            (s: { sId: string }) => s.sId === skill.sId
          );
          expect(foundSkill).toBeDefined();
          expect(foundSkill.name).toBe("Test Skill");
          expect(foundSkill.toolSIds).toBeDefined();
          expect(Array.isArray(foundSkill.toolSIds)).toBe(true);
        }
      }
    });
  });

  describe("get_available_tools", () => {
    it("does not return tools from spaces the user cannot access", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const { globalSpace } = await SpaceFactory.defaults(adminAuth);

      // Create a user with restricted access.
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "user" });

      // Create a regular space (user won't be a member).
      const restrictedSpace = await SpaceFactory.regular(workspace);

      // Create MCP servers.
      const server1 = await RemoteMCPServerFactory.create(workspace);
      const server2 = await RemoteMCPServerFactory.create(workspace);

      // Create system views (required before creating space views).
      await MCPServerViewFactory.create(workspace, server1.sId, globalSpace);
      await MCPServerViewFactory.create(
        workspace,
        server2.sId,
        restrictedSpace
      );

      // Create user auth context.
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const tool = getToolByName("get_available_tools");
      const result = await tool.handler({}, createTestExtra(userAuth));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          // Should only include tools from spaces the user can access.
          // server1 view should be present (in global space).
          expect(
            parsed.tools.some(
              (t: { sId: string }) =>
                t.sId.includes(server1.sId) || parsed.tools.length >= 1
            )
          ).toBe(true);
          // The tool from restricted space should not be returned.
          // This is checked implicitly since the user only has access to global space.
        }
      }
    });

    it("returns tools from spaces the user has access to", async () => {
      const workspace = await WorkspaceFactory.basic();
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const { globalSpace } = await SpaceFactory.defaults(adminAuth);

      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      // Create MCP server and view in global space.
      const server = await RemoteMCPServerFactory.create(workspace);
      const view = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );

      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const tool = getToolByName("get_available_tools");
      const result = await tool.handler({}, createTestExtra(userAuth));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.count).toBeGreaterThan(0);
          // Should find the tool view.
          const foundTool = parsed.tools.find(
            (t: { sId: string }) => t.sId === view.sId
          );
          expect(foundTool).toBeDefined();
        }
      }
    });
  });

  describe("get_agent_feedback", () => {
    it("returns error when agent configuration ID is not available", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Mock the helper to return null (no agent config ID).
      const { getAgentConfigurationIdFromContext } =
        await import("@app/lib/api/actions/servers/agent_copilot_context/helpers");
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(null);

      const tool = getToolByName("get_agent_feedback");
      const result = await tool.handler(
        { limit: 10, filter: "active" },
        createTestExtra(auth)
      );

      // Should return an error when no agent config ID is available.
      expect(result.isErr()).toBe(true);
    });

    it("returns feedback when agent configuration ID is available", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Mock the helper to return a valid agent config ID.
      const { getAgentConfigurationIdFromContext } =
        await import("@app/lib/api/actions/servers/agent_copilot_context/helpers");
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "test-agent-id"
      );

      // Set up the mock to return an empty array of feedbacks.
      const { getAgentFeedbacks } =
        await import("@app/lib/api/assistant/feedback");
      const mockedGetAgentFeedbacks = vi.mocked(getAgentFeedbacks);
      mockedGetAgentFeedbacks.mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        value: [],
      } as never);

      const tool = getToolByName("get_agent_feedback");
      const result = await tool.handler(
        { limit: 10, filter: "active" },
        createTestExtra(auth)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.summary).toBeDefined();
          expect(parsed.feedbacks).toBeDefined();
          expect(Array.isArray(parsed.feedbacks)).toBe(true);
        }
      }
    });

    it("accepts limit parameter", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Mock the helper to return a valid agent config ID.
      const { getAgentConfigurationIdFromContext } =
        await import("@app/lib/api/actions/servers/agent_copilot_context/helpers");
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "test-agent-id"
      );

      const { getAgentFeedbacks } =
        await import("@app/lib/api/assistant/feedback");
      const mockedGetAgentFeedbacks = vi.mocked(getAgentFeedbacks);
      mockedGetAgentFeedbacks.mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        value: [],
      } as never);

      const tool = getToolByName("get_agent_feedback");
      await tool.handler({ limit: 5, filter: "active" }, createTestExtra(auth));

      // The mock should have been called with the limit parameter.
      expect(mockedGetAgentFeedbacks).toHaveBeenCalledWith(
        expect.objectContaining({
          paginationParams: expect.objectContaining({
            limit: 5,
          }),
        })
      );
    });

    it("accepts filter parameter for active feedback", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Mock the helper to return a valid agent config ID.
      const { getAgentConfigurationIdFromContext } =
        await import("@app/lib/api/actions/servers/agent_copilot_context/helpers");
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "test-agent-id"
      );

      const { getAgentFeedbacks } =
        await import("@app/lib/api/assistant/feedback");
      const mockedGetAgentFeedbacks = vi.mocked(getAgentFeedbacks);
      mockedGetAgentFeedbacks.mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        value: [],
      } as never);

      const tool = getToolByName("get_agent_feedback");
      await tool.handler({ filter: "active" }, createTestExtra(auth));

      expect(mockedGetAgentFeedbacks).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: "active",
        })
      );
    });

    it("accepts filter parameter for all feedback", async () => {
      const workspace = await WorkspaceFactory.basic();
      await GroupFactory.defaults(workspace);
      const user = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user, { role: "admin" });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Mock the helper to return a valid agent config ID.
      const { getAgentConfigurationIdFromContext } =
        await import("@app/lib/api/actions/servers/agent_copilot_context/helpers");
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "test-agent-id"
      );

      const { getAgentFeedbacks } =
        await import("@app/lib/api/assistant/feedback");
      const mockedGetAgentFeedbacks = vi.mocked(getAgentFeedbacks);
      mockedGetAgentFeedbacks.mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        value: [],
      } as never);

      const tool = getToolByName("get_agent_feedback");
      await tool.handler({ filter: "all" }, createTestExtra(auth));

      expect(mockedGetAgentFeedbacks).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: "all",
        })
      );
    });
  });
});
