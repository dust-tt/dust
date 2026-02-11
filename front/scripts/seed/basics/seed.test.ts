import * as fs from "fs";
import * as path from "path";
import { beforeEach, describe, expect, it } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { Assets } from "@app/scripts/seed/basics/seed";
import type { SeedContext } from "@app/scripts/seed/factories";
import {
  seedAgents,
  seedConversations,
  seedSkill,
} from "@app/scripts/seed/factories";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { LightWorkspaceType } from "@app/types/user";

// Load assets from JSON files (same as seed.ts)
function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const agent = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "agent.json"), "utf-8")
  );
  const skill = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "skill.json"), "utf-8")
  );
  const conversations = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "conversations.json"), "utf-8")
  );
  const suggestedSkills = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "suggested-skills.json"), "utf-8")
  );
  return { agent, skill, conversations, suggestedSkills };
}

describe("basics seed script integration test", () => {
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let authenticator: Authenticator;

  const assets = loadAssets();

  beforeEach(async () => {
    const testResources = await createResourceTest({ role: "admin" });
    workspace = testResources.workspace;
    user = testResources.user;
    authenticator = testResources.authenticator;
  });

  it("should run the full seed and create all expected resources", async () => {
    const ctx: SeedContext = {
      auth: authenticator,
      workspace,
      user,
      execute: true,
      logger,
    };

    // Run the seed flow (same order as seed.ts)
    const createdSkill = await seedSkill(ctx, assets.skill);
    const skillsToLink = createdSkill ? [createdSkill] : [];
    const createdAgents = await seedAgents(ctx, assets.agent, {
      skills: skillsToLink,
    });

    // Add Dust global agent for conversations
    createdAgents.set("Dust", { sId: GLOBAL_AGENTS_SID.DUST, name: "Dust" });

    await seedConversations(ctx, assets.conversations, {
      agents: createdAgents,
      placeholders: {
        __CUSTOM_AGENT_SID__: createdAgents.values().next().value?.sId ?? "",
      },
    });

    // Verify skill was created
    const skills = await SkillResource.listByWorkspace(authenticator, {
      status: "active",
    });
    const foundSkill = skills.find((s) => s.name === assets.skill.name);
    expect(foundSkill).toBeDefined();
    expect(foundSkill?.name).toBe(assets.skill.name);

    // Verify agents were created
    expect(createdAgents.size).toBeGreaterThan(1);

    // Verify all conversations were created
    const allConversations = assets.conversations;

    for (const convAsset of allConversations) {
      const conversation = await ConversationResource.fetchById(
        authenticator,
        convAsset.sId
      );
      expect(conversation).toBeDefined();
      expect(conversation?.title).toBe(convAsset.title);

      // Verify messages exist
      const { messages } = await conversation!.fetchMessagesForPage(
        authenticator,
        { limit: 100 }
      );
      // Messages are returned in DESC order, sort by rank ASC for assertions
      const sortedMessages = messages.toSorted((a, b) => a.rank - b.rank);
      expect(sortedMessages.length).toBe(convAsset.exchanges.length * 2);

      // Verify user message content
      const userMessageRow = sortedMessages[0];
      expect(userMessageRow.userMessage?.content).toBeDefined();

      // Verify agent message and step content
      const agentMessageRow = sortedMessages[1];
      expect(agentMessageRow.agentMessage?.status).toBe("succeeded");

      const stepContents = await AgentStepContentResource.fetchByAgentMessages(
        authenticator,
        { agentMessageIds: [agentMessageRow.agentMessage!.id] }
      );
      expect(stepContents.length).toBeGreaterThan(0);
      const stepContent = stepContents[0];
      expect((stepContent.value as { value: string }).value).toBe(
        convAsset.exchanges[0].agent.content
      );
    }

    // Verify idempotency - running again should not create duplicates
    await seedSkill(ctx, assets.skill);

    for (const convAsset of allConversations) {
      const conversation = await ConversationResource.fetchById(
        authenticator,
        convAsset.sId
      );
      expect(conversation).toBeDefined();
    }
  });
});
