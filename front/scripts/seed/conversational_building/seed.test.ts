import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import {
  CONVERSATION_SID,
  LUKE_USER_SID,
  seedConversationalBuilding,
  SKILL_NAME,
} from "@app/scripts/seed/conversational_building/seedConversationalBuilding";
import type { SeedContext } from "@app/scripts/seed/factories";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
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

  it("seeds the skill, its suggestions and the conversation, and recreates them on re-run", async () => {
    const ctx: SeedContext = {
      auth: authenticator,
      workspace,
      user,
      execute: true,
      logger,
    };

    const { users, skills, skillSuggestions } =
      await seedConversationalBuilding(ctx);

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

    // Three pending conversational suggestions.
    expect(skillSuggestions.size).toBe(3);
    const listed = await SkillSuggestionResource.listBySkillConfigurationId(
      authenticator,
      skill!.sId,
      { sources: ["conversational"] }
    );
    expect(listed.map((s) => s.toJSON().kind).toSorted()).toEqual([
      "edit",
      "edit",
      "editors",
    ]);
    expect(listed.every((s) => s.toJSON().state === "pending")).toBe(true);

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

    // The conversation embeds each suggestion as a directive, with no leftover placeholder.
    const conversation = await ConversationResource.fetchById(
      authenticator,
      CONVERSATION_SID
    );
    expect(conversation).toBeDefined();
    const { text, agentMessageIds } = await getConversationAgentText(
      authenticator,
      conversation!
    );
    expect(agentMessageIds).toHaveLength(2);
    expect(text).not.toContain("__");
    for (const suggestion of skillSuggestions.values()) {
      expect(text).toContain(
        `:skill_suggestion[]{sId=${suggestion.sId} kind=${suggestion.kind} skillId=${skill!.sId}}`
      );
    }

    // Re-run: users and skill are kept, suggestions and conversation are recreated.
    const rerun = await seedConversationalBuilding(ctx);
    expect(rerun.skills.get(SKILL_NAME)!.sId).toBe(skill!.sId);
    expect(rerun.skillSuggestions.size).toBe(3);
    for (const [id, suggestion] of skillSuggestions) {
      expect(rerun.skillSuggestions.get(id)!.sId).not.toBe(suggestion.sId);
    }
    expect(
      (
        await SkillSuggestionResource.listBySkillConfigurationId(
          authenticator,
          skill!.sId,
          { sources: ["conversational"] }
        )
      ).length
    ).toBe(3);

    const rerunConversation = await ConversationResource.fetchById(
      authenticator,
      CONVERSATION_SID
    );
    expect(rerunConversation!.id).not.toBe(conversation!.id);
    const { text: rerunText } = await getConversationAgentText(
      authenticator,
      rerunConversation!
    );
    for (const suggestion of rerun.skillSuggestions.values()) {
      expect(rerunText).toContain(`sId=${suggestion.sId} `);
    }
    // Old step contents are gone.
    expect(
      await AgentStepContentResource.fetchByAgentMessages(authenticator, {
        agentMessageIds,
      })
    ).toHaveLength(0);
  });
});
