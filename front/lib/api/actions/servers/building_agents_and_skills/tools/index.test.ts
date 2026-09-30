import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import {
  DESCRIBE_AGENT_TOOL_NAME,
  DESCRIBE_SKILL_TOOL_NAME,
  SUGGEST_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { applyBatchSuggestions } from "@app/lib/api/assistant/apply_batch_suggestions";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";
import assert from "assert";
import { describe, expect, it } from "vitest";

import { TOOLS } from "./index";

const BATCH_SUGGESTION_DIRECTIVE_REGEX = /^:batch_edit\[\]\{sId=(\S+)\}$/;

function getTool(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  return tool;
}

// The skill tools only read `runContext.conversation`, to record the conversation a suggestion was
// made in, so a partial extra cast to ToolHandlerExtra is sufficient (mirroring skill_authoring).
// `sourceConversationIds` has no foreign key, so a synthetic conversation id is enough here.
const TEST_CONVERSATION_MODEL_ID = 424242;

function makeExtra(
  auth: Authenticator,
  conversationModelId: ModelId = TEST_CONVERSATION_MODEL_ID,
  conversationId?: string
) {
  const extra: Pick<
    ToolHandlerExtra,
    "auth" | "requestId" | "sendNotification" | "sendRequest" | "signal"
  > & { runContext: unknown } = {
    auth,
    requestId: "test-request",
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error(
        "Unexpected MCP request in building_agents_and_skills test."
      );
    },
    signal: new AbortController().signal,
    runContext: {
      contextType: "agent_loop",
      conversation: { id: conversationModelId, sId: conversationId },
    },
  };

  return extra as ToolHandlerExtra;
}

// Seed a skill and refresh the authenticator so it picks up the editor group
// membership created during makeNew.
async function seedSkill(
  auth: Authenticator,
  overrides: Parameters<typeof SkillFactory.create>[1]
) {
  const skill = await SkillFactory.create(auth, overrides);
  await auth.refresh();
  return skill;
}

async function addMember(
  workspace: WorkspaceType,
  role: "user" | "admin" = "user"
) {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role });
  return user;
}

async function fetchAgentToolIds(auth: Authenticator, agentId: string) {
  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "full",
  });
  return (agent?.actions ?? [])
    .filter(isServerSideMCPServerConfiguration)
    .map((action) => action.mcpServerViewId);
}

function expectMcpError(
  result: Awaited<ReturnType<(typeof TOOLS)[number]["handler"]>>,
  fragment: string
) {
  expect(result.isErr()).toBe(true);
  if (result.isOk()) {
    throw new Error("Expected an error.");
  }
  expect(result.error.message).toContain(fragment);
}

// An agent built on a restricted space its owner belongs to: a workspace admin outside that space
// holds `admin` on it but not `read`, so they only get its light resource (no instructions).
async function createAgentOnUnreadableSpace(workspace: WorkspaceType) {
  const owner = await addMember(workspace);
  const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
    owner.sId,
    workspace.sId
  );
  const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );
  const restrictedSpace = await SpaceFactory.regular(workspace);
  await restrictedSpace.addMembers(internalAdminAuth, {
    userIds: [owner.sId],
  });
  return AgentConfigurationFactory.createTestAgent(ownerAuth, {
    name: "RestrictedAgent",
    instructionsHtml: '<p data-block-id="block1">Secret instructions.</p>',
    requestedSpaceIds: [restrictedSpace.id],
  });
}

// A non-admin role membership does not grant create/agent by itself — it requires a group grant.
async function createAgentAuthorTestContext() {
  const result = await createResourceTest({ role: "user" });
  await grantWorkspacePermission(result.workspace, result.user, {
    grantType: "create",
    resourceType: "agent",
  });
  await result.authenticator.refresh();
  return result;
}

async function createSkillAuthorTestContext() {
  const result = await createResourceTest({ role: "user" });
  await grantWorkspacePermission(result.workspace, result.user, {
    grantType: "create",
    resourceType: "skill",
  });
  await result.authenticator.refresh();
  return result;
}

