import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  DESCRIBE_SKILL_TOOL_NAME,
  SUGGEST_SKILL_EDITORS_TOOL_NAME,
  SUGGEST_SKILL_UPDATE_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SkillSuggestionFactory } from "@app/tests/utils/SkillSuggestionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { SKILL_SUGGESTION_KINDS } from "@app/types/suggestions/skill_suggestion";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

import { TOOLS } from "./index";

const SKILL_SUGGESTION_DIRECTIVE_REGEX = new RegExp(
  `^:skill_suggestion\\[\\]\\{sId=(\\S+) kind=(${SKILL_SUGGESTION_KINDS.join("|")}) skillId=(\\S+)\\}$`
);

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
});
