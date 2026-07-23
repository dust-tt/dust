import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import {
  AgentStepContentResource,
  FETCH_BY_AGENT_MESSAGES_CHUNK_SIZE,
} from "@app/lib/resources/agent_step_content_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentTextContentType } from "@app/types/assistant/agent_message_content";
import { describe, expect, it } from "vitest";

function makeTextContent(value: string): AgentTextContentType {
  return {
    type: "text_content",
    value,
  };
}

async function createAgentMessages(
  auth: Authenticator,
  {
    count,
    agentConfigurationId,
    agentConfigurationVersion,
  }: {
    count: number;
    agentConfigurationId: string;
    agentConfigurationVersion: number;
  }
): Promise<AgentMessageModel[]> {
  const workspace = auth.getNonNullableWorkspace();

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId,
    messagesCreatedAt: [],
  });

  return AgentMessageModel.bulkCreate(
    Array.from({ length: count }, () => ({
      conversationId: conversation.id,
      workspaceId: workspace.id,
      status: "succeeded",
      agentConfigurationId,
      agentConfigurationVersion,
      skipToolsValidation: true,
      completedAt: new Date(),
    })),
    { returning: true }
  );
}

describe("AgentStepContentResource.fetchByAgentMessages", () => {
  it("returns latest versions for every agent message when the input exceeds the chunk size", async () => {
    const { authenticator, workspace } = await createResourceTest({});
    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      {
        name: "Chunk Fetch Test Agent",
      }
    );
    const agentMessages = await createAgentMessages(authenticator, {
      count: FETCH_BY_AGENT_MESSAGES_CHUNK_SIZE + 1,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });

    const [versionedAgentMessage, ...remainingAgentMessages] = agentMessages;

    await AgentStepContentModel.bulkCreate([
      {
        workspaceId: workspace.id,
        agentMessageId: versionedAgentMessage.id,
        step: 0,
        index: 0,
        version: 0,
        type: "text_content",
        value: makeTextContent("old version"),
      },
      {
        workspaceId: workspace.id,
        agentMessageId: versionedAgentMessage.id,
        step: 0,
        index: 0,
        version: 1,
        type: "text_content",
        value: makeTextContent("new version"),
      },
      ...remainingAgentMessages.map((agentMessage, index) => ({
        workspaceId: workspace.id,
        agentMessageId: agentMessage.id,
        step: 0,
        index: 0,
        version: 0,
        type: "text_content" as const,
        value: makeTextContent(`message-${index}`),
      })),
    ]);

    const stepContents = await AgentStepContentResource.fetchByAgentMessages(
      authenticator,
      {
        agentMessageIds: agentMessages.map((message) => message.id),
        latestVersionsOnly: true,
      }
    );

    expect(stepContents).toHaveLength(agentMessages.length);
    expect(
      stepContents.map((c) => c.agentMessageId).toSorted((a, b) => a - b)
    ).toEqual(agentMessages.map((m) => m.id).toSorted((a, b) => a - b));

    const latestVersion = stepContents.find(
      (content) => content.agentMessageId === versionedAgentMessage.id
    );
    expect(latestVersion?.version).toBe(1);
    expect(latestVersion?.value).toEqual(makeTextContent("new version"));
  });
});
