import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { MAX_PENDING_INSTRUCTIONS_SUGGESTIONS } from "@app/lib/api/actions/servers/agent_sidekick_context/constants";
import {
  DESCRIBE_AGENT_TOOL_NAME,
  DESCRIBE_SKILL_TOOL_NAME,
  SUGGEST_AGENT_CREATION_INPUT_SCHEMA,
  SUGGEST_AGENT_CREATION_TOOL_NAME,
  SUGGEST_AGENT_DELETION_TOOL_NAME,
  SUGGEST_AGENT_DESCRIPTION_TOOL_NAME,
  SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME,
  SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME,
  SUGGEST_AGENT_NAME_TOOL_NAME,
  SUGGEST_AGENT_PUBLISH_STATE_TOOL_NAME,
  SUGGEST_SKILL_AVAILABILITY_TOOL_NAME,
  SUGGEST_SKILL_DELETION_TOOL_NAME,
  SUGGEST_SKILL_EDITORS_TOOL_NAME,
  SUGGEST_SKILL_NAME_TOOL_NAME,
  SUGGEST_SKILL_UPDATE_TOOL_NAME,
  SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME,
  SUGGEST_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { getAgentsEditors } from "@app/lib/api/assistant/editors";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { USER_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentSuggestionFactory } from "@app/tests/utils/AgentSuggestionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { SKILL_NAME_MAX_LENGTH } from "@app/types/assistant/skill_configuration_constants";
import type { ModelId } from "@app/types/shared/model_id";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { SKILL_SUGGESTION_KINDS } from "@app/types/suggestions/skill_suggestion";
import type { WorkspaceType } from "@app/types/user";
import assert from "assert";
import { describe, expect, it } from "vitest";

import { TOOLS } from "./index";

const SKILL_SUGGESTION_DIRECTIVE_REGEX = new RegExp(
  `^:skill_suggestion\\[\\]\\{sId=(\\S+) kind=(${SKILL_SUGGESTION_KINDS.join("|")}) skillId=(\\S+)\\}$`
);
const AGENT_CREATE_SUGGESTION_DIRECTIVE_REGEX =
  /^:agent_suggestion\[\]\{sId=(\S+) kind=create agentId=(\S+)\}$/;
const AGENT_DELETE_SUGGESTION_DIRECTIVE_REGEX =
  /^:agent_suggestion\[\]\{sId=(\S+) kind=delete agentId=(\S+)\}$/;
const AGENT_DESCRIPTION_SUGGESTION_DIRECTIVE_REGEX =
  /^:agent_suggestion\[\]\{sId=(\S+) kind=description agentId=(\S+)\}$/;
const AGENT_MODEL_SUGGESTION_DIRECTIVE_REGEX =
  /^:agent_suggestion\[\]\{sId=(\S+) kind=model agentId=(\S+)\}$/;
const AGENT_NAME_SUGGESTION_DIRECTIVE_REGEX =
  /^:agent_suggestion\[\]\{sId=(\S+) kind=name agentId=(\S+)\}$/;
const AGENT_SCOPE_SUGGESTION_DIRECTIVE_REGEX =
  /^:agent_suggestion\[\]\{sId=(\S+) kind=scope agentId=(\S+)\}$/;
const BATCH_SUGGESTION_DIRECTIVE_REGEX = /^:batch_edit\[\]\{sId=(\S+)\}$/;
const AGENT_INSTRUCTIONS_SUGGESTION_DIRECTIVE_REGEX =
  /^:agent_suggestion\[\]\{sId=(\S+) kind=instructions agentId=(\S+)\}$/;

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

// Agent suggestions instead hold a real `conversationId` foreign key, so their tools need an
// actual conversation row to point at.
async function createTestConversationModelId(
  auth: Authenticator
): Promise<ModelId> {
  const conversation = await createConversation(auth, {
    title: "Test Conversation",
    visibility: "unlisted",
    spaceId: null,
  });

  return conversation.id;
}

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

function extractSuggestionId(text: string, kind = "edit"): string {
  return extractDirective(text, kind).suggestionId;
}

function extractDirective(
  text: string,
  kind = "edit"
): {
  suggestionId: string;
  skillId: string;
} {
  const match = SKILL_SUGGESTION_DIRECTIVE_REGEX.exec(text);
  if (!match || match[2] !== kind) {
    throw new Error(`Unexpected tool output: ${text}`);
  }
  return { suggestionId: match[1], skillId: match[3] };
}

async function addMember(
  workspace: WorkspaceType,
  role: "user" | "admin" = "user"
) {
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role });
  return user;
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

function extractAgentCreateSuggestionDirective(text: string): {
  suggestionId: string;
  agentId: string;
} {
  const match = AGENT_CREATE_SUGGESTION_DIRECTIVE_REGEX.exec(text);
  if (!match) {
    throw new Error(`Unexpected tool output: ${text}`);
  }
  return { suggestionId: match[1], agentId: match[2] };
}

function extractAgentDeleteSuggestionDirective(text: string): {
  suggestionId: string;
  agentId: string;
} {
  const match = AGENT_DELETE_SUGGESTION_DIRECTIVE_REGEX.exec(text);
  if (!match) {
    throw new Error(`Unexpected tool output: ${text}`);
  }
  return { suggestionId: match[1], agentId: match[2] };
}

function extractAgentDescriptionSuggestionDirective(text: string): {
  suggestionId: string;
  agentId: string;
} {
  const match = AGENT_DESCRIPTION_SUGGESTION_DIRECTIVE_REGEX.exec(text);
  if (!match) {
    throw new Error(`Unexpected tool output: ${text}`);
  }
  return { suggestionId: match[1], agentId: match[2] };
}

function extractAgentModelSuggestionDirective(text: string): {
  suggestionId: string;
  agentId: string;
} {
  const match = AGENT_MODEL_SUGGESTION_DIRECTIVE_REGEX.exec(text);
  if (!match) {
    throw new Error(`Unexpected tool output: ${text}`);
  }
  return { suggestionId: match[1], agentId: match[2] };
}
function extractAgentNameSuggestionDirective(text: string): {
  suggestionId: string;
  agentId: string;
} {
  const match = AGENT_NAME_SUGGESTION_DIRECTIVE_REGEX.exec(text);
  if (!match) {
    throw new Error(`Unexpected tool output: ${text}`);
  }
  return { suggestionId: match[1], agentId: match[2] };
}

function extractAgentScopeSuggestionDirective(text: string): {
  suggestionId: string;
  agentId: string;
} {
  const match = AGENT_SCOPE_SUGGESTION_DIRECTIVE_REGEX.exec(text);
  if (!match) {
    throw new Error(`Unexpected tool output: ${text}`);
  }
  return { suggestionId: match[1], agentId: match[2] };
}

