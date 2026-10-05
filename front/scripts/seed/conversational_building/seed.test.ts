import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import {
  BATCH_CONVERSATION_SID,
  CONVERSATION_SID,
  LUKE_USER_SID,
  SKILL_NAME,
  seedConversationalBuilding,
} from "@app/scripts/seed/conversational_building/seedConversationalBuilding";
import type { SeedContext } from "@app/scripts/seed/factories";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { isEditSkillSuggestion } from "@app/types/suggestions/skill_suggestion";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

async function getConversationAgentText(
  auth: Authenticator,
  conversation: ConversationResource
): Promise<{ text: string; agentMessageIds: number[] }> {
  const { messages } = await conversation.fetchMessagesForPage(auth, {
    limit: 100,
  });
  const agentMessageIds = messages
    .filter((m) => m.agentMessage)
    .map((m) => m.agentMessage!.id);
  const contents = await AgentStepContentResource.fetchByAgentMessages(auth, {
    agentMessageIds,
  });
  const text = contents
    .map((c) => (c.value.type === "text_content" ? c.value.value : ""))
    .join("\n");
  return { text, agentMessageIds };
}

describe("conversational building seed script integration test", () => {
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let authenticator: Authenticator;

  beforeEach(async () => {
    const testResources = await createResourceTest({ role: "admin" });
    workspace = testResources.workspace;
    user = testResources.user;
    authenticator = testResources.authenticator;
  });

  it("seeds the skill, its suggestions and the conversation, and outdates them on re-run", async () => {
    const ctx: SeedContext = {
      auth: authenticator,
      workspace,
      user,
      execute: true,
      logger,
    };

    const {
      users,
      skills,
      skillSuggestions,
      toolView,
      knowledgeView,
      conversationSIds,
    } = await seedConversationalBuilding(ctx);

    // Users carry their asset sId so the editors suggestion references them directly.
    expect(users.size).toBe(2);
    expect(users.get(LUKE_USER_SID)!.sId).toBe(LUKE_USER_SID);
    expect(users.get("SeedUserLeila")!.sId).toBe("SeedUserLeila");

    // Skill owned by the main user with Luke as editor.
    const skill = skills.get(SKILL_NAME);
    expect(skill).toBeDefined();
    const editors = await skill!.listEditors(authenticator);
    expect(editors?.map((e) => e.sId).toSorted()).toEqual(
      [user.sId, LUKE_USER_SID].toSorted()
    );

    // Nine pending conversational suggestions.
    expect(skillSuggestions.size).toBe(9);
    const listed = await SkillSuggestionResource.listBySkillConfigurationId(
      authenticator,
      skill!.sId,
      { sources: ["conversational"] }
    );
    expect(listed.map((s) => s.toJSON().kind).toSorted()).toEqual([
      "availability",
      "delete",
      "edit",
      "edit",
      "edit",
      "edit",
      "editors",
      "name",
      "user_facing_description",
    ]);
    expect(listed.every((s) => s.toJSON().state === "pending")).toBe(true);

    // The tool edit references the seeded Team Calendar tool's global-space view.
    expect(toolView).not.toBeNull();
    const toolSuggestion = skillSuggestions.get("skillEditTool")!;
    expect(isEditSkillSuggestion(toolSuggestion)).toBe(true);
    if (isEditSkillSuggestion(toolSuggestion)) {
      expect(toolSuggestion.suggestion.instructionEdits![0].content).toContain(
        `<tool id="${toolView!.sId}" name="Team Calendar" />`
      );
    }

    // The knowledge edit references the seeded data source view when CoreAPI created it.
    const knowledgeSuggestion = skillSuggestions.get("skillEditKnowledge")!;
    expect(isEditSkillSuggestion(knowledgeSuggestion)).toBe(true);
    if (isEditSkillSuggestion(knowledgeSuggestion) && knowledgeView) {
      const content =
        knowledgeSuggestion.suggestion.instructionEdits![0].content;
      expect(content).toContain(`dsv="${knowledgeView.sId}"`);
      expect(content).toContain(`space="${knowledgeView.space.sId}"`);
    }

    const editorsSuggestion = skillSuggestions.get("skillEditors")!.toJSON();
    expect(editorsSuggestion.kind).toBe("editors");
    if (editorsSuggestion.kind === "editors") {
      expect(editorsSuggestion.suggestion.addUserIds).toEqual([
        "SeedUserLeila",
      ]);
      expect(editorsSuggestion.suggestion.removeUserIds).toEqual([
        LUKE_USER_SID,
      ]);
    }

    const descriptionSuggestion = skillSuggestions
      .get("skillUserFacingDescription")!
      .toJSON();
    expect(descriptionSuggestion.kind).toBe("user_facing_description");
    if (descriptionSuggestion.kind === "user_facing_description") {
      expect(descriptionSuggestion.suggestion.userFacingDescription).toContain(
        "Paste raw meeting notes"
      );
    }

    const nameSuggestion = skillSuggestions.get("skillName")!.toJSON();
    expect(nameSuggestion.kind).toBe("name");
    if (nameSuggestion.kind === "name") {
      expect(nameSuggestion.suggestion.name).toBe("MeetingSummarizer");
    }

    const deleteSuggestion = skillSuggestions.get("skillDelete")!.toJSON();
    expect(deleteSuggestion.kind).toBe("delete");

    const availabilitySuggestion = skillSuggestions
      .get("skillAvailability")!
      .toJSON();
    expect(availabilitySuggestion.kind).toBe("availability");
    if (availabilitySuggestion.kind === "availability") {
      expect(availabilitySuggestion.suggestion.availability).toBe(
        "workspace_users"
      );
    }

    // The conversation embeds each suggestion as a directive, with no leftover placeholder.
    const conversation = await ConversationResource.fetchById(
      authenticator,
      conversationSIds.get(CONVERSATION_SID)!
    );
    expect(conversation).toBeDefined();
    const { text, agentMessageIds } = await getConversationAgentText(
      authenticator,
      conversation!
    );
    expect(agentMessageIds).toHaveLength(7);
    expect(text).not.toContain("__");
    for (const suggestion of skillSuggestions.values()) {
      expect(text).toContain(
        `:skill_suggestion[]{sId=${suggestion.sId} kind=${suggestion.kind} skillId=${skill!.sId}}`
      );
    }

    // Re-run: users, skill and tool are kept, new suggestions outdate the previous ones and a new
    // conversation is created.
    const rerun = await seedConversationalBuilding(ctx);
    expect(rerun.skills.get(SKILL_NAME)!.sId).toBe(skill!.sId);
    expect(rerun.toolView!.sId).toBe(toolView!.sId);
    expect(rerun.skillSuggestions.size).toBe(9);
    for (const [id, suggestion] of skillSuggestions) {
      expect(rerun.skillSuggestions.get(id)!.sId).not.toBe(suggestion.sId);
    }
    const rerunListed =
      await SkillSuggestionResource.listBySkillConfigurationId(
        authenticator,
        skill!.sId,
        { sources: ["conversational"] }
      );
    expect(
      rerunListed
        .filter((s) => s.toJSON().state === "pending")
        .map((s) => s.sId)
        .toSorted()
    ).toEqual(
      [...rerun.skillSuggestions.values()].map((s) => s.sId).toSorted()
    );
    expect(
      rerunListed
        .filter((s) => s.toJSON().state === "outdated")
        .map((s) => s.sId)
        .toSorted()
    ).toEqual([...skillSuggestions.values()].map((s) => s.sId).toSorted());

    const rerunConversation = await ConversationResource.fetchById(
      authenticator,
      rerun.conversationSIds.get(CONVERSATION_SID)!
    );
    expect(rerunConversation!.id).not.toBe(conversation!.id);
    const { text: rerunText } = await getConversationAgentText(
      authenticator,
      rerunConversation!
    );
    for (const suggestion of rerun.skillSuggestions.values()) {
      expect(rerunText).toContain(`sId=${suggestion.sId} `);
    }
    // The previous conversation is kept.
    expect(
      await AgentStepContentResource.fetchByAgentMessages(authenticator, {
        agentMessageIds,
      })
    ).toHaveLength(7);
  });

  it("seeds the suggestion batches, the skill creation and the conversation piling them", async () => {
    const ctx: SeedContext = {
      auth: authenticator,
      workspace,
      user,
      execute: true,
      logger,
    };

    const {
      suggestionBatches,
      batchSkillSuggestions,
      pendingSkills,
      conversationSIds,
    } = await seedConversationalBuilding(ctx);

    const pendingSkill = pendingSkills.get("ActionItemTracker");
    expect(pendingSkill?.status).toBe("pending");

    const creation = batchSkillSuggestions
      .get("batchCreateActionItemTracker")!
      .toJSON();
    expect(creation.kind).toBe("create");
    expect(creation.skillConfigurationId).toBe(pendingSkill!.sId);

    const handOver = batchSkillSuggestions.get("batchEditHandOverActionItems")!;
    expect(isEditSkillSuggestion(handOver)).toBe(true);
    if (isEditSkillSuggestion(handOver)) {
      expect(handOver.suggestion.instructionEdits![0].content).toContain(
        `<skill id="${pendingSkill!.sId}" name="ActionItemTracker" />`
      );
    }

    const batches = await BatchSuggestionResource.fetchByIds(
      authenticator,
      [...suggestionBatches.values()].map((b) => b.sId)
    );
    expect(
      batches
        .map((b) => [
          b.title,
          b.skillSuggestions.map((s) => s.toJSON().kind).toSorted(),
        ])
        .toSorted()
    ).toEqual([
      ["Group action items by owner", ["edit"]],
      ["Keep it for members only", ["availability"]],
      ["Rename to TeamDigest", ["name", "user_facing_description"]],
      ["Track action items in their own skill", ["create", "edit"]],
    ]);

    const conversation = await ConversationResource.fetchById(
      authenticator,
      conversationSIds.get(BATCH_CONVERSATION_SID)!
    );
    const { text, agentMessageIds } = await getConversationAgentText(
      authenticator,
      conversation!
    );
    expect(agentMessageIds).toHaveLength(2);
    expect(text).not.toContain("__");
    expect(text).toContain(":suggestion_recap[");
    for (const batch of suggestionBatches.values()) {
      expect(text).toContain(`:batch_edit[]{sId=${batch.sId}}`);
    }

    const rerun = await seedConversationalBuilding(ctx);
    const previousBatches = await BatchSuggestionResource.fetchByIds(
      authenticator,
      [...suggestionBatches.values()].map((b) => b.sId)
    );
    expect(previousBatches.map((b) => b.state)).toEqual([
      "outdated",
      "outdated",
      "outdated",
      "outdated",
    ]);
    const rerunBatches = await BatchSuggestionResource.fetchByIds(
      authenticator,
      [...rerun.suggestionBatches.values()].map((b) => b.sId)
    );
    expect(rerunBatches.map((b) => b.state)).toEqual([
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });
});
