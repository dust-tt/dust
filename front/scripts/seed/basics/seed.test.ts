import * as fs from "fs";
import * as path from "path";
import { beforeEach, describe, expect, it } from "vitest";

import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types";

import { seedAgent } from "./seedAgent";
import { seedConversations } from "./seedConversations";
import { seedSkill } from "./seedSkill";
import type { Assets, SeedContext } from "./types";

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
    await seedSkill(ctx, assets.skill);
    const customAgentSId = await seedAgent(ctx, assets.agent);
    await seedConversations(ctx, assets.conversations, customAgentSId);

    // Verify skill was created
    const skills = await SkillResource.listByWorkspace(authenticator, {
      status: "active",
    });
    const createdSkill = skills.find((s) => s.name === assets.skill.name);
    expect(createdSkill).toBeDefined();
    expect(createdSkill?.name).toBe(assets.skill.name);

    // Verify agent was created
    expect(customAgentSId).toBeDefined();

    // Verify all conversations were created
    const allConversations = [
      ...assets.conversations.customAgentConversations,
      ...assets.conversations.dustAgentConversations,
    ];

    for (const convAsset of allConversations) {
      const conversation = await ConversationModel.findOne({
        where: { sId: convAsset.sId, workspaceId: workspace.id },
      });
      expect(conversation).toBeDefined();
      expect(conversation?.title).toBe(convAsset.title);

      // Verify messages exist
      const messages = await MessageModel.findAll({
        where: {
          workspaceId: workspace.id,
          conversationId: conversation!.id,
        },
        order: [["rank", "ASC"]],
      });
      expect(messages.length).toBe(convAsset.exchanges.length * 2);

      // Verify user message content
      const userMessageRow = messages[0];
      const userMessage = await UserMessageModel.findOne({
        where: {
          workspaceId: workspace.id,
          id: userMessageRow.userMessageId!,
        },
      });
      expect(userMessage?.content).toBeDefined();

      // Verify agent message and step content
      const agentMessageRow = messages[1];
      const agentMessage = await AgentMessageModel.findOne({
        where: {
          workspaceId: workspace.id,
          id: agentMessageRow.agentMessageId!,
        },
      });
      expect(agentMessage?.status).toBe("succeeded");

      const stepContent = await AgentStepContentModel.findOne({
        where: {
          workspaceId: workspace.id,
          agentMessageId: agentMessage!.id,
        },
      });
      expect(stepContent).toBeDefined();
      expect((stepContent?.value as { value: string }).value).toBe(
        convAsset.exchanges[0].agent.content
      );
    }

    // Verify idempotency - running again should not create duplicates
    await seedSkill(ctx, assets.skill);

    for (const convAsset of allConversations) {
      const count = await ConversationModel.count({
        where: { sId: convAsset.sId, workspaceId: workspace.id },
      });
      expect(count).toBe(1);
    }
  });
});