describe("building_agents_and_skills tools", () => {
  describe(DESCRIBE_SKILL_TOOL_NAME, () => {
    it("returns the skill with its block-structured instructions", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "Described",
        agentFacingDescription: "Use when describing things.",
        instructionsHtml: '<p data-block-id="blk00001">Describe it.</p>',
      });

      const result = await getTool(DESCRIBE_SKILL_TOOL_NAME).handler(
        { skillId: skill.sId },
        makeExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      if (result.value[0]?.type !== "text") {
        throw new Error("Expected text output.");
      }
      expect(result.value[0].text).toContain(`ID="${skill.sId}"`);
      expect(result.value[0].text).toContain('name="Described"');
      expect(result.value[0].text).toContain("Use when describing things.");
      expect(result.value[0].text).toContain('data-block-id="blk00001"');
      expect(result.value[0].text).toContain(
        `<editors>${authenticator.getNonNullableUser().sId}</editors>`
      );
    });

    it("rejects non-custom skill ids", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await getTool(DESCRIBE_SKILL_TOOL_NAME).handler(
        { skillId: "not-a-skill" },
        makeExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
    });
  });

  describe(DESCRIBE_AGENT_TOOL_NAME, () => {
    it("returns the agent with its block-structured instructions", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const created = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Described Agent", description: "Describes things." }
      );
      const agent = await AgentConfigurationFactory.updateTestAgent(
        authenticator,
        created.sId,
        {
          name: "Described Agent",
          description: "Describes things.",
          instructionsHtml:
            '<div data-block-id="instructions-root">' +
            '<p data-block-id="block1">Be helpful.</p></div>',
        }
      );

      const result = await getTool(DESCRIBE_AGENT_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      if (result.value[0]?.type !== "text") {
        throw new Error("Expected text output.");
      }
      expect(result.value[0].text).toContain(`Described Agent [${agent.sId}]`);
      expect(result.value[0].text).toContain("Describes things.");
      expect(result.value[0].text).toContain("- Tags: none\n");
      expect(result.value[0].text).toContain('data-block-id="block1"');
      expect(result.value[0].text).toContain(
        "required to target block-level instruction edits"
      );
    });

    it("lists the agent's tags", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Tagged Agent" }
      );
      const sales = await TagFactory.create(workspace, { name: "Sales" });
      const support = await TagFactory.create(workspace, { name: "Support" });
      await TagFactory.addToAgent(authenticator, sales, agent);
      await TagFactory.addToAgent(authenticator, support, agent);

      const result = await getTool(DESCRIBE_AGENT_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(authenticator)
      );

      if (result.isErr()) {
        throw result.error;
      }
      if (result.value[0]?.type !== "text") {
        throw new Error("Expected text output.");
      }
      expect(result.value[0].text).toContain("- Tags: Sales, Support\n");
    });

    it("returns the agent's structured output only when it has one", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const responseFormat = JSON.stringify({
        type: "json_schema",
        json_schema: {
          name: "ticket_summary",
          schema: {
            type: "object",
            properties: { priority: { type: "string" } },
            required: ["priority"],
            additionalProperties: false,
          },
        },
      });
      const structuredAgent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        {
          name: "Structured Agent",
          model: {
            providerId: "openai",
            modelId: "gpt-5-mini",
            responseFormat,
          },
        }
      );
      const plainAgent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Plain Agent" }
      );

      const describeAgentText = async (agentId: string) => {
        const result = await getTool(DESCRIBE_AGENT_TOOL_NAME).handler(
          { agentId },
          makeExtra(authenticator)
        );
        if (result.isErr()) {
          throw result.error;
        }
        if (result.value[0]?.type !== "text") {
          throw new Error("Expected text output.");
        }
        return result.value[0].text;
      };

      const structuredText = await describeAgentText(structuredAgent.sId);
      expect(structuredText).toContain(
        `- Structured output (JSON response format): ${responseFormat}`
      );

      const plainText = await describeAgentText(plainAgent.sId);
      expect(plainText).not.toContain("Structured output");
    });

    it("returns an MCPError for an unknown agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await getTool(DESCRIBE_AGENT_TOOL_NAME).handler(
        { agentId: "unknown_agent" },
        makeExtra(authenticator)
      );

      expectMcpError(result, "not found");
    });

    it("redacts instructions, skills and tools for an admin who cannot read the agent", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "admin",
      });
      const owner = await addMember(workspace);
      const ownerAuth = await Authenticator.fromUserIdAndWorkspaceId(
        owner.sId,
        workspace.sId
      );
      const agent = await AgentConfigurationFactory.createTestAgent(ownerAuth, {
        name: "Hidden Agent",
        scope: "hidden",
      });
      const tag = await TagFactory.create(workspace, { name: "Sales" });
      await TagFactory.addToAgent(ownerAuth, tag, agent);

      const result = await getTool(DESCRIBE_AGENT_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      if (result.value[0]?.type !== "text") {
        throw new Error("Expected text output.");
      }
      expect(result.value[0].text).toContain("Hidden Agent");
      // Tags are public, so they are not redacted.
      expect(result.value[0].text).toContain("- Tags: Sales\n");
      expect(result.value[0].text).toContain(
        "Instructions, skills and tools are private"
      );
      expect(result.value[0].text).not.toContain("Test Instructions");
    });
  });

  describe(SUGGEST_TOOL_NAME, () => {
    // The batch references its source conversation, so `suggest` needs a real one.
    const runSuggest = async (
      auth: Authenticator,
      args: Record<string, unknown>
    ) => {
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "dust",
        messagesCreatedAt: [],
      });
      return getTool(SUGGEST_TOOL_NAME).handler(
        args,
        makeExtra(auth, conversation.id, conversation.sId)
      );
    };

    const extractBatchId = (
      result: Awaited<ReturnType<typeof runSuggest>>
    ): string => {
      if (result.isErr()) {
        throw result.error;
      }
      const output = result.value[0];
      if (output?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const match = BATCH_SUGGESTION_DIRECTIVE_REGEX.exec(output.text);
      if (!match) {
        throw new Error(`Unexpected tool output: ${output.text}`);
      }
      return match[1];
    };

    it("records every change as pending suggestions of one batch, without applying them", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "OldHelper" }
      );
      const skill = await seedSkill(authenticator, { name: "Old Skill" });

      const result = await runSuggest(authenticator, {
        title: "Rename helper and skill",
        analysis: "Both names follow the new convention.",
        suggestions: [
          {
            kind: "edit_agent",
            agentId: agent.sId,
            name: "NewHelper",
            description: "Helps with incidents.",
          },
          { kind: "edit_skill", skillId: skill.sId, name: "New Skill" },
        ],
      });
      const batchId = extractBatchId(result);

      const batch = await BatchSuggestionResource.fetchById(
        authenticator,
        batchId
      );
      expect(batch?.toJSON()).toMatchObject({
        title: "Rename helper and skill",
        analysis: "Both names follow the new convention.",
        state: "pending",
      });
      expect(
        batch?.agentSuggestions.map((s) => s.toJSON()).map((s) => s.kind)
      ).toEqual(["name", "description"]);
      expect(batch?.skillSuggestions.map((s) => s.toJSON())).toMatchObject([
        { kind: "name", suggestion: { name: "New Skill" } },
      ]);
      for (const suggestion of [
        ...(batch?.agentSuggestions ?? []),
        ...(batch?.skillSuggestions ?? []),
      ]) {
        expect(suggestion.state).toBe("pending");
        expect(suggestion.source).toBe("conversational");
      }

      const untouched = await getAgentConfiguration(authenticator, {
        agentId: agent.sId,
        variant: "light",
      });
      expect(untouched?.name).toBe("OldHelper");
    });

    it("records nothing when one of the changes is invalid", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "OldHelper" }
      );
      const skill = await seedSkill(authenticator, { name: "Same Name" });

      const result = await runSuggest(authenticator, {
        title: "Rename",
        analysis: "Rename both.",
        suggestions: [
          { kind: "edit_agent", agentId: agent.sId, name: "NewHelper" },
          { kind: "edit_skill", skillId: skill.sId, name: "Same Name" },
        ],
      });

      expectMcpError(result, "already named");
      const pending = await AgentSuggestionResource.listByAgentConfigurationId(
        authenticator,
        agent.sId,
        { states: ["pending"] }
      );
      expect(pending).toHaveLength(0);
    });

    it("outdates a whole batch when one of its suggestions is superseded", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "OldHelper" }
      );
      const skill = await seedSkill(authenticator, { name: "Old Skill" });

      const firstBatchId = extractBatchId(
        await runSuggest(authenticator, {
          title: "Rename both",
          analysis: "Naming convention.",
          suggestions: [
            { kind: "edit_agent", agentId: agent.sId, name: "FirstName" },
            { kind: "edit_skill", skillId: skill.sId, name: "Renamed Skill" },
          ],
        })
      );
      // A later rename of the same agent supersedes the first batch's agent rename.
      const secondBatchId = extractBatchId(
        await runSuggest(authenticator, {
          title: "Rename agent",
          analysis: "Better name.",
          suggestions: [
            { kind: "edit_agent", agentId: agent.sId, name: "SecondName" },
          ],
        })
      );

      const first = await BatchSuggestionResource.fetchById(
        authenticator,
        firstBatchId
      );
      expect(first?.state).toBe("outdated");
      for (const suggestion of [
        ...(first?.agentSuggestions ?? []),
        ...(first?.skillSuggestions ?? []),
      ]) {
        expect(suggestion.state).toBe("outdated");
      }

      const second = await BatchSuggestionResource.fetchById(
        authenticator,
        secondBatchId
      );
      expect(second?.state).toBe("pending");
    });

    it("refuses two suggestions targeting the same agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const result = await runSuggest(authenticator, {
        title: "Twice",
        analysis: "Twice.",
        suggestions: [
          { kind: "edit_agent", agentId: agent.sId, name: "NewHelper" },
          { kind: "delete_agent", agentId: agent.sId },
        ],
      });

      expectMcpError(result, "targeted by several suggestions");
    });

    it("refuses a global agent before recording anything", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const result = await runSuggest(authenticator, {
        title: "Delete helper",
        analysis: "Unused.",
        suggestions: [{ kind: "delete_agent", agentId: "helper" }],
      });

      expectMcpError(result, "global agent");
    });

    it("refuses instruction edits from an admin who cannot read the agent, recording nothing", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "admin",
      });
      const agent = await createAgentOnUnreadableSpace(workspace);

      expectMcpError(
        await runSuggest(authenticator, {
          title: "Edit restricted agent",
          analysis: "Edit.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              instructionEdits: [
                {
                  targetBlockId: "block1",
                  content: "<p>Replaced.</p>",
                  type: "replace",
                },
              ],
            },
          ],
        }),
        "Only editors can suggest changing a workspace agent's instructions"
      );
      expect(
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agent.sId
        )
      ).toEqual([]);
    });

    it("refuses instruction edits targeting a block that does not exist", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { instructionsHtml: '<p data-block-id="blk00001">Be nice.</p>' }
      );
      const skill = await seedSkill(authenticator, {
        name: "Block Skill",
        instructionsHtml: '<p data-block-id="blk00002">Triage.</p>',
      });
      const edit = {
        targetBlockId: "missing1",
        content: "<p>Replaced.</p>",
        type: "replace",
      };

      expectMcpError(
        await runSuggest(authenticator, {
          title: "Edit agent",
          analysis: "Edit.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              instructionEdits: [edit],
            },
          ],
        }),
        "do not exist in the agent's instructions"
      );
      expectMcpError(
        await runSuggest(authenticator, {
          title: "Edit skill",
          analysis: "Edit.",
          suggestions: [
            {
              kind: "edit_skill",
              skillId: skill.sId,
              instructionEdits: [edit],
            },
          ],
        }),
        "do not exist in the skill's instructions"
      );
    });

    it("refuses creating an agent with the name of an existing agent", async () => {
      const { authenticator } = await createAgentAuthorTestContext();
      await AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "TakenName",
      });

      const result = await runSuggest(authenticator, {
        title: "New agent",
        analysis: "New agent.",
        suggestions: [
          {
            kind: "create_agent",
            name: "TakenName",
            description: "Does things.",
            instructions: "<p>Do things.</p>",
          },
        ],
      });

      expectMcpError(result, "already exists");
    });

    it("records an agent creation with its tools and skills", async () => {
      const { authenticator, workspace, globalSpace } =
        await createAgentAuthorTestContext();
      const server = await RemoteMCPServerFactory.create(workspace);
      const view = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        globalSpace
      );
      const skill = await seedSkill(authenticator, { name: "Triage" });

      const batchId = extractBatchId(
        await runSuggest(authenticator, {
          title: "New agent",
          analysis: "Incidents need a helper.",
          suggestions: [
            {
              kind: "create_agent",
              name: "IncidentHelper",
              description: "Helps triage incidents.",
              instructions: "<p>Triage incidents.</p>",
              toolIds: [view.sId],
              skillIds: [skill.sId],
            },
          ],
        })
      );

      const batch = await BatchSuggestionResource.fetchById(
        authenticator,
        batchId
      );
      expect(batch?.agentSuggestions.map((s) => s.toJSON())).toMatchObject([
        {
          kind: "create",
          state: "pending",
          suggestion: {
            name: "IncidentHelper",
            toolIds: [view.sId],
            skillIds: [skill.sId],
          },
        },
      ]);
    });

    it("refuses creating an agent with a tool that needs a configuration", async () => {
      const { authenticator, workspace, globalSpace } =
        await createAgentAuthorTestContext();
      const searchView = await MCPServerViewFactory.internal(
        workspace,
        "search",
        globalSpace
      );

      const result = await runSuggest(authenticator, {
        title: "New agent",
        analysis: "New agent.",
        suggestions: [
          {
            kind: "create_agent",
            name: "Searcher",
            description: "Searches things.",
            instructions: "<p>Search things.</p>",
            toolIds: [searchView.sId],
          },
        ],
      });

      expectMcpError(result, "needs a configuration");
    });

    it("refuses creating an agent with a skill the same batch deletes", async () => {
      const { authenticator } = await createAgentAuthorTestContext();
      const skill = await seedSkill(authenticator, { name: "Triage" });

      const result = await runSuggest(authenticator, {
        title: "New agent",
        analysis: "New agent.",
        suggestions: [
          {
            kind: "create_agent",
            name: "IncidentHelper",
            description: "Helps triage incidents.",
            instructions: "<p>Triage incidents.</p>",
            skillIds: [skill.sId],
          },
          { kind: "delete_skill", skillId: skill.sId },
        ],
      });

      expectMcpError(result, "is both deleted and added to an agent");
    });

    const createSkill = {
      kind: "create_skill",
      name: "Meeting Notes",
      userFacingDescription: "Summarizes meeting notes.",
      agentFacingDescription: "Use to summarize meeting notes.",
      instructions: "<p>Summarize the notes.</p>",
    };

    it("records a skill creation on a pending placeholder skill", async () => {
      const { authenticator, user } = await createSkillAuthorTestContext();

      const batchId = extractBatchId(
        await runSuggest(authenticator, {
          title: "New skill",
          analysis: "Notes keep coming up.",
          suggestions: [createSkill],
        })
      );

      const batch = await BatchSuggestionResource.fetchById(
        authenticator,
        batchId
      );
      expect(batch?.skillSuggestions.map((s) => s.toJSON())).toMatchObject([
        {
          kind: "create",
          state: "pending",
          source: "conversational",
          suggestion: {
            name: "Meeting Notes",
            userFacingDescription: "Summarizes meeting notes.",
            agentFacingDescription: "Use to summarize meeting notes.",
            instructions: "<p>Summarize the notes.</p>",
          },
        },
      ]);

      const placeholderId = batch?.skillSuggestions[0]?.skillConfigurationSId;
      assert(placeholderId);
      const placeholder = await SkillResource.fetchById(
        authenticator,
        placeholderId
      );
      expect(placeholder?.status).toBe("pending");
      const editors = await placeholder?.listEditors(authenticator);
      expect(editors?.map((editor) => editor.sId)).toEqual([user.sId]);
    });

    it("records a skill creation and an agent edit in one batch", async () => {
      const { authenticator } = await createSkillAuthorTestContext();
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const batchId = extractBatchId(
        await runSuggest(authenticator, {
          title: "Notes skill",
          analysis: "Move note taking to a skill.",
          suggestions: [
            createSkill,
            {
              kind: "edit_agent",
              agentId: agent.sId,
              description: "Takes notes with a skill.",
            },
          ],
        })
      );

      const batch = await BatchSuggestionResource.fetchById(
        authenticator,
        batchId
      );
      expect(batch?.skillSuggestions.map((s) => s.kind)).toEqual(["create"]);
      expect(batch?.agentSuggestions.map((s) => s.kind)).toEqual([
        "description",
      ]);
    });

    it("refuses creating a skill with the name of an existing skill", async () => {
      const { authenticator } = await createSkillAuthorTestContext();
      await seedSkill(authenticator, { name: "Meeting Notes" });

      const result = await runSuggest(authenticator, {
        title: "New skill",
        analysis: "New skill.",
        suggestions: [createSkill],
      });

      expectMcpError(result, "already exists");
      const pendingSkills = await SkillResource.listByWorkspace(authenticator, {
        status: "pending",
      });
      expect(pendingSkills).toHaveLength(0);
    });

    it("refuses creating a skill without the create capability", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await runSuggest(authenticator, {
        title: "New skill",
        analysis: "New skill.",
        suggestions: [createSkill],
      });

      expectMcpError(result, "Creating skills is restricted.");
    });

    it("refuses agent instruction edits targeting a block and its child", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        {
          instructionsHtml:
            '<ul data-block-id="parent01"><li data-block-id="child001"><p>Item.</p></li></ul>',
        }
      );

      const result = await runSuggest(authenticator, {
        title: "Edit agent",
        analysis: "Edit.",
        suggestions: [
          {
            kind: "edit_agent",
            agentId: agent.sId,
            instructionEdits: [
              {
                targetBlockId: "parent01",
                content: "<ul><li><p>New.</p></li></ul>",
                type: "replace",
              },
              {
                targetBlockId: "child001",
                content: "<li><p>Other.</p></li>",
                type: "replace",
              },
            ],
          },
        ],
      });

      expectMcpError(result, "overlap");
    });

    it("refuses an edit that changes nothing", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const result = await runSuggest(authenticator, {
        title: "Nothing",
        analysis: "Nothing.",
        suggestions: [{ kind: "edit_agent", agentId: agent.sId }],
      });

      expectMcpError(result, "does not change anything");
    });

    describe("refs", () => {
      const fetchBatch = async (
        auth: Authenticator,
        result: Awaited<ReturnType<typeof runSuggest>>
      ) => {
        const batch = await BatchSuggestionResource.fetchById(
          auth,
          extractBatchId(result)
        );
        assert(batch);
        return batch;
      };

      it("resolves skill tags of new skills citing each other", async () => {
        const { authenticator } = await createSkillAuthorTestContext();

        const batch = await fetchBatch(
          authenticator,
          await runSuggest(authenticator, {
            title: "Meeting skills",
            analysis: "Two skills that call each other.",
            suggestions: [
              {
                ...createSkill,
                ref: "notes",
                instructions: '<p>Then use <skill ref="summary"/></p>',
              },
              {
                ...createSkill,
                name: "Meeting Summary",
                ref: "summary",
                instructions: "<p>Reuse <skill ref='notes' name=\"Old\"/></p>",
              },
            ],
          })
        );

        const [notes, summary] = batch.skillSuggestions;
        expect(notes.toJSON().suggestion).toMatchObject({
          instructions: `<p>Then use <skill id="${summary.skillConfigurationSId}" name="Meeting Summary"></skill></p>`,
        });
        expect(summary.toJSON().suggestion).toMatchObject({
          instructions: `<p>Reuse <skill id="${notes.skillConfigurationSId}" name="Meeting Notes"></skill></p>`,
        });
      });

      it("resolves a new skill cited by an edit of an existing skill", async () => {
        const { authenticator } = await createSkillAuthorTestContext();
        const skill = await seedSkill(authenticator, {
          name: "Triage",
          instructionsHtml: '<p data-block-id="blk00001">Triage.</p>',
        });

        const batch = await fetchBatch(
          authenticator,
          await runSuggest(authenticator, {
            title: "Notes skill",
            analysis: "Delegate notes to a new skill.",
            suggestions: [
              {
                kind: "edit_skill",
                skillId: skill.sId,
                instructionEdits: [
                  {
                    targetBlockId: "blk00001",
                    content: '<p>Triage, then use <skill ref="notes"/></p>',
                    type: "replace",
                  },
                ],
              },
              { ...createSkill, ref: "notes" },
            ],
          })
        );

        const pendingSkillId = batch.skillSuggestions.find(
          (s) => s.kind === "create"
        )?.skillConfigurationSId;
        const edit = batch.skillSuggestions.find((s) => s.kind === "edit");
        expect(edit?.toJSON().suggestion).toMatchObject({
          instructionEdits: [
            {
              content: `<p>Triage, then use <skill id="${pendingSkillId}" name="Meeting Notes"></skill></p>`,
            },
          ],
        });
      });

      it("refuses an unknown ref and writes nothing", async () => {
        const { authenticator } = await createSkillAuthorTestContext();

        const result = await runSuggest(authenticator, {
          title: "Notes skill",
          analysis: "Notes.",
          suggestions: [
            {
              ...createSkill,
              instructions: '<p>Use <skill ref="missing"/></p>',
            },
          ],
        });

        expectMcpError(result, "is not declared");
        const pendingSkills = await SkillResource.listByWorkspace(
          authenticator,
          { status: "pending" }
        );
        expect(pendingSkills).toHaveLength(0);
      });

      it("refuses a ref declared twice", async () => {
        const { authenticator } = await createSkillAuthorTestContext();

        const result = await runSuggest(authenticator, {
          title: "Duplicate",
          analysis: "Duplicate.",
          suggestions: [
            { ...createSkill, ref: "notes" },
            { ...createSkill, name: "Other Notes", ref: "notes" },
          ],
        });

        expectMcpError(result, "declared twice");
      });

      it("refuses a skill tag whose ref cannot be parsed", async () => {
        const { authenticator } = await createSkillAuthorTestContext();

        const result = await runSuggest(authenticator, {
          title: "Notes skill",
          analysis: "Notes.",
          suggestions: [
            {
              ...createSkill,
              instructions: '<p>Use <skill ref="bad ref"/></p>',
            },
          ],
        });

        expectMcpError(result, "must be written as");
      });
    });

    describe("tool changes", () => {
      it("records one pending tool addition per tool, together with the instruction edits", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent = await AgentConfigurationFactory.createTestAgent(
          authenticator,
          { instructionsHtml: '<p data-block-id="b1">Answer questions.</p>' }
        );
        const server = await RemoteMCPServerFactory.create(workspace);
        const view = await MCPServerViewFactory.create(
          workspace,
          server.sId,
          globalSpace
        );

        const batchId = extractBatchId(
          await runSuggest(authenticator, {
            title: "Add ticket tool",
            analysis: "The agent needs to open tickets.",
            suggestions: [
              {
                kind: "edit_agent",
                agentId: agent.sId,
                tools: { addToolIds: [view.sId] },
                instructionEdits: [
                  {
                    targetBlockId: "b1",
                    content:
                      '<p data-block-id="b1">Answer questions and open tickets.</p>',
                    type: "replace",
                  },
                ],
              },
            ],
          })
        );

        const batch = await BatchSuggestionResource.fetchById(
          authenticator,
          batchId
        );
        expect(batch?.agentSuggestions.map((s) => s.toJSON())).toMatchObject(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "tools",
              state: "pending",
              suggestion: { action: "add", toolId: view.sId },
            }),
            expect.objectContaining({ kind: "instructions" }),
          ])
        );
        expect(await fetchAgentToolIds(authenticator, agent.sId)).toEqual([]);
      });

      it("outdates a pending addition of the same tool", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const server = await RemoteMCPServerFactory.create(workspace);
        const view = await MCPServerViewFactory.create(
          workspace,
          server.sId,
          globalSpace
        );
        const previous = await AgentSuggestionFactory.createTools(
          authenticator,
          agent,
          { suggestion: { action: "add", toolId: view.sId } }
        );

        extractBatchId(
          await runSuggest(authenticator, {
            title: "Add ticket tool",
            analysis: "The agent needs to open tickets.",
            suggestions: [
              {
                kind: "edit_agent",
                agentId: agent.sId,
                tools: { addToolIds: [view.sId] },
              },
            ],
          })
        );

        const pending =
          await AgentSuggestionResource.listByAgentConfigurationId(
            authenticator,
            agent.sId,
            { states: ["pending"], kind: "tools" }
          );
        expect(pending).toHaveLength(1);
        expect(pending[0].sId).not.toBe(previous.sId);
      });

      it("keeps a pending suggestion of another kind", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const server = await RemoteMCPServerFactory.create(workspace);
        const view = await MCPServerViewFactory.create(
          workspace,
          server.sId,
          globalSpace
        );
        const skill = await seedSkill(authenticator, { name: "Other Skill" });
        const previous = await AgentSuggestionFactory.createSkills(
          authenticator,
          agent,
          { suggestion: { action: "add", skillId: skill.sId } }
        );

        extractBatchId(
          await runSuggest(authenticator, {
            title: "Add ticket tool",
            analysis: "The agent needs to open tickets.",
            suggestions: [
              {
                kind: "edit_agent",
                agentId: agent.sId,
                tools: { addToolIds: [view.sId] },
              },
            ],
          })
        );

        const pending =
          await AgentSuggestionResource.listByAgentConfigurationId(
            authenticator,
            agent.sId,
            { states: ["pending"], kind: "skills" }
          );
        expect(pending.map((s) => s.sId)).toEqual([previous.sId]);
      });

      it("records the removal of one of the agent's tools", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const server = await RemoteMCPServerFactory.create(workspace);
        const view = await MCPServerViewFactory.create(
          workspace,
          server.sId,
          globalSpace
        );
        await AgentMCPServerConfigurationFactory.create(
          authenticator,
          globalSpace,
          { agent, mcpServerView: view }
        );

        const batchId = extractBatchId(
          await runSuggest(authenticator, {
            title: "Remove ticket tool",
            analysis: "The agent no longer opens tickets.",
            suggestions: [
              {
                kind: "edit_agent",
                agentId: agent.sId,
                tools: { removeToolIds: [view.sId] },
              },
            ],
          })
        );

        const batch = await BatchSuggestionResource.fetchById(
          authenticator,
          batchId
        );
        expect(batch?.agentSuggestions.map((s) => s.toJSON())).toMatchObject([
          {
            kind: "tools",
            state: "pending",
            suggestion: { action: "remove", toolId: view.sId },
          },
        ]);
        expect(await fetchAgentToolIds(authenticator, agent.sId)).toEqual([
          view.sId,
        ]);
      });

      it("refuses to remove a tool the agent does not have", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const server = await RemoteMCPServerFactory.create(workspace);
        const view = await MCPServerViewFactory.create(
          workspace,
          server.sId,
          globalSpace
        );

        const result = await runSuggest(authenticator, {
          title: "Remove tool",
          analysis: "Not needed.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              tools: { removeToolIds: [view.sId] },
            },
          ],
        });

        expectMcpError(result, "does not have the tool");
      });

      it("refuses an admin who is not an editor of the agent", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const server = await RemoteMCPServerFactory.create(workspace);
        const view = await MCPServerViewFactory.create(
          workspace,
          server.sId,
          globalSpace
        );
        const admin = await addMember(workspace, "admin");
        const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
          admin.sId,
          workspace.sId
        );

        const result = await runSuggest(adminAuth, {
          title: "Add tool",
          analysis: "Needed.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              tools: { addToolIds: [view.sId] },
            },
          ],
        });

        expectMcpError(result, "Only editors");
      });

      it("refuses a tool restricted to skills", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const server = await RemoteMCPServerFactory.create(workspace);
        const view = await MCPServerViewFactory.create(
          workspace,
          server.sId,
          globalSpace
        );
        const admin = await addMember(workspace, "admin");
        const restriction = await view.updateIsRestrictedToSkills(
          await Authenticator.fromUserIdAndWorkspaceId(
            admin.sId,
            workspace.sId
          ),
          true
        );
        assert(restriction.isOk());

        const result = await runSuggest(authenticator, {
          title: "Add tool",
          analysis: "Needed.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              tools: { addToolIds: [view.sId] },
            },
          ],
        });

        expectMcpError(result, "invalid or not accessible");
      });

      it("refuses a tool that the builder does not offer", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        // `workspace_management` is an `auto_hidden_builder` server.
        const view = await MCPServerViewFactory.internal(
          workspace,
          "workspace_management",
          globalSpace
        );

        const result = await runSuggest(authenticator, {
          title: "Add tool",
          analysis: "Needed.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              tools: { addToolIds: [view.sId] },
            },
          ],
        });

        expectMcpError(result, "invalid or not accessible");
      });

      it("refuses to remove a tool used by several actions", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const server = await RemoteMCPServerFactory.create(workspace);
        const view = await MCPServerViewFactory.create(
          workspace,
          server.sId,
          globalSpace
        );
        for (let i = 0; i < 2; i++) {
          await AgentMCPServerConfigurationFactory.create(
            authenticator,
            globalSpace,
            { agent, mcpServerView: view }
          );
        }

        const result = await runSuggest(authenticator, {
          title: "Remove tool",
          analysis: "Not needed.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              tools: { removeToolIds: [view.sId] },
            },
          ],
        });

        expectMcpError(result, "cannot be removed by a suggestion");
      });

      it("refuses to remove a tool configured with knowledge", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const searchView = await MCPServerViewFactory.internal(
          workspace,
          "search",
          globalSpace
        );
        await AgentMCPServerConfigurationFactory.create(
          authenticator,
          globalSpace,
          { agent, mcpServerView: searchView }
        );

        const result = await runSuggest(authenticator, {
          title: "Remove search",
          analysis: "Not needed.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              tools: { removeToolIds: [searchView.sId] },
            },
          ],
        });

        expectMcpError(result, "cannot be removed by a suggestion");
      });

      it("refuses a tool that does not exist", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);

        const result = await runSuggest(authenticator, {
          title: "Add tool",
          analysis: "Needed.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              tools: { addToolIds: ["msv_unknown"] },
            },
          ],
        });

        expectMcpError(result, "invalid or not accessible");
      });

      it("refuses a tool from a space the caller cannot read", async () => {
        const { authenticator, workspace } = await createResourceTest({
          role: "user",
        });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const restrictedSpace = await SpaceFactory.regular(workspace);
        const server = await RemoteMCPServerFactory.create(workspace);
        const view = await MCPServerViewFactory.create(
          workspace,
          server.sId,
          restrictedSpace
        );

        const result = await runSuggest(authenticator, {
          title: "Add tool",
          analysis: "Needed.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              tools: { addToolIds: [view.sId] },
            },
          ],
        });

        expectMcpError(result, "invalid or not accessible");
      });

      it("refuses a tool that needs a configuration, and records nothing", async () => {
        const { authenticator, workspace, globalSpace } =
          await createResourceTest({ role: "user" });
        const agent = await AgentConfigurationFactory.createTestAgent(
          authenticator,
          { name: "OldHelper" }
        );
        const searchView = await MCPServerViewFactory.internal(
          workspace,
          "search",
          globalSpace
        );

        const result = await runSuggest(authenticator, {
          title: "Add search",
          analysis: "Needed.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              name: "NewHelper",
              tools: { addToolIds: [searchView.sId] },
            },
          ],
        });

        expectMcpError(result, "needs a configuration");
        const pending =
          await AgentSuggestionResource.listByAgentConfigurationId(
            authenticator,
            agent.sId,
            { states: ["pending"] }
          );
        expect(pending).toHaveLength(0);
      });
    });

    describe("sub-agent changes", () => {
      const editSubAgents = (
        agentId: string,
        subAgents: { addAgentIds?: string[]; removeAgentIds?: string[] }
      ) => ({
        title: "Update sub-agents",
        analysis: "The agent needs to delegate.",
        suggestions: [{ kind: "edit_agent", agentId, subAgents }],
      });

      // Gives `agent` the sub-agent through the apply path, as no factory creates one.
      const addSubAgent = async (
        auth: Authenticator,
        agent: LightAgentConfigurationType,
        subAgentId: string
      ) => {
        const batchId = extractBatchId(
          await runSuggest(
            auth,
            editSubAgents(agent.sId, { addAgentIds: [subAgentId] })
          )
        );
        const batch = await BatchSuggestionResource.fetchById(auth, batchId);
        assert(batch);
        const applied = await applyBatchSuggestions(auth, batch);
        assert(applied.isOk());
      };

      it("records one pending suggestion per added or removed sub-agent", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const currentSubAgent = await AgentConfigurationFactory.createTestAgent(
          authenticator,
          { name: "CurrentHelper" }
        );
        await addSubAgent(authenticator, agent, currentSubAgent.sId);
        const newSubAgent = await AgentConfigurationFactory.createTestAgent(
          authenticator,
          { name: "NewHelper" }
        );

        const batchId = extractBatchId(
          await runSuggest(
            authenticator,
            editSubAgents(agent.sId, {
              addAgentIds: [newSubAgent.sId],
              removeAgentIds: [currentSubAgent.sId],
            })
          )
        );

        const batch = await BatchSuggestionResource.fetchById(
          authenticator,
          batchId
        );
        expect(batch?.agentSuggestions.map((s) => s.toJSON())).toMatchObject([
          {
            kind: "sub_agent",
            state: "pending",
            suggestion: {
              action: "add",
              childAgentId: newSubAgent.sId,
              toolId: expect.any(String),
            },
          },
          {
            kind: "sub_agent",
            state: "pending",
            suggestion: { action: "remove", childAgentId: currentSubAgent.sId },
          },
        ]);
      });

      it("outdates a pending suggestion on the same sub-agent", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const subAgent = await AgentConfigurationFactory.createTestAgent(
          authenticator,
          { name: "Helper" }
        );
        const previous = await AgentSuggestionFactory.createSubAgent(
          authenticator,
          agent,
          {
            suggestion: {
              action: "add",
              toolId: "run_agent",
              childAgentId: subAgent.sId,
            },
          }
        );

        extractBatchId(
          await runSuggest(
            authenticator,
            editSubAgents(agent.sId, { addAgentIds: [subAgent.sId] })
          )
        );

        const pending =
          await AgentSuggestionResource.listByAgentConfigurationId(
            authenticator,
            agent.sId,
            { states: ["pending"], kind: "sub_agent" }
          );
        expect(pending).toHaveLength(1);
        expect(pending[0].sId).not.toBe(previous.sId);
      });

      it("refuses an agent as its own sub-agent", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);

        const result = await runSuggest(
          authenticator,
          editSubAgents(agent.sId, { addAgentIds: [agent.sId] })
        );

        expectMcpError(result, "its own sub-agent");
      });

      it("offers the global agents the builder lists, not internal ones", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);

        expectMcpError(
          await runSuggest(
            authenticator,
            editSubAgents(agent.sId, {
              addAgentIds: [GLOBAL_AGENTS_SID.SIDEKICK],
            })
          ),
          "invalid or not accessible"
        );
        extractBatchId(
          await runSuggest(
            authenticator,
            editSubAgents(agent.sId, { addAgentIds: [GLOBAL_AGENTS_SID.DUST] })
          )
        );
      });

      it("refuses an archived or unknown sub-agent", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const archived = await AgentConfigurationFactory.createTestAgent(
          authenticator,
          { name: "ArchivedHelper" }
        );
        const archivedResource = await AgentResource.fetchById(
          authenticator,
          archived.sId
        );
        assert(archivedResource);
        await archivedResource.archive(authenticator);

        for (const subAgentId of [archived.sId, "unknown_agent"]) {
          expectMcpError(
            await runSuggest(
              authenticator,
              editSubAgents(agent.sId, { addAgentIds: [subAgentId] })
            ),
            "invalid or not accessible"
          );
        }
      });

      it("refuses to add as a sub-agent an agent that the same call deletes", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const subAgent = await AgentConfigurationFactory.createTestAgent(
          authenticator,
          { name: "Helper" }
        );

        const result = await runSuggest(authenticator, {
          title: "Update sub-agents",
          analysis: "Replace the helper.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              subAgents: { addAgentIds: [subAgent.sId] },
            },
            { kind: "delete_agent", agentId: subAgent.sId },
          ],
        });

        expectMcpError(result, "both deleted and added as a sub-agent");
      });

      it("refuses an admin who is not an editor of the agent", async () => {
        const { authenticator, workspace } = await createResourceTest({
          role: "user",
        });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const subAgent = await AgentConfigurationFactory.createTestAgent(
          authenticator,
          { name: "Helper" }
        );
        const admin = await addMember(workspace, "admin");
        const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
          admin.sId,
          workspace.sId
        );

        const result = await runSuggest(
          adminAuth,
          editSubAgents(agent.sId, { addAgentIds: [subAgent.sId] })
        );

        expectMcpError(result, "Only editors");
      });

      it("refuses to add a sub-agent the agent has, or remove one it does not have", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const currentSubAgent = await AgentConfigurationFactory.createTestAgent(
          authenticator,
          { name: "CurrentHelper" }
        );
        await addSubAgent(authenticator, agent, currentSubAgent.sId);
        const otherAgent = await AgentConfigurationFactory.createTestAgent(
          authenticator,
          { name: "OtherHelper" }
        );

        expectMcpError(
          await runSuggest(
            authenticator,
            editSubAgents(agent.sId, { addAgentIds: [currentSubAgent.sId] })
          ),
          "already has the sub-agent"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editSubAgents(agent.sId, { removeAgentIds: [otherAgent.sId] })
          ),
          "does not have the sub-agent"
        );
      });
    });

    describe("skill changes", () => {
      const editSkills = (
        agentId: string,
        skills: { addSkillIds?: string[]; removeSkillIds?: string[] }
      ) => ({
        title: "Update skills",
        analysis: "The agent needs other skills.",
        suggestions: [{ kind: "edit_agent", agentId, skills }],
      });

      it("records one pending suggestion per added or removed skill", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const currentSkill = await seedSkill(authenticator, {
          name: "Current Skill",
        });
        await SkillFactory.linkToAgent(authenticator, {
          skillId: currentSkill.id,
          agentConfigurationId: agent.id,
        });
        const newSkill = await seedSkill(authenticator, { name: "New Skill" });

        const batchId = extractBatchId(
          await runSuggest(
            authenticator,
            editSkills(agent.sId, {
              addSkillIds: [newSkill.sId],
              removeSkillIds: [currentSkill.sId],
            })
          )
        );

        const batch = await BatchSuggestionResource.fetchById(
          authenticator,
          batchId
        );
        expect(batch?.agentSuggestions.map((s) => s.toJSON())).toMatchObject([
          {
            kind: "skills",
            state: "pending",
            suggestion: { action: "add", skillId: newSkill.sId },
          },
          {
            kind: "skills",
            state: "pending",
            suggestion: { action: "remove", skillId: currentSkill.sId },
          },
        ]);
      });

      it("outdates a pending suggestion on the same skill", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const skill = await seedSkill(authenticator, { name: "New Skill" });
        const previous = await AgentSuggestionFactory.createSkills(
          authenticator,
          agent,
          { suggestion: { action: "add", skillId: skill.sId } }
        );

        extractBatchId(
          await runSuggest(
            authenticator,
            editSkills(agent.sId, { addSkillIds: [skill.sId] })
          )
        );

        const pending =
          await AgentSuggestionResource.listByAgentConfigurationId(
            authenticator,
            agent.sId,
            { states: ["pending"], kind: "skills" }
          );
        expect(pending).toHaveLength(1);
        expect(pending[0].sId).not.toBe(previous.sId);
      });

      it("refuses an archived skill", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const skill = await seedSkill(authenticator, {
          name: "Archived Skill",
          status: "archived",
        });

        const result = await runSuggest(
          authenticator,
          editSkills(agent.sId, { addSkillIds: [skill.sId] })
        );

        expectMcpError(result, "invalid, archived or not accessible");
      });

      it("refuses a skill the caller cannot read", async () => {
        const { authenticator, workspace } = await createResourceTest({
          role: "user",
        });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const restrictedSpace = await SpaceFactory.regular(workspace);
        const skill = await seedSkill(authenticator, {
          name: "Restricted Skill",
          requestedSpaceIds: [restrictedSpace.id],
        });

        const result = await runSuggest(
          authenticator,
          editSkills(agent.sId, { addSkillIds: [skill.sId] })
        );

        expectMcpError(result, "invalid, archived or not accessible");
      });

      it("refuses an unpublished skill the caller does not edit", async () => {
        const { authenticator, workspace } = await createResourceTest({
          role: "user",
        });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const skillOwner = await addMember(workspace);
        const skill = await seedSkill(
          await Authenticator.fromUserIdAndWorkspaceId(
            skillOwner.sId,
            workspace.sId
          ),
          { name: "Draft Skill", availability: "editors" }
        );

        const result = await runSuggest(
          authenticator,
          editSkills(agent.sId, { addSkillIds: [skill.sId] })
        );

        expectMcpError(result, "invalid, archived or not accessible");
      });

      it("refuses to add a skill that the same call deletes", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const skill = await seedSkill(authenticator, { name: "Old Skill" });

        const result = await runSuggest(authenticator, {
          title: "Update skills",
          analysis: "Replace the skill.",
          suggestions: [
            {
              kind: "edit_agent",
              agentId: agent.sId,
              skills: { addSkillIds: [skill.sId] },
            },
            { kind: "delete_skill", skillId: skill.sId },
          ],
        });

        expectMcpError(result, "both deleted and added");
      });

      it("refuses an admin who is not an editor of the agent", async () => {
        const { authenticator, workspace } = await createResourceTest({
          role: "user",
        });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const skill = await seedSkill(authenticator, { name: "New Skill" });
        const admin = await addMember(workspace, "admin");
        const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
          admin.sId,
          workspace.sId
        );

        const result = await runSuggest(
          adminAuth,
          editSkills(agent.sId, { addSkillIds: [skill.sId] })
        );

        expectMcpError(result, "Only editors");
      });

      it("refuses to add a skill the agent has, or remove one it does not have", async () => {
        const { authenticator } = await createResourceTest({ role: "user" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const currentSkill = await seedSkill(authenticator, {
          name: "Current Skill",
        });
        await SkillFactory.linkToAgent(authenticator, {
          skillId: currentSkill.id,
          agentConfigurationId: agent.id,
        });
        const otherSkill = await seedSkill(authenticator, {
          name: "Other Skill",
        });

        expectMcpError(
          await runSuggest(
            authenticator,
            editSkills(agent.sId, { addSkillIds: [currentSkill.sId] })
          ),
          "already has the skill"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editSkills(agent.sId, { removeSkillIds: [otherSkill.sId] })
          ),
          "does not have the skill"
        );
      });
    });

    describe("editor changes", () => {
      const editEditors = (
        agentId: string,
        editors: { addUserIds?: string[]; removeUserIds?: string[] }
      ) => ({
        title: "Update editors",
        analysis: "The agent needs other editors.",
        suggestions: [{ kind: "edit_agent", agentId, editors }],
      });

      it("records one pending editors suggestion without applying it", async () => {
        const { authenticator, user, workspace } = await createResourceTest({
          role: "user",
        });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const newEditor = await UserFactory.basic();
        await MembershipFactory.associate(workspace, newEditor, {
          role: "user",
        });

        const batchId = extractBatchId(
          await runSuggest(
            authenticator,
            editEditors(agent.sId, {
              addUserIds: [newEditor.sId],
              removeUserIds: [user.sId],
            })
          )
        );

        const batch = await BatchSuggestionResource.fetchById(
          authenticator,
          batchId
        );
        expect(batch?.agentSuggestions.map((s) => s.toJSON())).toMatchObject([
          {
            kind: "editors",
            state: "pending",
            suggestion: {
              addUserIds: [newEditor.sId],
              removeUserIds: [user.sId],
            },
          },
        ]);
        const agentResource = await AgentResource.fetchById(
          authenticator,
          agent.sId
        );
        const editors = (await agentResource?.listEditors(authenticator)) ?? [];
        expect(editors.map((editor) => editor.sId)).toEqual([user.sId]);
      });

      it("rejects changes that do not fit the current editors", async () => {
        const { authenticator, user, workspace } = await createResourceTest({
          role: "user",
        });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const member = await UserFactory.basic();
        await MembershipFactory.associate(workspace, member, { role: "user" });
        const outsider = await UserFactory.basic();

        expectMcpError(
          await runSuggest(
            authenticator,
            editEditors(agent.sId, { addUserIds: [user.sId] })
          ),
          "already editors"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editEditors(agent.sId, { removeUserIds: [member.sId] })
          ),
          "not editors"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editEditors(agent.sId, { addUserIds: [outsider.sId] })
          ),
          "not active members"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editEditors(agent.sId, { removeUserIds: [user.sId] })
          ),
          "without any editor"
        );
      });
    });

    describe("tag changes", () => {
      const editTags = (
        agentId: string,
        tags: { addTags?: string[]; removeTags?: string[] }
      ) => ({
        title: "Update tags",
        analysis: "The agent needs other tags.",
        suggestions: [{ kind: "edit_agent", agentId, tags }],
      });

      it("records one pending tags suggestion by tag name, without applying it", async () => {
        const { authenticator, workspace } = await createResourceTest({
          role: "user",
        });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const sales = await TagFactory.create(workspace, { name: "Sales" });
        await TagFactory.create(workspace, { name: "Support" });
        await AgentResource.bulkUpdate(authenticator, [agent.sId], {
          addTags: [sales],
        });

        const batchId = extractBatchId(
          await runSuggest(
            authenticator,
            // Names match existing tags case-insensitively and are recorded as stored.
            editTags(agent.sId, {
              addTags: [" support "],
              removeTags: ["SALES"],
            })
          )
        );

        const batch = await BatchSuggestionResource.fetchById(
          authenticator,
          batchId
        );
        expect(batch?.agentSuggestions.map((s) => s.toJSON())).toMatchObject([
          {
            kind: "tags",
            state: "pending",
            suggestion: { addTags: ["Support"], removeTags: ["Sales"] },
          },
        ]);
        const agentResource = await AgentResource.fetchById(
          authenticator,
          agent.sId
        );
        const tags = (await agentResource?.listTags(authenticator)) ?? [];
        expect(tags.map((tag) => tag.name)).toEqual(["Sales"]);
      });

      it("lets an admin suggest a tag that does not exist yet", async () => {
        const { authenticator } = await createResourceTest({ role: "admin" });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);

        const batchId = extractBatchId(
          await runSuggest(
            authenticator,
            editTags(agent.sId, { addTags: ["Brand New"] })
          )
        );

        const batch = await BatchSuggestionResource.fetchById(
          authenticator,
          batchId
        );
        expect(batch?.agentSuggestions.map((s) => s.toJSON())).toMatchObject([
          {
            kind: "tags",
            suggestion: { addTags: ["Brand New"], removeTags: [] },
          },
        ]);
      });

      it("rejects changes that do not fit the current tags", async () => {
        const { authenticator, workspace } = await createResourceTest({
          role: "user",
        });
        const agent =
          await AgentConfigurationFactory.createTestAgent(authenticator);
        const sales = await TagFactory.create(workspace, { name: "Sales" });
        await TagFactory.create(workspace, { name: "Support" });
        await TagFactory.create(workspace, {
          name: "Official",
          kind: "protected",
        });
        await AgentResource.bulkUpdate(authenticator, [agent.sId], {
          addTags: [sales],
        });

        expectMcpError(
          await runSuggest(authenticator, editTags(agent.sId, {})),
          "at least one tag"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editTags(agent.sId, { addTags: ["Sales"] })
          ),
          "already tags of the agent"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editTags(agent.sId, { removeTags: ["Support"] })
          ),
          "not tags of the agent"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editTags(agent.sId, {
              addTags: ["Support"],
              removeTags: ["support"],
            })
          ),
          "both added and removed"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editTags(agent.sId, { addTags: ["Brand New"] })
          ),
          "Only workspace admins can create tags"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editTags(agent.sId, { addTags: ["Official"] })
          ),
          "protected tags"
        );
        expectMcpError(
          await runSuggest(
            authenticator,
            editTags(agent.sId, {
              addTags: Array.from({ length: 21 }, (_, i) => `Tag ${i}`),
            })
          ),
          "at most 20 tags"
        );
      });
    });
  });
});