function extractAgentInstructionsSuggestionDirectives(text: string): {
  suggestionId: string;
  agentId: string;
}[] {
  return text
    .split("\n\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = AGENT_INSTRUCTIONS_SUGGESTION_DIRECTIVE_REGEX.exec(line);
      if (!match) {
        throw new Error(`Unexpected tool output: ${line}`);
      }
      return { suggestionId: match[1], agentId: match[2] };
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

  describe(SUGGEST_SKILL_UPDATE_TOOL_NAME, () => {
    it("creates a pending conversational suggestion and returns its sId embedded", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "Incident Summary",
        instructions: "Collect impact and timeline.",
        instructionsHtml:
          '<p data-block-id="blk00001">Collect impact and timeline.</p>',
      });

      const result = await getTool(SUGGEST_SKILL_UPDATE_TOOL_NAME).handler(
        {
          skillId: skill.sId,
          instructionEdits: [
            {
              targetBlockId: "blk00001",
              content:
                "<p>Collect impact, timeline, root cause, and follow-ups.</p>",
              type: "replace",
            },
          ],
          analysis: "Root cause and follow-ups were missing.",
          title: "Add root cause",
        },
        makeExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }

      const output = result.value[0];
      expect(output?.type).toBe("text");
      if (output?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const { suggestionId, skillId } = extractDirective(output.text);
      expect(skillId).toBe(skill.sId);

      const suggestion = await SkillSuggestionResource.fetchById(
        authenticator,
        suggestionId
      );
      expect(suggestion).not.toBeNull();
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.source).toBe("conversational");
      expect(suggestion?.kind).toBe("edit");
      expect(suggestion?.title).toBe("Add root cause");
      expect(suggestion?.analysis).toBe(
        "Root cause and follow-ups were missing."
      );
      expect(suggestion?.sourceConversationIds).toEqual([
        TEST_CONVERSATION_MODEL_ID,
      ]);
      expect(suggestion?.toJSON()).toMatchObject({
        suggestion: {
          instructionEdits: [
            expect.objectContaining({ targetBlockId: "blk00001" }),
          ],
        },
      });

      // The skill itself is left untouched.
      const reloaded = await SkillResource.fetchById(authenticator, skill.sId);
      expect(reloaded?.instructions).toBe("Collect impact and timeline.");
    });

    it("records the conversation it ran in, so suggestions can be scoped to it", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "Scoped Suggestions",
        instructionsHtml: null,
      });

      const suggest = (conversationModelId: ModelId) =>
        getTool(SUGGEST_SKILL_UPDATE_TOOL_NAME).handler(
          {
            skillId: skill.sId,
            agentFacingDescriptionEdit: {
              content: `Edit from conversation ${conversationModelId}.`,
            },
          },
          makeExtra(authenticator, conversationModelId)
        );

      const firstResult = await suggest(111);
      const secondResult = await suggest(222);
      if (firstResult.isErr() || secondResult.isErr()) {
        throw new Error("Expected both suggestions to be created.");
      }
      if (
        firstResult.value[0]?.type !== "text" ||
        secondResult.value[0]?.type !== "text"
      ) {
        throw new Error("Expected text output.");
      }
      const firstId = extractSuggestionId(firstResult.value[0].text);
      const secondId = extractSuggestionId(secondResult.value[0].text);

      const scoped = await SkillSuggestionResource.listBySkillConfigurationId(
        authenticator,
        skill.sId,
        { sources: ["conversational"], sourceConversationModelId: 222 }
      );
      expect(scoped.map((s) => s.sId)).toEqual([secondId]);
      expect(scoped.map((s) => s.sId)).not.toContain(firstId);
    });

    it("accepts a description-only suggestion", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "Description Only",
        instructionsHtml: null,
      });

      const result = await getTool(SUGGEST_SKILL_UPDATE_TOOL_NAME).handler(
        {
          skillId: skill.sId,
          agentFacingDescriptionEdit: {
            content: "Use when summarizing incidents for leadership.",
          },
        },
        makeExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      if (result.value[0]?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const suggestionId = extractSuggestionId(result.value[0].text);
      const suggestion = await SkillSuggestionResource.fetchById(
        authenticator,
        suggestionId
      );
      expect(suggestion?.toJSON()).toMatchObject({
        suggestion: {
          agentFacingDescriptionEdit: {
            content: "Use when summarizing incidents for leadership.",
          },
        },
      });
    });

    it("outdates conflicting suggestions and is hidden from default listings", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "Hidden",
        instructionsHtml: '<p data-block-id="blk00001">Old.</p>',
      });
      const existing = await SkillSuggestionFactory.createEdit(
        authenticator,
        skill,
        {
          source: "reinforcement",
          suggestion: {
            instructionEdits: [
              {
                targetBlockId: "blk00001",
                content: "<p>Existing.</p>",
                type: "replace",
              },
            ],
          },
        }
      );

      const result = await getTool(SUGGEST_SKILL_UPDATE_TOOL_NAME).handler(
        {
          skillId: skill.sId,
          instructionEdits: [
            {
              targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
              content: "<p>Rewritten.</p>",
              type: "replace",
            },
          ],
        },
        makeExtra(authenticator)
      );
      expect(result.isOk()).toBe(true);

      // The overlapping reinforcement suggestion is outdated by the new one.
      const reloaded = await SkillSuggestionResource.fetchById(
        authenticator,
        existing.sId
      );
      expect(reloaded?.state).toBe("outdated");

      // Default listings (no explicit sources) do not surface conversational suggestions.
      const listed = await SkillSuggestionResource.listBySkillConfigurationId(
        authenticator,
        skill.sId,
        { states: ["pending"] }
      );
      expect(listed).toHaveLength(0);
      const conversational =
        await SkillSuggestionResource.listBySkillConfigurationId(
          authenticator,
          skill.sId,
          { states: ["pending"], sources: ["conversational"] }
        );
      expect(conversational).toHaveLength(1);
    });

    it("rejects a suggestion with no edits", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "No Edits" });

      const result = await getTool(SUGGEST_SKILL_UPDATE_TOOL_NAME).handler(
        { skillId: skill.sId },
        makeExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        throw new Error("Expected an error.");
      }
      expect(result.error.message).toContain("at least one");
    });

    it("rejects instruction edits when the skill has no instructionsHtml", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "No Html",
        instructionsHtml: null,
      });

      const result = await getTool(SUGGEST_SKILL_UPDATE_TOOL_NAME).handler(
        {
          skillId: skill.sId,
          instructionEdits: [
            {
              targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
              content: "<p>New.</p>",
              type: "replace",
            },
          ],
        },
        makeExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
    });

    it("rejects suggestions from a user who cannot write the skill", async () => {
      const { authenticator: ownerAuth, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(ownerAuth, {
        name: "Someone Else's Skill",
        instructionsHtml: '<p data-block-id="blk00001">Old.</p>',
      });

      // Another member of the same workspace who is not an editor of the skill.
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, { role: "user" });
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      const result = await getTool(SUGGEST_SKILL_UPDATE_TOOL_NAME).handler(
        {
          skillId: skill.sId,
          agentFacingDescriptionEdit: { content: "Hijacked." },
        },
        makeExtra(otherAuth)
      );

      expect(result.isErr()).toBe(true);
      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          ownerAuth,
          skill.sId,
          { sources: ["conversational"] }
        );
      expect(suggestions).toHaveLength(0);
    });

    it("rejects non-custom skill ids", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await getTool(SUGGEST_SKILL_UPDATE_TOOL_NAME).handler(
        {
          skillId: "not-a-skill",
          agentFacingDescriptionEdit: { content: "Whatever." },
        },
        makeExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
    });

    it("rejects an archived skill", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "Archived",
        status: "archived",
      });

      const result = await getTool(SUGGEST_SKILL_UPDATE_TOOL_NAME).handler(
        {
          skillId: skill.sId,
          agentFacingDescriptionEdit: { content: "Whatever." },
        },
        makeExtra(authenticator)
      );

      expectMcpError(result, "archived");
    });
  });

  describe(SUGGEST_SKILL_EDITORS_TOOL_NAME, () => {
    it("creates a pending conversational editors suggestion without touching the editors", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(authenticator, { name: "Editors" });
      const newEditor = await addMember(workspace);

      const result = await getTool(SUGGEST_SKILL_EDITORS_TOOL_NAME).handler(
        {
          skillId: skill.sId,
          addUserIds: [newEditor.sId],
          analysis: "They maintain the runbook this skill follows.",
          title: "Add runbook owner",
        },
        makeExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      if (result.value[0]?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const suggestionId = extractSuggestionId(result.value[0].text, "editors");

      const suggestion = await SkillSuggestionResource.fetchById(
        authenticator,
        suggestionId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.source).toBe("conversational");
      expect(suggestion?.kind).toBe("editors");
      expect(suggestion?.title).toBe("Add runbook owner");
      expect(suggestion?.suggestion).toEqual({
        addUserIds: [newEditor.sId],
        removeUserIds: [],
      });

      // The editor set is left untouched until the suggestion is approved.
      const editors = (await skill.listEditors(authenticator)) ?? [];
      expect(editors.map((u) => u.sId)).toEqual([
        authenticator.getNonNullableUser().sId,
      ]);

      // The Poke suggestions list serializes every row via `toJSON`; an `editors` row must not
      // make that throw.
      expect(() => suggestion?.toJSON()).not.toThrow();
      expect(suggestion?.toJSON()).toMatchObject({
        kind: "editors",
        suggestion: { addUserIds: [newEditor.sId], removeUserIds: [] },
      });
    });

    it("outdates a pending editors suggestion adding the same user, not one removing them", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(authenticator, { name: "Conflicting" });
      const contestedEditor = await addMember(workspace);

      const suggest = async (args: {
        addUserIds?: string[];
        removeUserIds?: string[];
      }) => {
        const result = await getTool(SUGGEST_SKILL_EDITORS_TOOL_NAME).handler(
          { skillId: skill.sId, ...args },
          makeExtra(authenticator)
        );
        if (result.isErr() || result.value[0]?.type !== "text") {
          throw new Error("Expected the suggestion to be created.");
        }
        return extractSuggestionId(result.value[0].text, "editors");
      };
      const stateOf = async (suggestionId: string) =>
        (await SkillSuggestionResource.fetchById(authenticator, suggestionId))
          ?.state;

      const addId = await suggest({ addUserIds: [contestedEditor.sId] });
      const removeId = await suggest({
        removeUserIds: [contestedEditor.sId],
      });
      expect(await stateOf(addId)).toBe("pending");

      const secondAddId = await suggest({ addUserIds: [contestedEditor.sId] });
      expect(await stateOf(addId)).toBe("outdated");
      expect(await stateOf(removeId)).toBe("pending");
      expect(await stateOf(secondAddId)).toBe("pending");
    });

    it("rejects a caller who is neither an editor nor an admin, creating no row", async () => {
      const { authenticator: ownerAuth, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(ownerAuth, { name: "Not Mine" });
      const outsider = await addMember(workspace);
      const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
        outsider.sId,
        workspace.sId
      );

      const result = await getTool(SUGGEST_SKILL_EDITORS_TOOL_NAME).handler(
        { skillId: skill.sId, addUserIds: [outsider.sId] },
        makeExtra(outsiderAuth)
      );

      expectMcpError(result, "editors of this skill or workspace admins");
      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          ownerAuth,
          skill.sId,
          { sources: ["conversational"] }
        );
      expect(suggestions).toHaveLength(0);
    });

    it("rejects an archived skill", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(authenticator, {
        name: "Archived",
        status: "archived",
      });
      const newEditor = await addMember(workspace);

      const result = await getTool(SUGGEST_SKILL_EDITORS_TOOL_NAME).handler(
        { skillId: skill.sId, addUserIds: [newEditor.sId] },
        makeExtra(authenticator)
      );

      expectMcpError(result, "archived");
    });

    it("rejects an unknown user sId", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Unknown User" });

      const result = await getTool(SUGGEST_SKILL_EDITORS_TOOL_NAME).handler(
        { skillId: skill.sId, addUserIds: ["usr_does_not_exist"] },
        makeExtra(authenticator)
      );

      expectMcpError(result, "not found");
    });

    it("rejects an empty addUserIds and removeUserIds", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Empty Lists" });

      const result = await getTool(SUGGEST_SKILL_EDITORS_TOOL_NAME).handler(
        { skillId: skill.sId },
        makeExtra(authenticator)
      );

      expectMcpError(result, "Provide at least one user");
    });

    it("rejects a user present in both addUserIds and removeUserIds", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(authenticator, { name: "Both Lists" });
      const contested = await addMember(workspace);

      const result = await getTool(SUGGEST_SKILL_EDITORS_TOOL_NAME).handler(
        {
          skillId: skill.sId,
          addUserIds: [contested.sId],
          removeUserIds: [contested.sId],
        },
        makeExtra(authenticator)
      );

      expectMcpError(result, "both added and removed");
    });

    it("accepts removing an editor who is no longer a workspace member", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(authenticator, { name: "Departed" });
      const departed = await addMember(workspace);
      await skill.addEditors(authenticator, [departed]);
      await MembershipResource.revokeMembership({
        user: departed,
        workspace,
      });

      const result = await getTool(SUGGEST_SKILL_EDITORS_TOOL_NAME).handler(
        { skillId: skill.sId, removeUserIds: [departed.sId] },
        makeExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
    });

    it("rejects a change that would remove the last editor", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Last Editor" });

      const result = await getTool(SUGGEST_SKILL_EDITORS_TOOL_NAME).handler(
        {
          skillId: skill.sId,
          removeUserIds: [authenticator.getNonNullableUser().sId],
        },
        makeExtra(authenticator)
      );

      expectMcpError(result, "without any editor");
    });

    it("rejects adding an editor without access to the skill's requested spaces", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      // Restricted: no global group is associated with it.
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      await restrictedSpace.addMembers(adminAuth, {
        userIds: [authenticator.getNonNullableUser().sId],
      });
      await authenticator.refresh();
      const skill = await seedSkill(authenticator, {
        name: "Restricted",
        requestedSpaceIds: [restrictedSpace.id],
      });
      const outsider = await addMember(workspace);

      const result = await getTool(SUGGEST_SKILL_EDITORS_TOOL_NAME).handler(
        { skillId: skill.sId, addUserIds: [outsider.sId] },
        makeExtra(authenticator)
      );

      expectMcpError(result, "do not have access");
    });
  });

  describe(SUGGEST_AGENT_CREATION_TOOL_NAME, () => {
    it("records a pending create suggestion against a hidden placeholder agent", async () => {
      const { authenticator, user } = await createAgentAuthorTestContext();

      const result = await getTool(SUGGEST_AGENT_CREATION_TOOL_NAME).handler(
        {
          name: "IncidentHelper",
          description: "Helps triage incidents.",
          instructions: "Collect impact and timeline.",
          analysis: "Incident response had no dedicated helper.",
        },
        makeExtra(
          authenticator,
          await createTestConversationModelId(authenticator)
        )
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }

      const output = result.value[0];
      expect(output?.type).toBe("text");
      if (output?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const { suggestionId, agentId } = extractAgentCreateSuggestionDirective(
        output.text
      );

      const suggestion = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestionId
      );
      expect(suggestion).not.toBeNull();
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.kind).toBe("create");
      expect(suggestion?.source).toBe("conversational");
      expect(suggestion?._agentConfigurationId).toBe(agentId);
      expect(suggestion?.toJSON()).toMatchObject({
        suggestion: {
          name: "IncidentHelper",
          description: "Helps triage incidents.",
          instructions: "Collect impact and timeline.",
        },
        analysis: "Incident response had no dedicated helper.",
      });

      // The suggestion targets a hidden, pending, instructions-less placeholder
      // agent with the caller as sole editor.
      const placeholderAgent = await getAgentConfiguration(authenticator, {
        agentId: suggestion!._agentConfigurationId,
        variant: "light",
      });
      expect(placeholderAgent).not.toBeNull();
      expect(placeholderAgent?.status).toBe("pending");
      expect(placeholderAgent?.scope).toBe("hidden");

      const editors = await getAgentsEditors(authenticator, [
        placeholderAgent!,
      ]);
      expect(editors[placeholderAgent!.sId]?.map((e) => e.sId)).toEqual([
        user.sId,
      ]);
    });

    it("rejects blank fields at the input schema level", () => {
      const valid = {
        name: " Incident Helper ",
        description: "Desc",
        instructions: "Do things.",
      };
      const parsed = SUGGEST_AGENT_CREATION_INPUT_SCHEMA.safeParse(valid);
      expect(parsed.success).toBe(true);
      expect(parsed.data?.name).toBe("Incident Helper");

      for (const field of ["name", "description", "instructions"] as const) {
        expect(
          SUGGEST_AGENT_CREATION_INPUT_SCHEMA.safeParse({
            ...valid,
            [field]: "   ",
          }).success
        ).toBe(false);
      }
    });

    it("returns an MCPError without an interactive user", async () => {
      const { workspace } = await createAgentAuthorTestContext();
      const nonInteractiveAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const result = await getTool(SUGGEST_AGENT_CREATION_TOOL_NAME).handler(
        { name: "No User", description: "Desc", instructions: "Do things." },
        makeExtra(nonInteractiveAuth)
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        throw new Error("Expected an error.");
      }
      expect(result.error.message).toContain("interactive user");
    });

    it("returns an MCPError for users without the create-agent capability", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await getTool(SUGGEST_AGENT_CREATION_TOOL_NAME).handler(
        {
          name: "Restricted",
          description: "Desc",
          instructions: "Do things.",
        },
        makeExtra(authenticator)
      );

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        throw new Error("Expected an error.");
      }
      expect(result.error.message).toContain("restricted");
    });
  });
  describe(SUGGEST_AGENT_DELETION_TOOL_NAME, () => {
    it("records a pending delete suggestion and outdates previous ones", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Old Helper" }
      );

      const first = await getTool(SUGGEST_AGENT_DELETION_TOOL_NAME).handler(
        { agentId: agent.sId, analysis: "Unused for months." },
        makeExtra(
          authenticator,
          await createTestConversationModelId(authenticator)
        )
      );
      expect(first.isOk()).toBe(true);
      if (first.isErr()) {
        throw first.error;
      }
      const firstOutput = first.value[0];
      if (firstOutput?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const { suggestionId: firstId, agentId } =
        extractAgentDeleteSuggestionDirective(firstOutput.text);
      expect(agentId).toBe(agent.sId);

      const suggestion = await AgentSuggestionResource.fetchById(
        authenticator,
        firstId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.kind).toBe("delete");
      expect(suggestion?.toJSON()).toMatchObject({
        suggestion: { name: "Old Helper" },
        analysis: "Unused for months.",
      });

      // The agent itself is untouched.
      const untouched = await getAgentConfiguration(authenticator, {
        agentId: agent.sId,
        variant: "light",
      });
      expect(untouched?.status).toBe("active");

      const second = await getTool(SUGGEST_AGENT_DELETION_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(
          authenticator,
          await createTestConversationModelId(authenticator)
        )
      );
      expect(second.isOk()).toBe(true);

      const previous = await AgentSuggestionResource.fetchById(
        authenticator,
        firstId
      );
      expect(previous?.state).toBe("outdated");
    });

    it("returns an MCPError without an interactive user", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const nonInteractiveAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const result = await getTool(SUGGEST_AGENT_DELETION_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(nonInteractiveAuth)
      );
      expectMcpError(result, "interactive user");
    });

    it("returns an MCPError for an unknown agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await getTool(SUGGEST_AGENT_DELETION_TOOL_NAME).handler(
        { agentId: "unknown_agent" },
        makeExtra(authenticator)
      );
      expectMcpError(result, "not found");
    });

    it("returns an MCPError when the caller is not an editor", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const other = await addMember(workspace);
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        other.sId,
        workspace.sId
      );

      const result = await getTool(SUGGEST_AGENT_DELETION_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(otherAuth)
      );
      expectMcpError(result, "Only editors");
    });

    it("returns an MCPError for an archived agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      await (await AgentResource.fetchById(authenticator, agent.sId))!.archive(
        authenticator
      );

      const result = await getTool(SUGGEST_AGENT_DELETION_TOOL_NAME).handler(
        { agentId: agent.sId },
        makeExtra(authenticator)
      );
      expectMcpError(result, "active agents");
    });
  });

  describe(SUGGEST_AGENT_DESCRIPTION_TOOL_NAME, () => {
    const suggestDescription = async (
      auth: Authenticator,
      args: { agentId: string; description: string; analysis?: string }
    ) =>
      getTool(SUGGEST_AGENT_DESCRIPTION_TOOL_NAME).handler(
        args,
        makeExtra(auth, await createTestConversationModelId(auth))
      );

    it("records a pending suggestion with the description, without changing the agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { description: "Old description." }
      );

      const result = await suggestDescription(authenticator, {
        agentId: agent.sId,
        description: "Handles incident triage end to end.",
        analysis: "The old description was too vague.",
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      const output = result.value[0];
      if (output?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const { suggestionId, agentId } =
        extractAgentDescriptionSuggestionDirective(output.text);
      expect(agentId).toBe(agent.sId);

      const suggestion = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestionId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.source).toBe("conversational");
      expect(suggestion?.toJSON()).toMatchObject({
        kind: "description",
        suggestion: { description: "Handles incident triage end to end." },
        analysis: "The old description was too vague.",
      });

      // The agent itself is untouched.
      const untouched = await getAgentConfiguration(authenticator, {
        agentId: agent.sId,
        variant: "light",
      });
      expect(untouched?.description).toBe("Old description.");
    });

    it("outdates every other pending description suggestion, leaving other kinds alone", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const deletion = await AgentSuggestionFactory.createDelete(
        authenticator,
        agent
      );
      const idOf = async (description: string) => {
        const result = await suggestDescription(authenticator, {
          agentId: agent.sId,
          description,
        });
        if (result.isErr() || result.value[0]?.type !== "text") {
          throw new Error("Expected the suggestion to be created.");
        }
        return extractAgentDescriptionSuggestionDirective(result.value[0].text)
          .suggestionId;
      };
      const stateOf = async (suggestionId: string) =>
        (await AgentSuggestionResource.fetchById(authenticator, suggestionId))
          ?.state;

      const firstId = await idOf("First description");
      const secondId = await idOf("Second description");

      expect(await stateOf(firstId)).toBe("outdated");
      expect(await stateOf(secondId)).toBe("pending");
      expect(await stateOf(deletion.sId)).toBe("pending");
    });

    it("rejects a caller who is not an editor, creating no row", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const outsider = await addMember(workspace);
      const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
        outsider.sId,
        workspace.sId
      );

      const result = await suggestDescription(outsiderAuth, {
        agentId: agent.sId,
        description: "Hijacked description.",
      });

      expectMcpError(
        result,
        "Only editors of this agent can change its description"
      );
      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agent.sId,
          { kind: "description" }
        );
      expect(suggestions).toHaveLength(0);
    });

    it("rejects an archived agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      await (await AgentResource.fetchById(authenticator, agent.sId))!.archive(
        authenticator
      );

      const result = await suggestDescription(authenticator, {
        agentId: agent.sId,
        description: "Revived description.",
      });

      expectMcpError(
        result,
        "Only active agents can have their description changed"
      );
    });
  });

  describe(SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME, () => {
    it("records a pending model suggestion and outdates previous ones", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const first = await getTool(SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME).handler(
        {
          agentId: agent.sId,
          modelId: "claude-sonnet-4-6",
          reasoningEffort: "high",
          analysis: "Better for complex tasks.",
        },
        makeExtra(
          authenticator,
          await createTestConversationModelId(authenticator)
        )
      );
      expect(first.isOk()).toBe(true);
      if (first.isErr()) {
        throw first.error;
      }
      const firstOutput = first.value[0];
      if (firstOutput?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const { suggestionId: firstId, agentId } =
        extractAgentModelSuggestionDirective(firstOutput.text);
      expect(agentId).toBe(agent.sId);

      const suggestion = await AgentSuggestionResource.fetchById(
        authenticator,
        firstId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.kind).toBe("model");
      expect(suggestion?.toJSON()).toMatchObject({
        suggestion: { modelId: "claude-sonnet-4-6", reasoningEffort: "high" },
        analysis: "Better for complex tasks.",
      });

      const second = await getTool(
        SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME
      ).handler(
        { agentId: agent.sId, modelId: "claude-sonnet-4-6" },
        makeExtra(
          authenticator,
          await createTestConversationModelId(authenticator)
        )
      );
      expect(second.isOk()).toBe(true);

      const previous = await AgentSuggestionResource.fetchById(
        authenticator,
        firstId
      );
      expect(previous?.state).toBe("outdated");
    });

    it("returns an MCPError without an interactive user", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const nonInteractiveAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const result = await getTool(
        SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME
      ).handler(
        { agentId: agent.sId, modelId: "claude-sonnet-4-6" },
        makeExtra(nonInteractiveAuth)
      );
      expectMcpError(result, "interactive user");
    });

    it("returns an MCPError for an unknown agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await getTool(
        SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME
      ).handler(
        { agentId: "unknown_agent", modelId: "claude-sonnet-4-6" },
        makeExtra(authenticator)
      );
      expectMcpError(result, "not found");
    });

    it("returns an MCPError when the caller is not an editor", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const other = await addMember(workspace);
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        other.sId,
        workspace.sId
      );

      const result = await getTool(
        SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME
      ).handler(
        { agentId: agent.sId, modelId: "claude-sonnet-4-6" },
        makeExtra(otherAuth)
      );
      expectMcpError(result, "Only editors");
    });

    it("returns an MCPError for an archived agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      await (await AgentResource.fetchById(authenticator, agent.sId))!.archive(
        authenticator
      );

      const result = await getTool(
        SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME
      ).handler(
        { agentId: agent.sId, modelId: "claude-sonnet-4-6" },
        makeExtra(authenticator)
      );
      expectMcpError(result, "active agents");
    });

    it("returns an MCPError for an unsupported reasoning effort", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // claude-sonnet-4-6 does not support reasoningEffort "none".
      const result = await getTool(
        SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME
      ).handler(
        {
          agentId: agent.sId,
          modelId: "claude-sonnet-4-6",
          reasoningEffort: "none",
        },
        makeExtra(authenticator)
      );
      expectMcpError(result, 'does not support the "none" reasoning effort');
    });

    it("returns an MCPError for a model not available in the workspace", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      // gpt-4o-mini is in SUPPORTED_MODEL_CONFIGS but not in USED_MODEL_CONFIGS.
      const result = await getTool(
        SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME
      ).handler(
        { agentId: agent.sId, modelId: "gpt-4o-mini" },
        makeExtra(authenticator)
      );
      expectMcpError(result, "Invalid model ID");
    });
  });

  describe(SUGGEST_AGENT_NAME_TOOL_NAME, () => {
    const suggestName = async (
      auth: Authenticator,
      args: { agentId: string; name: string; analysis?: string }
    ) =>
      getTool(SUGGEST_AGENT_NAME_TOOL_NAME).handler(
        args,
        makeExtra(auth, await createTestConversationModelId(auth))
      );

    it("records a pending suggestion with the name, without renaming", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "OldHelper" }
      );

      const result = await suggestName(authenticator, {
        agentId: agent.sId,
        name: "  IncidentHelper  ",
        analysis: "The agent only handles incidents.",
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      const output = result.value[0];
      if (output?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const { suggestionId, agentId } = extractAgentNameSuggestionDirective(
        output.text
      );
      expect(agentId).toBe(agent.sId);

      const suggestion = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestionId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.source).toBe("conversational");
      expect(suggestion?.toJSON()).toMatchObject({
        kind: "name",
        suggestion: { name: "IncidentHelper" },
        analysis: "The agent only handles incidents.",
      });

      // The agent itself is untouched.
      const untouched = await getAgentConfiguration(authenticator, {
        agentId: agent.sId,
        variant: "light",
      });
      expect(untouched?.name).toBe("OldHelper");
    });

    it("outdates every other pending rename, leaving other kinds alone", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "RenamedTwice" }
      );
      const deletion = await AgentSuggestionFactory.createDelete(
        authenticator,
        agent
      );
      const idOf = async (name: string) => {
        const result = await suggestName(authenticator, {
          agentId: agent.sId,
          name,
        });
        if (result.isErr() || result.value[0]?.type !== "text") {
          throw new Error("Expected the suggestion to be created.");
        }
        return extractAgentNameSuggestionDirective(result.value[0].text)
          .suggestionId;
      };
      const stateOf = async (suggestionId: string) =>
        (await AgentSuggestionResource.fetchById(authenticator, suggestionId))
          ?.state;

      const firstId = await idOf("FirstName");
      const secondId = await idOf("SecondName");

      expect(await stateOf(firstId)).toBe("outdated");
      expect(await stateOf(secondId)).toBe("pending");
      expect(await stateOf(deletion.sId)).toBe("pending");
    });

    it("rejects a caller who is not an editor, creating no row", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const outsider = await addMember(workspace);
      const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
        outsider.sId,
        workspace.sId
      );

      const result = await suggestName(outsiderAuth, {
        agentId: agent.sId,
        name: "Hijacked",
      });

      expectMcpError(result, "Only editors of this agent can rename it");
      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agent.sId,
          { kind: "name" }
        );
      expect(suggestions).toHaveLength(0);
    });

    it("rejects an archived agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      await (await AgentResource.fetchById(authenticator, agent.sId))!.archive(
        authenticator
      );

      const result = await suggestName(authenticator, {
        agentId: agent.sId,
        name: "Revived",
      });

      expectMcpError(result, "Only active agents can be renamed");
    });

    it("rejects the name of another active agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Mine" }
      );
      await AgentConfigurationFactory.createTestAgent(authenticator, {
        name: "Taken",
      });

      const result = await suggestName(authenticator, {
        agentId: agent.sId,
        name: "Taken",
      });

      expectMcpError(result, "already exists");
    });

    it("rejects a name containing spaces", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const result = await suggestName(authenticator, {
        agentId: agent.sId,
        name: "Incident Helper",
      });

      expectMcpError(result, "cannot contain spaces");
      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agent.sId,
          { kind: "name" }
        );
      expect(suggestions).toHaveLength(0);
    });
  });

  describe(SUGGEST_AGENT_PUBLISH_STATE_TOOL_NAME, () => {
    const suggestPublishState = async (
      auth: Authenticator,
      args: {
        agentId: string;
        scope: "hidden" | "visible";
        analysis?: string;
      }
    ) =>
      getTool(SUGGEST_AGENT_PUBLISH_STATE_TOOL_NAME).handler(
        args,
        makeExtra(auth, await createTestConversationModelId(auth))
      );

    it("records a pending suggestion with the publish state, without changing the agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "hidden" }
      );

      const result = await suggestPublishState(authenticator, {
        agentId: agent.sId,
        scope: "visible",
        analysis: "The agent is ready to be shared with the workspace.",
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      const output = result.value[0];
      if (output?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const { suggestionId, agentId } = extractAgentScopeSuggestionDirective(
        output.text
      );
      expect(agentId).toBe(agent.sId);

      const suggestion = await AgentSuggestionResource.fetchById(
        authenticator,
        suggestionId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.source).toBe("conversational");
      // Which conversation is asserted by the scoping test below.
      expect(suggestion?.conversationId).not.toBeNull();
      expect(suggestion?.toJSON()).toMatchObject({
        kind: "scope",
        suggestion: { scope: "visible" },
        analysis: "The agent is ready to be shared with the workspace.",
      });

      // The agent itself is untouched.
      const untouched = await getAgentConfiguration(authenticator, {
        agentId: agent.sId,
        variant: "light",
      });
      expect(untouched?.scope).toBe("hidden");
    });

    it("records the conversation it ran in, so suggestions can be scoped to it", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "hidden" }
      );

      const suggestIn = async (conversationModelId: ModelId) => {
        const result = await getTool(
          SUGGEST_AGENT_PUBLISH_STATE_TOOL_NAME
        ).handler(
          { agentId: agent.sId, scope: "visible" },
          makeExtra(authenticator, conversationModelId)
        );
        if (result.isErr() || result.value[0]?.type !== "text") {
          throw new Error("Expected the suggestion to be created.");
        }
        return extractAgentScopeSuggestionDirective(result.value[0].text)
          .suggestionId;
      };

      const firstConversationModelId =
        await createTestConversationModelId(authenticator);
      const secondConversationModelId =
        await createTestConversationModelId(authenticator);

      // The second call outdates the first, but both keep the conversation they were made in.
      const firstId = await suggestIn(firstConversationModelId);
      const secondId = await suggestIn(secondConversationModelId);

      const scoped = await AgentSuggestionResource.listByAgentConfigurationId(
        authenticator,
        agent.sId,
        { conversationModelId: secondConversationModelId }
      );
      expect(scoped.map((s) => s.sId)).toEqual([secondId]);
      expect(scoped.map((s) => s.sId)).not.toContain(firstId);
    });

    it("outdates every other pending publish state suggestion, leaving other kinds alone", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "hidden" }
      );
      const deletion = await AgentSuggestionFactory.createDelete(
        authenticator,
        agent
      );
      const idOf = async () => {
        const result = await suggestPublishState(authenticator, {
          agentId: agent.sId,
          scope: "visible",
        });
        if (result.isErr() || result.value[0]?.type !== "text") {
          throw new Error("Expected the suggestion to be created.");
        }
        return extractAgentScopeSuggestionDirective(result.value[0].text)
          .suggestionId;
      };
      const stateOf = async (suggestionId: string) =>
        (await AgentSuggestionResource.fetchById(authenticator, suggestionId))
          ?.state;

      const firstId = await idOf();
      const secondId = await idOf();

      expect(await stateOf(firstId)).toBe("outdated");
      expect(await stateOf(secondId)).toBe("pending");
      expect(await stateOf(deletion.sId)).toBe("pending");
    });

    it("rejects a caller who is not an editor, creating no row", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      // Scope defaults to "visible" so the outsider can still read (but not edit) the agent,
      // exercising the canEdit gate rather than the readability of a hidden agent.
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      const outsider = await addMember(workspace);
      const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
        outsider.sId,
        workspace.sId
      );

      const result = await suggestPublishState(outsiderAuth, {
        agentId: agent.sId,
        scope: "hidden",
      });

      expectMcpError(
        result,
        "Only editors of this agent can change its publish state"
      );
      const suggestions =
        await AgentSuggestionResource.listByAgentConfigurationId(
          authenticator,
          agent.sId,
          { kind: "scope" }
        );
      expect(suggestions).toHaveLength(0);
    });

    it("rejects an archived agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "hidden" }
      );
      await (await AgentResource.fetchById(authenticator, agent.sId))!.archive(
        authenticator
      );

      const result = await suggestPublishState(authenticator, {
        agentId: agent.sId,
        scope: "visible",
      });

      expectMcpError(
        result,
        "Only active agents can have their publish state changed"
      );
    });

    it("rejects a publish state matching the agent's current one", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { scope: "hidden" }
      );

      const result = await suggestPublishState(authenticator, {
        agentId: agent.sId,
        scope: "hidden",
      });

      expectMcpError(result, "already unpublished");
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
      expect(result.value[0].text).toContain('data-block-id="block1"');
      expect(result.value[0].text).toContain(
        "required to target block-level instruction edits"
      );
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
      expect(result.value[0].text).toContain(
        "Instructions, skills and tools are private"
      );
      expect(result.value[0].text).not.toContain("Test Instructions");
    });
  });

  describe(SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME, () => {
    const BLOCK_STRUCTURED_INSTRUCTIONS_HTML =
      '<div data-block-id="instructions-root">' +
      '<p data-block-id="block1">You are a helpful assistant.</p>' +
      "</div>";

    async function createBlockStructuredAgent(authenticator: Authenticator) {
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);
      return AgentConfigurationFactory.updateTestAgent(
        authenticator,
        agent.sId,
        { instructionsHtml: BLOCK_STRUCTURED_INSTRUCTIONS_HTML }
      );
    }

    it("records pending instructions suggestions and prunes conflicting ones", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await createBlockStructuredAgent(authenticator);

      const first = await getTool(
        SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME
      ).handler(
        {
          agentId: agent.sId,
          instructionEdit: {
            targetBlockId: "block1",
            type: "replace",
            content: "<p>You are a concise, helpful assistant.</p>",
          },
          analysis: "Makes the assistant more concise.",
        },
        makeExtra(
          authenticator,
          await createTestConversationModelId(authenticator)
        )
      );
      expect(first.isOk()).toBe(true);
      if (first.isErr()) {
        throw first.error;
      }
      const firstOutput = first.value[0];
      if (firstOutput?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const [firstDirective] = extractAgentInstructionsSuggestionDirectives(
        firstOutput.text
      );
      expect(firstDirective.agentId).toBe(agent.sId);

      const suggestion = await AgentSuggestionResource.fetchById(
        authenticator,
        firstDirective.suggestionId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.kind).toBe("instructions");
      expect(suggestion?.source).toBe("conversational");
      expect(suggestion?.toJSON()).toMatchObject({
        suggestion: {
          targetBlockId: "block1",
          type: "replace",
          content: "<p>You are a concise, helpful assistant.</p>",
        },
        analysis: "Makes the assistant more concise.",
      });

      // A second suggestion targeting the same block outdates the first one.
      const second = await getTool(
        SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME
      ).handler(
        {
          agentId: agent.sId,
          instructionEdit: {
            targetBlockId: "block1",
            type: "replace",
            content: "<p>You are a friendly assistant.</p>",
          },
        },
        makeExtra(
          authenticator,
          await createTestConversationModelId(authenticator)
        )
      );
      expect(second.isOk()).toBe(true);

      const previous = await AgentSuggestionResource.fetchById(
        authenticator,
        firstDirective.suggestionId
      );
      expect(previous?.state).toBe("outdated");
    });

    it("returns an MCPError without an interactive user", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const agent = await createBlockStructuredAgent(authenticator);
      const nonInteractiveAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const result = await getTool(
        SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME
      ).handler(
        {
          agentId: agent.sId,
          instructionEdit: {
            targetBlockId: "block1",
            type: "replace",
            content: "<p>Hi.</p>",
          },
        },
        makeExtra(nonInteractiveAuth)
      );
      expectMcpError(result, "interactive user");
    });

    it("returns an MCPError for an unknown agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await getTool(
        SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME
      ).handler(
        {
          agentId: "unknown_agent",
          instructionEdit: {
            targetBlockId: "block1",
            type: "replace",
            content: "<p>Hi.</p>",
          },
        },
        makeExtra(authenticator)
      );
      expectMcpError(result, "not found");
    });

    it("returns an MCPError when the caller is not an editor", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const agent = await createBlockStructuredAgent(authenticator);
      const other = await addMember(workspace);
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        other.sId,
        workspace.sId
      );

      const result = await getTool(
        SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME
      ).handler(
        {
          agentId: agent.sId,
          instructionEdit: {
            targetBlockId: "block1",
            type: "replace",
            content: "<p>Hi.</p>",
          },
        },
        makeExtra(otherAuth)
      );
      expectMcpError(result, "Only editors");
    });

    it("returns an MCPError for an archived agent", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await createBlockStructuredAgent(authenticator);
      await (await AgentResource.fetchById(authenticator, agent.sId))!.archive(
        authenticator
      );

      const result = await getTool(
        SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME
      ).handler(
        {
          agentId: agent.sId,
          instructionEdit: {
            targetBlockId: "block1",
            type: "replace",
            content: "<p>Hi.</p>",
          },
        },
        makeExtra(authenticator)
      );
      expectMcpError(result, "active agents");
    });

    it("returns an MCPError when the agent has no block-structured instructions", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent =
        await AgentConfigurationFactory.createTestAgent(authenticator);

      const result = await getTool(
        SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME
      ).handler(
        {
          agentId: agent.sId,
          instructionEdit: {
            targetBlockId: "block1",
            type: "replace",
            content: "<p>Hi.</p>",
          },
        },
        makeExtra(authenticator)
      );
      expectMcpError(result, "no block-structured instructions");
    });

    it("returns an MCPError when exceeding the pending suggestions limit", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const agent = await createBlockStructuredAgent(authenticator);

      for (let i = 0; i < MAX_PENDING_INSTRUCTIONS_SUGGESTIONS; i++) {
        await AgentSuggestionFactory.createInstructions(authenticator, agent, {
          suggestion: {
            content: `<p>Edit ${i}.</p>`,
            targetBlockId: `block${i}`,
            type: "replace",
          },
          state: "pending",
          source: "conversational",
        });
      }

      const result = await getTool(
        SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME
      ).handler(
        {
          agentId: agent.sId,
          instructionEdit: {
            targetBlockId: "block1",
            type: "replace",
            content: "<p>A.</p>",
          },
        },
        makeExtra(authenticator)
      );
      expectMcpError(result, "exceed the limit");
    });
  });

  describe(SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME, () => {
    it("creates a pending conversational suggestion without touching the skill", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "Described For Users",
        userFacingDescription: "Formats notes.",
      });

      const result = await getTool(
        SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME
      ).handler(
        {
          skillId: skill.sId,
          userFacingDescription:
            "Paste notes, get a summary with action items.",
          analysis: "Members should know what they get back.",
          title: "Clarify description",
        },
        makeExtra(authenticator)
      );

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      if (result.value[0]?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const suggestionId = extractSuggestionId(
        result.value[0].text,
        "user_facing_description"
      );

      const suggestion = await SkillSuggestionResource.fetchById(
        authenticator,
        suggestionId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.source).toBe("conversational");
      expect(suggestion?.kind).toBe("user_facing_description");
      expect(suggestion?.title).toBe("Clarify description");
      expect(suggestion?.toJSON()).toMatchObject({
        kind: "user_facing_description",
        suggestion: {
          userFacingDescription:
            "Paste notes, get a summary with action items.",
        },
      });

      const reloaded = await SkillResource.fetchById(authenticator, skill.sId);
      expect(reloaded?.userFacingDescription).toBe("Formats notes.");
    });

    it("outdates every other pending description suggestion, leaving edit suggestions alone", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Conflicting" });
      const edit = await SkillSuggestionFactory.createEdit(
        authenticator,
        skill,
        { source: "conversational" }
      );

      const suggest = async (userFacingDescription: string) => {
        const result = await getTool(
          SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME
        ).handler(
          { skillId: skill.sId, userFacingDescription },
          makeExtra(authenticator)
        );
        if (result.isErr() || result.value[0]?.type !== "text") {
          throw new Error("Expected the suggestion to be created.");
        }
        return extractSuggestionId(
          result.value[0].text,
          "user_facing_description"
        );
      };
      const stateOf = async (suggestionId: string) =>
        (await SkillSuggestionResource.fetchById(authenticator, suggestionId))
          ?.state;

      const firstId = await suggest("First wording.");
      const secondId = await suggest("Second wording.");

      expect(await stateOf(firstId)).toBe("outdated");
      expect(await stateOf(secondId)).toBe("pending");
      expect(await stateOf(edit.sId)).toBe("pending");
    });

    it("rejects a caller who is not an editor, creating no row", async () => {
      const { authenticator: ownerAuth, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(ownerAuth, { name: "Not Mine" });
      const outsider = await addMember(workspace);
      const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
        outsider.sId,
        workspace.sId
      );

      const result = await getTool(
        SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME
      ).handler(
        { skillId: skill.sId, userFacingDescription: "Anything." },
        makeExtra(outsiderAuth)
      );

      expectMcpError(result, "added as an editor");
      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          ownerAuth,
          skill.sId,
          { sources: ["conversational"] }
        );
      expect(suggestions).toHaveLength(0);
    });

    it("rejects an archived skill", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "Archived",
        status: "archived",
      });

      const result = await getTool(
        SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME
      ).handler(
        { skillId: skill.sId, userFacingDescription: "Anything." },
        makeExtra(authenticator)
      );

      expectMcpError(result, "archived");
    });

    it("rejects a skill id that is not a custom skill", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await getTool(
        SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME
      ).handler(
        { skillId: "not_a_skill", userFacingDescription: "Anything." },
        makeExtra(authenticator)
      );

      expectMcpError(result, "Only custom workspace skills");
    });

    it("rejects an empty description", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Empty" });

      const result = await getTool(
        SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME
      ).handler(
        { skillId: skill.sId, userFacingDescription: "" },
        makeExtra(authenticator)
      );

      expectMcpError(result, "non-empty");
    });

    it("rejects a description longer than the column allows", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Too Long" });

      const result = await getTool(
        SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME
      ).handler(
        {
          skillId: skill.sId,
          userFacingDescription: "a".repeat(
            USER_FACING_DESCRIPTION_MAX_LENGTH + 1
          ),
        },
        makeExtra(authenticator)
      );

      expectMcpError(result, `at most ${USER_FACING_DESCRIPTION_MAX_LENGTH}`);
    });
  });

  describe(SUGGEST_SKILL_NAME_TOOL_NAME, () => {
    const suggestName = async (
      auth: Authenticator,
      args: { skillId: string; name: string; title?: string }
    ) => getTool(SUGGEST_SKILL_NAME_TOOL_NAME).handler(args, makeExtra(auth));

    it("creates a pending conversational suggestion with the trimmed name, without renaming", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Old Name" });

      const result = await suggestName(authenticator, {
        skillId: skill.sId,
        name: "  New Name  ",
        title: "Rename skill",
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      if (result.value[0]?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const suggestionId = extractSuggestionId(result.value[0].text, "name");

      const suggestion = await SkillSuggestionResource.fetchById(
        authenticator,
        suggestionId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.source).toBe("conversational");
      expect(suggestion?.title).toBe("Rename skill");
      expect(suggestion?.toJSON()).toMatchObject({
        kind: "name",
        suggestion: { name: "New Name" },
      });

      const reloaded = await SkillResource.fetchById(authenticator, skill.sId);
      expect(reloaded?.name).toBe("Old Name");
    });

    it("outdates every other pending rename, leaving other kinds alone", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Renamed Twice" });
      const edit = await SkillSuggestionFactory.createEdit(
        authenticator,
        skill,
        { source: "conversational" }
      );
      const idOf = async (name: string) => {
        const result = await suggestName(authenticator, {
          skillId: skill.sId,
          name,
        });
        if (result.isErr() || result.value[0]?.type !== "text") {
          throw new Error("Expected the suggestion to be created.");
        }
        return extractSuggestionId(result.value[0].text, "name");
      };
      const stateOf = async (suggestionId: string) =>
        (await SkillSuggestionResource.fetchById(authenticator, suggestionId))
          ?.state;

      const firstId = await idOf("First Name");
      const secondId = await idOf("Second Name");

      expect(await stateOf(firstId)).toBe("outdated");
      expect(await stateOf(secondId)).toBe("pending");
      expect(await stateOf(edit.sId)).toBe("pending");
    });

    it("rejects a caller who is not an editor, creating no row", async () => {
      const { authenticator: ownerAuth, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(ownerAuth, { name: "Not Mine" });
      const outsider = await addMember(workspace);
      const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
        outsider.sId,
        workspace.sId
      );

      const result = await suggestName(outsiderAuth, {
        skillId: skill.sId,
        name: "Hijacked",
      });

      expectMcpError(result, "Only editors of this skill can rename it");
      const suggestions =
        await SkillSuggestionResource.listBySkillConfigurationId(
          ownerAuth,
          skill.sId,
          { sources: ["conversational"] }
        );
      expect(suggestions).toHaveLength(0);
    });

    it("rejects an archived skill", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "Archived",
        status: "archived",
      });

      const result = await suggestName(authenticator, {
        skillId: skill.sId,
        name: "Revived",
      });

      expectMcpError(result, "archived");
    });

    it("rejects a skill id that is not a custom skill", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });

      const result = await suggestName(authenticator, {
        skillId: "not_a_skill",
        name: "Anything",
      });

      expectMcpError(result, "Only custom workspace skills");
    });

    it("rejects a blank name", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Blank" });

      const result = await suggestName(authenticator, {
        skillId: skill.sId,
        name: "   ",
      });

      expectMcpError(result, "cannot be empty");
    });

    it("rejects a name over the maximum length", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Too Long" });

      const result = await suggestName(authenticator, {
        skillId: skill.sId,
        name: "a".repeat(SKILL_NAME_MAX_LENGTH + 1),
      });

      expectMcpError(result, `at most ${SKILL_NAME_MAX_LENGTH}`);
    });

    it("rejects the skill's current name", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Same Name" });

      const result = await suggestName(authenticator, {
        skillId: skill.sId,
        name: "Same Name",
      });

      expectMcpError(result, "already named");
    });

    it("rejects the name of another active skill, even one the caller cannot read", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(authenticator, { name: "Mine" });
      const other = await addMember(workspace);
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        other.sId,
        workspace.sId
      );
      await SkillFactory.create(otherAuth, {
        name: "Hidden Homonym",
        availability: "editors",
      });

      const result = await suggestName(authenticator, {
        skillId: skill.sId,
        name: "Hidden Homonym",
      });

      expectMcpError(result, "already exists");
    });
  });

  describe(SUGGEST_SKILL_DELETION_TOOL_NAME, () => {
    it("records a pending delete suggestion and outdates previous ones", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Old Skill" });

      const first = await getTool(SUGGEST_SKILL_DELETION_TOOL_NAME).handler(
        { skillId: skill.sId, analysis: "Unused for months." },
        makeExtra(authenticator)
      );
      expect(first.isOk()).toBe(true);
      if (first.isErr()) {
        throw first.error;
      }
      const firstOutput = first.value[0];
      if (firstOutput?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const { suggestionId: firstId, skillId } = extractDirective(
        firstOutput.text,
        "delete"
      );
      expect(skillId).toBe(skill.sId);

      const suggestion = await SkillSuggestionResource.fetchById(
        authenticator,
        firstId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.kind).toBe("delete");
      expect(suggestion?.source).toBe("conversational");
      expect(suggestion?.toJSON()).toMatchObject({
        suggestion: {},
        analysis: "Unused for months.",
      });

      // The skill itself is untouched.
      const untouched = await SkillResource.fetchById(authenticator, skill.sId);
      expect(untouched?.status).toBe("active");

      const second = await getTool(SUGGEST_SKILL_DELETION_TOOL_NAME).handler(
        { skillId: skill.sId },
        makeExtra(authenticator)
      );
      expect(second.isOk()).toBe(true);

      const previous = await SkillSuggestionResource.fetchById(
        authenticator,
        firstId
      );
      expect(previous?.state).toBe("outdated");
    });

    it("returns an MCPError without an interactive user", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(authenticator, { name: "No User" });
      const nonInteractiveAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const result = await getTool(SUGGEST_SKILL_DELETION_TOOL_NAME).handler(
        { skillId: skill.sId },
        makeExtra(nonInteractiveAuth)
      );
      expectMcpError(result, "interactive user");
    });

    it("returns an MCPError for an unknown skill", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const unknownSkillId = SkillResource.modelIdToSId({
        id: 999_999_999,
        workspaceId: workspace.id,
      });

      const result = await getTool(SUGGEST_SKILL_DELETION_TOOL_NAME).handler(
        { skillId: unknownSkillId },
        makeExtra(authenticator)
      );
      expectMcpError(result, "not found");
    });

    it("returns an MCPError when the caller is neither an editor nor an admin", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(authenticator, { name: "Not Mine" });
      const other = await addMember(workspace);
      const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        other.sId,
        workspace.sId
      );

      const result = await getTool(SUGGEST_SKILL_DELETION_TOOL_NAME).handler(
        { skillId: skill.sId },
        makeExtra(otherAuth)
      );
      expectMcpError(result, "editors of this skill or workspace admins");
    });

    it("allows a workspace admin who is not an editor to create a delete suggestion", async () => {
      const { authenticator, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(authenticator, { name: "Admin Only" });
      const admin = await addMember(workspace, "admin");
      const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        admin.sId,
        workspace.sId
      );

      const result = await getTool(SUGGEST_SKILL_DELETION_TOOL_NAME).handler(
        { skillId: skill.sId },
        makeExtra(adminAuth)
      );
      expect(result.isOk()).toBe(true);
    });

    it("returns an MCPError for an archived skill", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, {
        name: "Archived",
        status: "archived",
      });

      const result = await getTool(SUGGEST_SKILL_DELETION_TOOL_NAME).handler(
        { skillId: skill.sId },
        makeExtra(authenticator)
      );
      expectMcpError(result, "active skills");
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
  });

  describe(SUGGEST_SKILL_AVAILABILITY_TOOL_NAME, () => {
    const suggestAvailability = async (
      auth: Authenticator,
      args: {
        skillId: string;
        availability: "editors" | "workspace_users" | "users_and_agents";
        title?: string;
      }
    ) =>
      getTool(SUGGEST_SKILL_AVAILABILITY_TOOL_NAME).handler(
        args,
        makeExtra(auth)
      );

    it("creates a pending conversational suggestion without changing the availability", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      const skill = await seedSkill(authenticator, {
        name: "Published",
        availability: "users_and_agents",
      });

      const result = await suggestAvailability(authenticator, {
        skillId: skill.sId,
        availability: "workspace_users",
        title: "Members only",
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        throw result.error;
      }
      if (result.value[0]?.type !== "text") {
        throw new Error("Expected text output.");
      }
      const suggestionId = extractSuggestionId(
        result.value[0].text,
        "availability"
      );

      const suggestion = await SkillSuggestionResource.fetchById(
        authenticator,
        suggestionId
      );
      expect(suggestion?.state).toBe("pending");
      expect(suggestion?.source).toBe("conversational");
      expect(suggestion?.title).toBe("Members only");
      expect(suggestion?.toJSON()).toMatchObject({
        kind: "availability",
        suggestion: { availability: "workspace_users" },
      });

      const reloaded = await SkillResource.fetchById(authenticator, skill.sId);
      expect(reloaded?.availability).toBe("users_and_agents");
    });

    it("outdates every other pending availability suggestion, leaving other kinds alone", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      const skill = await seedSkill(authenticator, { name: "Conflicting" });
      const edit = await SkillSuggestionFactory.createEdit(
        authenticator,
        skill,
        { source: "conversational" }
      );
      const idOf = async (
        availability: "workspace_users" | "users_and_agents"
      ) => {
        const result = await suggestAvailability(authenticator, {
          skillId: skill.sId,
          availability,
        });
        if (result.isErr() || result.value[0]?.type !== "text") {
          throw new Error("Expected the suggestion to be created.");
        }
        return extractSuggestionId(result.value[0].text, "availability");
      };
      const stateOf = async (suggestionId: string) =>
        (await SkillSuggestionResource.fetchById(authenticator, suggestionId))
          ?.state;

      const firstId = await idOf("workspace_users");
      const secondId = await idOf("users_and_agents");

      expect(await stateOf(firstId)).toBe("outdated");
      expect(await stateOf(secondId)).toBe("pending");
      expect(await stateOf(edit.sId)).toBe("pending");
    });

    it("allows a workspace admin who is not an editor to suggest an availability change", async () => {
      const { authenticator: ownerAuth, workspace } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(ownerAuth, { name: "Not Mine" });
      const admin = await addMember(workspace, "admin");
      const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
        admin.sId,
        workspace.sId
      );

      const result = await suggestAvailability(adminAuth, {
        skillId: skill.sId,
        availability: "workspace_users",
      });

      expect(result.isOk()).toBe(true);
    });

    it("rejects an archived skill", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      const skill = await seedSkill(authenticator, {
        name: "Archived",
        status: "archived",
      });

      const result = await suggestAvailability(authenticator, {
        skillId: skill.sId,
        availability: "workspace_users",
      });

      expectMcpError(result, "archived");
    });

    it("rejects a skill id that is not a custom skill", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });

      const result = await suggestAvailability(authenticator, {
        skillId: "not_a_skill",
        availability: "workspace_users",
      });

      expectMcpError(result, "Only custom workspace skills");
    });

    it("rejects the skill's current availability", async () => {
      const { authenticator } = await createResourceTest({ role: "admin" });
      const skill = await seedSkill(authenticator, {
        name: "Unchanged",
        availability: "workspace_users",
      });

      const result = await suggestAvailability(authenticator, {
        skillId: skill.sId,
        availability: "workspace_users",
      });

      expectMcpError(result, "already");
    });

    it("rejects an editor without the publish capability", async () => {
      const { authenticator } = await createResourceTest({ role: "user" });
      const skill = await seedSkill(authenticator, { name: "Unpublished" });

      const result = await suggestAvailability(authenticator, {
        skillId: skill.sId,
        availability: "workspace_users",
      });

      expectMcpError(result, "change this skill's availability");
    });

    it("rejects making a skill auto-discoverable without the make_discoverable capability", async () => {
      const { authenticator, workspace, user } = await createResourceTest({
        role: "user",
      });
      const skill = await seedSkill(authenticator, { name: "Publishable" });
      await grantWorkspacePermission(workspace, user, {
        grantType: "publish",
        resourceType: "skill",
      });
      await authenticator.refresh();

      const result = await suggestAvailability(authenticator, {
        skillId: skill.sId,
        availability: "users_and_agents",
      });

      expectMcpError(result, "auto-discoverable");
    });
  });
});
