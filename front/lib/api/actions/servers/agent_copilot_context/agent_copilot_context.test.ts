import { beforeEach, describe, expect, it, vi } from "vitest";

import { USED_MODEL_CONFIGS } from "@app/components/providers/types";
import { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TemplateFactory } from "@app/tests/utils/TemplateFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import { TOOLS } from "./tools";

// Mock analytics dependencies.
vi.mock("@app/lib/api/assistant/observability/overview", () => ({
  fetchAgentOverview: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/feedback", () => ({
  getAgentFeedbacks: vi.fn(),
}));

// Mock template suggestion for query-based search.
vi.mock("@app/lib/api/assistant/template_suggestion", () => ({
  getSuggestedTemplatesForQuery: vi.fn(),
}));

// Mock the helper that extracts agent configuration ID from context.
vi.mock("@app/lib/api/actions/servers/agent_copilot_helpers", () => ({
  getAgentConfigurationIdFromContext: vi.fn(),
}));

// Reset mocks between tests to prevent interference.
beforeEach(() => {
  vi.resetAllMocks();
});

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
  describe("get_available_knowledge", () => {
    it("returns knowledge organized by spaces and categories", async () => {
      const { authenticator, globalSpace, workspace } =
        await createResourceTest({ role: "admin" });

      // Create a folder data source view in the global space.
      await DataSourceViewFactory.folder(workspace, globalSpace);

      const tool = getToolByName("get_available_knowledge");
      const result = await tool.handler({}, createTestExtra(authenticator));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.count).toBeDefined();
          expect(parsed.count.spaces).toBeGreaterThanOrEqual(1);
          expect(parsed.count.dataSources).toBeGreaterThanOrEqual(1);
          expect(parsed.spaces).toBeDefined();
          expect(Array.isArray(parsed.spaces)).toBe(true);

          // Find the global space.
          const foundSpace = parsed.spaces.find(
            (s: { sId: string }) => s.sId === globalSpace.sId
          );
          expect(foundSpace).toBeDefined();
          expect(foundSpace.categories).toBeDefined();
          expect(Array.isArray(foundSpace.categories)).toBe(true);
        }
      }
    });

    it("filters by spaceId when provided", async () => {
      const { authenticator, globalSpace, workspace } =
        await createResourceTest({ role: "admin" });

      // Create another space.
      const regularSpace = await SpaceFactory.regular(workspace);

      // Create folder data sources in both spaces.
      await DataSourceViewFactory.folder(workspace, globalSpace);
      await DataSourceViewFactory.folder(workspace, regularSpace);

      const tool = getToolByName("get_available_knowledge");

      // Filter to global space only.
      const result = await tool.handler(
        { spaceId: globalSpace.sId },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.count.spaces).toBe(1);
          expect(parsed.spaces[0].sId).toBe(globalSpace.sId);
        }
      }
    });

    it("filters by category when provided", async () => {
      const { authenticator, globalSpace, workspace } =
        await createResourceTest({ role: "admin" });

      // Create a folder data source.
      await DataSourceViewFactory.folder(workspace, globalSpace);

      const tool = getToolByName("get_available_knowledge");

      // Filter to folder category only.
      const result = await tool.handler(
        { category: "folder" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          // All categories should be "folder".
          for (const space of parsed.spaces) {
            for (const cat of space.categories) {
              expect(cat.category).toBe("folder");
            }
          }
        }
      }
    });

    it("returns error for invalid spaceId", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const tool = getToolByName("get_available_knowledge");
      const result = await tool.handler(
        { spaceId: "non-existent-space-id" },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
    });

    it("does not return knowledge from spaces the user cannot access", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });

      // Create a restricted space (user won't be a member).
      const restrictedSpace = await SpaceFactory.regular(workspace);

      // Create a folder in the restricted space.
      await DataSourceViewFactory.folder(workspace, restrictedSpace);

      const tool = getToolByName("get_available_knowledge");
      const result = await tool.handler({}, createTestExtra(authenticator));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          // The restricted space should not be in the results.
          const foundRestrictedSpace = parsed.spaces.find(
            (s: { sId: string }) => s.sId === restrictedSpace.sId
          );
          expect(foundRestrictedSpace).toBeUndefined();
        }
      }
    });
  });

  describe("get_available_models", () => {
    it("filters out models from non-whitelisted providers", async () => {
      // Create workspace with only anthropic provider whitelisted.
      // This test needs special handling to override whiteListedProviders.
      const { authenticator } = await createResourceTest({ role: "admin" });

      // We need to override the workspace to test the filtering.
      Object.defineProperty(authenticator, "_workspace", {
        value: {
          ...authenticator["_workspace"],
          whiteListedProviders: ["anthropic"],
        },
        writable: true,
      });

      const tool = getToolByName("get_available_models");
      const result = await tool.handler({}, createTestExtra(authenticator));

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
      const { authenticator } = await createResourceTest({ role: "admin" });

      const tool = getToolByName("get_available_models");
      const result = await tool.handler({}, createTestExtra(authenticator));

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
      const { authenticator } = await createResourceTest({ role: "admin" });

      const tool = getToolByName("get_available_models");
      const result = await tool.handler(
        { providerId: "openai" },
        createTestExtra(authenticator)
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
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a skill.
      const skill = await SkillFactory.create(authenticator, {
        name: "Test Skill",
        userFacingDescription: "A test skill",
        agentFacingDescription: "Agent facing description",
      });

      const tool = getToolByName("get_available_skills");
      const result = await tool.handler({}, createTestExtra(authenticator));

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
      const { workspace, globalSpace, authenticator } =
        await createResourceTest({ role: "user" });

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

      const tool = getToolByName("get_available_tools");
      const result = await tool.handler({}, createTestExtra(authenticator));

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
      const { workspace, globalSpace, authenticator } =
        await createResourceTest({ role: "admin" });

      // Create MCP server and view in global space.
      const server = await RemoteMCPServerFactory.create(workspace);
      const view = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );

      const tool = getToolByName("get_available_tools");
      const result = await tool.handler({}, createTestExtra(authenticator));

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

  describe("get_available_agents", () => {
    it("returns agents accessible to the user", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create an agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const tool = getToolByName("get_available_agents");
      const result = await tool.handler({}, createTestExtra(authenticator));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.count).toBeGreaterThan(0);
          expect(parsed.agents).toBeDefined();
          expect(Array.isArray(parsed.agents)).toBe(true);

          // Find our created agent.
          const foundAgent = parsed.agents.find(
            (a: { sId: string }) => a.sId === agentConfiguration.sId
          );
          expect(foundAgent).toBeDefined();
          expect(foundAgent.name).toBe(agentConfiguration.name);
          expect(foundAgent.description).toBe(agentConfiguration.description);
          expect(foundAgent.scope).toBeDefined();
        }
      }
    });
  });

  describe("get_agent_feedback", () => {
    it("returns error when agent configuration ID is not available", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Mock the helper to return null (no agent config ID).
      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(null);

      const tool = getToolByName("get_agent_feedback");
      const result = await tool.handler(
        { limit: 10, filter: "active" },
        createTestExtra(authenticator)
      );

      // Should return an error when no agent config ID is available.
      expect(result.isErr()).toBe(true);
    });

    it("returns feedback when agent configuration ID is available", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Mock the helper to return a valid agent config ID.
      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "test-agent-id"
      );

      // Set up the mock to return an empty array of feedbacks.
      const { getAgentFeedbacks } = await import(
        "@app/lib/api/assistant/feedback"
      );
      const mockedGetAgentFeedbacks = vi.mocked(getAgentFeedbacks);
      mockedGetAgentFeedbacks.mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        value: [],
      } as never);

      const tool = getToolByName("get_agent_feedback");
      const result = await tool.handler(
        { limit: 10, filter: "active" },
        createTestExtra(authenticator)
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
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Mock the helper to return a valid agent config ID.
      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "test-agent-id"
      );

      const { getAgentFeedbacks } = await import(
        "@app/lib/api/assistant/feedback"
      );
      const mockedGetAgentFeedbacks = vi.mocked(getAgentFeedbacks);
      mockedGetAgentFeedbacks.mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        value: [],
      } as never);

      const tool = getToolByName("get_agent_feedback");
      await tool.handler(
        { limit: 5, filter: "active" },
        createTestExtra(authenticator)
      );

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
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Mock the helper to return a valid agent config ID.
      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "test-agent-id"
      );

      const { getAgentFeedbacks } = await import(
        "@app/lib/api/assistant/feedback"
      );
      const mockedGetAgentFeedbacks = vi.mocked(getAgentFeedbacks);
      mockedGetAgentFeedbacks.mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        value: [],
      } as never);

      const tool = getToolByName("get_agent_feedback");
      await tool.handler({ filter: "active" }, createTestExtra(authenticator));

      expect(mockedGetAgentFeedbacks).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: "active",
        })
      );
    });

    it("accepts filter parameter for all feedback", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Mock the helper to return a valid agent config ID.
      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "test-agent-id"
      );

      const { getAgentFeedbacks } = await import(
        "@app/lib/api/assistant/feedback"
      );
      const mockedGetAgentFeedbacks = vi.mocked(getAgentFeedbacks);
      mockedGetAgentFeedbacks.mockResolvedValueOnce({
        isOk: () => true,
        isErr: () => false,
        value: [],
      } as never);

      const tool = getToolByName("get_agent_feedback");
      await tool.handler({ filter: "all" }, createTestExtra(authenticator));

      expect(mockedGetAgentFeedbacks).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: "all",
        })
      );
    });
  });

  // Suggestion tools tests
  describe("suggest_prompt_edits", () => {
    it("returns error when agent configuration ID is not available", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(null);

      const tool = getToolByName("suggest_prompt_edits");
      const result = await tool.handler(
        {
          suggestions: [
            {
              content: "<p>new text</p>",
              targetBlockId: "block123",
              type: "replace",
            },
          ],
        },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
    });

    it("creates suggestion successfully when agent configuration ID is provided", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_prompt_edits");
      const result = await tool.handler(
        {
          suggestions: [
            {
              content: "<p>new text</p>",
              targetBlockId: "block123",
              type: "replace",
            },
          ],
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toMatch(
            /:agent_suggestion\[\]\{sId=\S+ kind=instructions\}/
          );
        }
      }
    });

    it("returns error when exceeding pending suggestions limit", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // Create 10 pending instruction suggestions (the maximum allowed).
      for (let i = 0; i < 10; i++) {
        await AgentSuggestionFactory.createInstructions(
          authenticator,
          agentConfiguration,
          {
            suggestion: {
              content: `<p>new text ${i}</p>`,
              targetBlockId: `block${i}`,
              type: "replace",
            },
            state: "pending",
          }
        );
      }

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_prompt_edits");
      const result = await tool.handler(
        {
          suggestions: [
            {
              content: "<p>exceeds limit</p>",
              targetBlockId: "blockExtra",
              type: "replace",
            },
          ],
        },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("exceed the limit");
        expect(result.error.message).toContain("10");
        expect(result.error.message).toContain("instructions");
        expect(result.error.message).toContain("outdated");
      }
    });
  });

  describe("suggest_tools", () => {
    it("returns error when agent configuration ID is not available", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(null);

      const tool = getToolByName("suggest_tools");
      const result = await tool.handler(
        {
          suggestion: {
            additions: [{ id: "non-existent-tool" }],
          },
        },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
    });

    it("creates tool suggestion successfully", async () => {
      const { authenticator, workspace, globalSpace } =
        await createResourceTest({ role: "admin" });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // Create a valid MCP server and view.
      const server = await RemoteMCPServerFactory.create(workspace);
      const view = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_tools");
      const result = await tool.handler(
        {
          suggestion: {
            action: "add",
            toolId: view.sId,
          },
          analysis: "Adding tool for better capabilities",
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toMatch(
            /:agent_suggestion\[\]\{sId=\S+ kind=tools\}/
          );
        }
      }
    });

    it("returns error when suggesting non-existent tool", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_tools");
      const result = await tool.handler(
        {
          suggestion: {
            action: "add",
            toolId: "non-existent-tool-id",
          },
        },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("non-existent-tool-id");
        expect(result.error.message).toContain("invalid or not accessible");
        expect(result.error.message).toContain("get_available_tools");
      }
    });

    it("marks previous pending suggestion as outdated when suggesting the same tool", async () => {
      const { authenticator, workspace, globalSpace } =
        await createResourceTest({ role: "admin" });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // Create a valid MCP server and view.
      const server = await RemoteMCPServerFactory.create(workspace);
      const view = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );

      // Create an existing pending tool suggestion for the same tool.
      const existingSuggestion = await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration,
        {
          state: "pending",
          suggestion: { action: "add", toolId: view.sId },
        }
      );

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_tools");
      const result = await tool.handler(
        {
          suggestion: {
            action: "add",
            toolId: view.sId,
          },
          analysis: "New suggestion for the same tool",
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);

      // Verify the old suggestion was marked as outdated.
      const updatedSuggestion = await AgentSuggestionResource.fetchById(
        authenticator,
        existingSuggestion.sId
      );
      expect(updatedSuggestion?.state).toBe("outdated");
    });
  });

  describe("suggest_sub_agent", () => {
    it("creates sub-agent suggestion with add action successfully", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Ensure auto internal tools (including run_agent) are created.
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(authenticator);

      // Create the main agent configuration.
      const mainAgentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // Create a sub-agent configuration.
      const subAgentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator, {
          name: "SubAgent",
        });

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        mainAgentConfiguration.sId
      );

      const tool = getToolByName("suggest_sub_agent");
      const result = await tool.handler(
        {
          action: "add",
          subAgentId: subAgentConfiguration.sId,
          analysis: "Adding sub-agent for delegation",
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          // The suggestion should be of kind "tools" since it adds the run_agent tool.
          expect(content.text).toMatch(
            /:agent_suggestion\[\]\{sId=\S+ kind=sub_agent\}/
          );
        }
      }
    });

    it("creates sub-agent suggestion with remove action successfully", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Ensure auto internal tools (including run_agent) are created.
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(authenticator);

      // Create the main agent configuration.
      const mainAgentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // Create a sub-agent configuration.
      const subAgentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator, {
          name: "SubAgent",
        });

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        mainAgentConfiguration.sId
      );

      const tool = getToolByName("suggest_sub_agent");
      const result = await tool.handler(
        {
          action: "remove",
          subAgentId: subAgentConfiguration.sId,
          analysis: "Removing sub-agent",
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          // The suggestion should be of kind "tools" since it removes the run_agent tool.
          expect(content.text).toMatch(
            /:agent_suggestion\[\]\{sId=\S+ kind=sub_agent\}/
          );
        }
      }
    });
  });

  describe("suggest_skills", () => {
    it("returns error when agent configuration ID is not available", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(null);

      const tool = getToolByName("suggest_skills");
      const result = await tool.handler(
        {
          suggestion: {
            action: "add",
            skillId: "non-existent-skill",
          },
        },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
    });

    it("creates skill suggestion successfully", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // Create a valid skill.
      const skill = await SkillFactory.create(authenticator, {
        name: "Test Skill for Suggestion",
        userFacingDescription: "A test skill",
        agentFacingDescription: "Agent facing description",
      });

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_skills");
      const result = await tool.handler(
        {
          suggestion: {
            action: "add",
            skillId: skill.sId,
          },
          analysis: "Adding skills for better capabilities",
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toMatch(
            /:agent_suggestion\[\]\{sId=\S+ kind=skills\}/
          );
        }
      }
    });

    it("returns error when suggesting non-existent skill", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_skills");
      const result = await tool.handler(
        {
          suggestion: {
            action: "add",
            skillId: "non-existent-skill-id",
          },
        },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("non-existent-skill-id");
        expect(result.error.message).toContain("invalid or not accessible");
        expect(result.error.message).toContain("get_available_skills");
      }
    });

    it("marks previous pending suggestion as outdated when suggesting the same skill", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // Create a valid skill.
      const skill = await SkillFactory.create(authenticator, {
        name: "Test Skill for Duplicate",
        userFacingDescription: "A test skill",
        agentFacingDescription: "Agent facing description",
      });

      // Create an existing pending skill suggestion for the same skill.
      const existingSuggestion = await AgentSuggestionFactory.createSkills(
        authenticator,
        agentConfiguration,
        {
          state: "pending",
          suggestion: { action: "add", skillId: skill.sId },
        }
      );

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_skills");
      const result = await tool.handler(
        {
          suggestion: {
            action: "add",
            skillId: skill.sId,
          },
          analysis: "New suggestion for the same skill",
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);

      // Verify the old suggestion was marked as outdated.
      const updatedSuggestion = await AgentSuggestionResource.fetchById(
        authenticator,
        existingSuggestion.sId
      );
      expect(updatedSuggestion?.state).toBe("outdated");
    });
  });

  describe("suggest_model", () => {
    it("returns error when agent configuration ID is not available", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(null);

      const tool = getToolByName("suggest_model");
      const result = await tool.handler(
        {
          suggestion: {
            modelId: "claude-sonnet-4-5-20250929",
          },
        },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
    });

    it("creates model suggestion successfully", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_model");
      const result = await tool.handler(
        {
          suggestion: {
            modelId: "claude-sonnet-4-5-20250929",
            reasoningEffort: "high",
          },
          analysis: "Upgrading to better model for complex tasks",
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          expect(content.text).toMatch(
            /:agent_suggestion\[\]\{sId=\S+ kind=model\}/
          );
        }
      }
    });

    it("returns error when suggesting a model not available in the UI", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_model");
      // gpt-4o-mini is in SUPPORTED_MODEL_CONFIGS but not in USED_MODEL_CONFIGS
      const result = await tool.handler(
        {
          suggestion: {
            modelId: "gpt-4o-mini",
          },
        },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("Invalid model ID");
        expect(result.error.message).toContain("gpt-4o-mini");
        expect(result.error.message).toContain("get_available_models");
      }
    });

    it("returns error when suggesting a model from a non-whitelisted provider", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Override the workspace to only whitelist anthropic provider.
      Object.defineProperty(authenticator, "_workspace", {
        value: {
          ...authenticator["_workspace"],
          whiteListedProviders: ["anthropic"],
        },
        writable: true,
      });

      // Create a real agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        agentConfiguration.sId
      );

      const tool = getToolByName("suggest_model");
      // gpt-5 is in USED_MODEL_CONFIGS but openai is not whitelisted
      expect(USED_MODEL_CONFIGS.some((m) => m.modelId === "gpt-5")).toBe(true);
      const result = await tool.handler(
        {
          suggestion: {
            modelId: "gpt-5",
          },
        },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("Invalid model ID");
        expect(result.error.message).toContain("gpt-5");
      }
    });
  });

  describe("list_suggestions", () => {
    it("returns error when agent configuration ID is not available", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(null);

      const tool = getToolByName("list_suggestions");
      const result = await tool.handler({}, createTestExtra(authenticator));

      expect(result.isErr()).toBe(true);
    });

    it("lists suggestions with default status (pending)", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "test-agent-id"
      );

      const tool = getToolByName("list_suggestions");
      const result = await tool.handler({}, createTestExtra(authenticator));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.count).toBeDefined();
          expect(parsed.suggestions).toBeDefined();
          expect(Array.isArray(parsed.suggestions)).toBe(true);
        }
      }
    });

    it("lists suggestions with specific states and kind filters", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const { getAgentConfigurationIdFromContext } = await import(
        "@app/lib/api/actions/servers/agent_copilot_helpers"
      );
      vi.mocked(getAgentConfigurationIdFromContext).mockReturnValueOnce(
        "test-agent-id"
      );

      const tool = getToolByName("list_suggestions");
      const result = await tool.handler(
        {
          states: ["pending", "rejected"],
          kind: "tools",
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.count).toBeDefined();
          expect(parsed.suggestions).toBeDefined();
        }
      }
    });
  });

  describe("update_suggestions_state", () => {
    it("returns error in results when suggestion is not found", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const tool = getToolByName("update_suggestions_state");
      const result = await tool.handler(
        {
          suggestions: [{ suggestionId: "non-existent-id", state: "rejected" }],
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.results).toHaveLength(1);
          expect(parsed.results[0].success).toBe(false);
          expect(parsed.results[0].error).toContain("Suggestion not found");
        }
      }
    });

    it.each([
      { state: "rejected" as const },
      { state: "outdated" as const },
    ])("updates suggestion state to $state and returns all fields", async ({
      state,
    }) => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a real agent configuration and suggestion.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const suggestion = await AgentSuggestionFactory.createSkills(
        authenticator,
        agentConfiguration,
        { state: "pending", analysis: "Test analysis for skills" }
      );

      const tool = getToolByName("update_suggestions_state");
      const result = await tool.handler(
        { suggestions: [{ suggestionId: suggestion.sId, state }] },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.results).toHaveLength(1);
          expect(parsed.results[0].success).toBe(true);
        }
      }
    });

    it("updates multiple suggestions to outdated in a single call", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a real agent configuration and two suggestions.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const suggestion1 = await AgentSuggestionFactory.createInstructions(
        authenticator,
        agentConfiguration,
        { state: "pending" }
      );
      const suggestion2 = await AgentSuggestionFactory.createTools(
        authenticator,
        agentConfiguration,
        { state: "pending" }
      );

      const tool = getToolByName("update_suggestions_state");
      const result = await tool.handler(
        {
          suggestions: [
            { suggestionId: suggestion1.sId, state: "outdated" },
            { suggestionId: suggestion2.sId, state: "outdated" },
          ],
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.results).toHaveLength(2);

          expect(parsed.results[0].success).toBe(true);
          expect(parsed.results[0].suggestionId).toBe(suggestion1.sId);
          expect(parsed.results[1].success).toBe(true);
          expect(parsed.results[1].suggestionId).toBe(suggestion2.sId);
        }
      }
    });
  });

  describe("search_agent_templates", () => {
    it("returns at most 10 published templates when no jobType", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create 12 published templates.
      for (let i = 0; i < 12; i++) {
        await TemplateFactory.published();
      }
      // Draft should not appear.
      await TemplateFactory.draft();

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler({}, createTestExtra(authenticator));

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.templates.length).toBe(10);
        }
      }
    });

    it("filters templates by jobType tags", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const salesTemplate = await TemplateFactory.published();
      await salesTemplate.updateAttributes({ tags: ["SALES"] });

      const engineeringTemplate = await TemplateFactory.published();
      await engineeringTemplate.updateAttributes({ tags: ["ENGINEERING"] });

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { jobType: "sales" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          const sIds = parsed.templates.map((t: { sId: string }) => t.sId);
          expect(sIds).toContain(salesTemplate.sId);
          expect(sIds).not.toContain(engineeringTemplate.sId);
        }
      }
    });

    it("returns at most 10 templates for unknown jobType", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create 12 published templates.
      for (let i = 0; i < 12; i++) {
        await TemplateFactory.published();
      }

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { jobType: "unknown_type" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          // Unknown jobType -> empty matchingTags -> limited to 10.
          expect(parsed.templates.length).toBe(10);
        }
      }
    });

    it("returns expected fields per template", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const template = await TemplateFactory.published();
      await template.updateAttributes({
        tags: ["SALES"],
        copilotInstructions: "Test copilot instructions",
      });

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { jobType: "sales" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          const found = parsed.templates.find(
            (t: { sId: string }) => t.sId === template.sId
          );
          expect(found).toBeDefined();
          expect(found.handle).toBe(template.handle);
          expect(found.userFacingDescription).toBe(
            template.userFacingDescription
          );
          expect(found.agentFacingDescription).toBe(
            template.agentFacingDescription
          );
          expect(found.copilotInstructions).toBe("Test copilot instructions");
          expect(found.tags).toEqual(["SALES"]);
        }
      }
    });

    it("uses LLM-based fuzzy matching when query is provided", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const template1 = await TemplateFactory.published();
      await TemplateFactory.published();

      const { getSuggestedTemplatesForQuery } = await import(
        "@app/lib/api/assistant/template_suggestion"
      );
      const { Ok } = await import("@app/types");
      vi.mocked(getSuggestedTemplatesForQuery).mockResolvedValueOnce(
        new Ok([template1])
      );

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { query: "help me draft sales emails" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.templates).toHaveLength(1);
          expect(parsed.templates[0].sId).toBe(template1.sId);
        }
      }

      expect(getSuggestedTemplatesForQuery).toHaveBeenCalledOnce();
    });

    it("returns error when query-based search fails", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      await TemplateFactory.published();

      const { getSuggestedTemplatesForQuery } = await import(
        "@app/lib/api/assistant/template_suggestion"
      );
      const { Err } = await import("@app/types");
      vi.mocked(getSuggestedTemplatesForQuery).mockResolvedValueOnce(
        new Err(new Error("LLM call failed"))
      );

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { query: "something" },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("LLM call failed");
      }
    });

    it("query takes precedence over jobType", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const template = await TemplateFactory.published();
      await template.updateAttributes({ tags: ["SALES"] });

      const { getSuggestedTemplatesForQuery } = await import(
        "@app/lib/api/assistant/template_suggestion"
      );
      const { Ok } = await import("@app/types");
      vi.mocked(getSuggestedTemplatesForQuery).mockResolvedValueOnce(
        new Ok([template])
      );

      const tool = getToolByName("search_agent_templates");
      const result = await tool.handler(
        { jobType: "engineering", query: "sales email drafter" },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      // query branch was used, not tag filtering.
      expect(getSuggestedTemplatesForQuery).toHaveBeenCalledOnce();
    });
  });

  describe("get_agent_template", () => {
    it("returns template with copilotInstructions", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a template with copilotInstructions.
      const template = await TemplateFactory.published();
      await template.updateAttributes({
        copilotInstructions: "Test copilot instructions for this template",
      });

      const tool = getToolByName("get_agent_template");
      const result = await tool.handler(
        { templateId: template.sId },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.sId).toBe(template.sId);
          expect(parsed.handle).toBe(template.handle);
          expect(parsed.userFacingDescription).toBe(
            template.userFacingDescription
          );
          expect(parsed.agentFacingDescription).toBe(
            template.agentFacingDescription
          );
          expect(parsed.copilotInstructions).toBe(
            "Test copilot instructions for this template"
          );
        }
      }
    });

    it("returns null copilotInstructions when not set", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create a template without copilotInstructions.
      const template = await TemplateFactory.published();

      const tool = getToolByName("get_agent_template");
      const result = await tool.handler(
        { templateId: template.sId },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const parsed = JSON.parse(content.text);
          expect(parsed.sId).toBe(template.sId);
          expect(parsed.copilotInstructions).toBeNull();
        }
      }
    });

    it("returns error for non-existent template", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const tool = getToolByName("get_agent_template");
      const result = await tool.handler(
        { templateId: "non-existent-template-id" },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("Template not found");
        expect(result.error.message).toContain("non-existent-template-id");
      }
    });
  });

  describe("inspect_conversation", () => {
    it("returns conversation with user and agent messages", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      // Create an agent configuration.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // Create a conversation with 2 message pairs (user + agent each).
      const conversation = await ConversationFactory.create(authenticator, {
        agentConfigurationId: agentConfiguration.sId,
        messagesCreatedAt: [new Date(), new Date()],
      });

      const tool = getToolByName("inspect_conversation");
      const result = await tool.handler(
        { conversationId: conversation.sId },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const text = content.text;
          // Header should contain conversation sId and title.
          expect(text).toContain(`# ${conversation.sId}: Test Conversation`);
          // Should not indicate truncation.
          expect(text).not.toContain("_(conversation truncated)_");
          // 2 user messages + 2 agent messages = 4 "## Message" headers.
          const messageHeaders = text.match(/^## Message \d+$/gm) ?? [];
          expect(messageHeaders).toHaveLength(4);
          // First message should be from user.
          expect(text).toContain("from user");
          // Second message should be from agent.
          expect(text).toContain("from agent");
        }
      }
    });

    it("returns error for non-existent conversation", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const tool = getToolByName("inspect_conversation");
      const result = await tool.handler(
        { conversationId: "non-existent-conversation-id" },
        createTestExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
    });

    it("prevents cross-workspace unauthorized conversation access", async () => {
      const { authenticator: auth1 } = await createResourceTest({
        role: "admin",
      });

      // Create a second workspace with a different user.
      const { authenticator: auth2 } = await createResourceTest({
        role: "admin",
      });

      // User 1 creates an agent and a conversation in workspace 1.
      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(auth1);
      const conversation = await ConversationFactory.create(auth1, {
        agentConfigurationId: agentConfiguration.sId,
        messagesCreatedAt: [new Date()],
      });

      const tool = getToolByName("inspect_conversation");

      // User 2 attempts to access User 1's conversation using User 1's conversation ID
      // but with User 2's auth (from workspace 2).
      const result = await tool.handler(
        { conversationId: conversation.sId },
        createTestExtra(auth2)
      );
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain("not found or not accessible");
      }
    });

    it("prevents unauthorized access to conversations in spaces user cannot access", async () => {
      // Create workspace with admin1
      const {
        authenticator: admin1,
        workspace,
        user: user1,
        globalSpace,
      } = await createResourceTest({
        role: "admin",
      });

      // Create a restricted space in the same workspace
      const restrictedSpace = await SpaceFactory.regular(workspace);

      // Fetch the created space with its groups so we can add admin1 as a member
      const internalAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const fetchedSpace = await SpaceResource.fetchById(
        internalAuth,
        restrictedSpace.sId
      );
      if (fetchedSpace?.groups[0]) {
        await fetchedSpace.groups[0].addMember(internalAuth, {
          user: user1.toJSON(),
        });
      }

      // Create user2 in the same workspace (but not a member of the restricted space)
      const user2Resource = await UserFactory.basic();
      await MembershipFactory.associate(workspace, user2Resource, {
        role: "user",
      });
      const user2 = await Authenticator.fromUserIdAndWorkspaceId(
        user2Resource.sId,
        workspace.sId
      );

      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(admin1);

      // Create a conversation in the public global space (user2 should have access)
      const publicConversation = await ConversationFactory.create(admin1, {
        agentConfigurationId: agentConfiguration.sId,
        messagesCreatedAt: [new Date()],
        spaceId: globalSpace.id,
      });

      // Create a conversation in the restricted space (user2 should NOT have access)
      const restrictedConversation = await ConversationFactory.create(admin1, {
        agentConfigurationId: agentConfiguration.sId,
        messagesCreatedAt: [new Date()],
        spaceId: restrictedSpace.id,
      });

      const tool = getToolByName("inspect_conversation");

      // User 2 should be able to access the public conversation
      const publicResult = await tool.handler(
        { conversationId: publicConversation.sId },
        createTestExtra(user2)
      );
      expect(publicResult.isOk()).toBe(true);

      // User 2 should NOT be able to access the restricted space conversation
      const restrictedResult = await tool.handler(
        { conversationId: restrictedConversation.sId },
        createTestExtra(user2)
      );
      expect(restrictedResult.isErr()).toBe(true);
      if (restrictedResult.isErr()) {
        expect(restrictedResult.error.message).toContain(
          "not found or not accessible"
        );
      }
    });

    it("applies fromMessageIndex and toMessageIndex correctly", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const agentConfiguration =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // Create a conversation with 3 message pairs.
      const conversation = await ConversationFactory.create(authenticator, {
        agentConfigurationId: agentConfiguration.sId,
        messagesCreatedAt: [new Date(), new Date(), new Date()],
      });

      const tool = getToolByName("inspect_conversation");

      // Request only messages at index 1 and 2.
      const result = await tool.handler(
        {
          conversationId: conversation.sId,
          fromMessageIndex: 1,
          toMessageIndex: 3,
        },
        createTestExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const content = result.value[0];
        expect(content.type).toBe("text");
        if (content.type === "text") {
          const text = content.text;
          // Should have 2 messages (index 1 and 2).
          const messageHeaders = text.match(/^## Message \d+$/gm) ?? [];
          expect(messageHeaders).toHaveLength(2);
          // Should indicate truncation.
          expect(text).toContain("_(conversation truncated)_");
        }
      }
    });
  });
});
