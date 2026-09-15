import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DESCRIBE_SKILL_TOOL_NAME,
  SUGGEST_SKILL_UPDATE_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { describe, expect, it } from "vitest";

import { TOOLS } from "./index";

const SKILL_SUGGESTION_DIRECTIVE_REGEX =
  /^:skill_suggestion\[\]\{sId=(\S+) kind=edit\}$/;

function getTool(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  return tool;
}

// The tool never reads runContext, so a partial extra cast to ToolHandlerExtra is sufficient
// (mirroring skill_authoring).
function makeExtra(auth: Authenticator) {
  const extra: Pick<
    ToolHandlerExtra,
    "auth" | "requestId" | "sendNotification" | "sendRequest" | "signal"
  > = {
    auth,
    requestId: "test-request",
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error(
        "Unexpected MCP request in building_agents_and_skills test."
      );
    },
    signal: new AbortController().signal,
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

function extractSuggestionId(text: string): string {
  const match = SKILL_SUGGESTION_DIRECTIVE_REGEX.exec(text);
  if (!match) {
    throw new Error(`Unexpected tool output: ${text}`);
  }
  return match[1];
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
      const suggestionId = extractSuggestionId(output.text);

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
      expect(suggestion?.sourceConversationIds).toBeNull();
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
  });
});
