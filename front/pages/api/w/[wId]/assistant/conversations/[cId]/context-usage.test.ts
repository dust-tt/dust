import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  CompactionMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import {
  RunModel,
  RunUsageModel,
} from "@app/lib/resources/storage/models/runs";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

import handler from "./context-usage";

async function setupTest() {
  const { req, res, workspace, auth } = await createPrivateApiMockRequest({
    role: "admin",
    method: "GET",
  });

  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    name: "Test Agent",
    description: "Test agent for context usage.",
  });

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });

  req.query.wId = workspace.sId;
  req.query.cId = conversation.sId;
  req.url = `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}/context-usage`;

  return {
    req,
    res,
    auth,
    workspace,
    agent,
    conversation,
  };
}

async function createRunWithUsage(
  auth: Authenticator,
  {
    dustRunId,
    createdAt,
    promptTokens,
    completionTokens = 10,
  }: {
    dustRunId: string;
    createdAt: Date;
    promptTokens: number;
    completionTokens?: number;
  }
) {
  const workspace = auth.getNonNullableWorkspace();

  const run = await RunModel.create({
    dustRunId,
    runType: "deploy",
    useWorkspaceCredentials: false,
    workspaceId: workspace.id,
    createdAt,
    updatedAt: createdAt,
  });

  await RunUsageModel.create({
    runId: run.id,
    providerId: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    promptTokens,
    completionTokens,
    cachedTokens: null,
    cacheCreationTokens: null,
    costMicroUsd: 1,
    isBatch: false,
    workspaceId: workspace.id,
  });
}

async function createAgentMessage(
  auth: Authenticator,
  {
    agent,
    conversation,
    rank,
    runIds,
  }: {
    agent: LightAgentConfigurationType;
    conversation: ConversationWithoutContentType;
    rank: number;
    runIds: string[] | null;
  }
) {
  const workspace = auth.getNonNullableWorkspace();

  const agentMessage = await AgentMessageModel.create({
    status: "succeeded",
    agentConfigurationId: agent.sId,
    agentConfigurationVersion: 0,
    runIds,
    workspaceId: workspace.id,
    skipToolsValidation: false,
  });

  await MessageModel.create({
    sId: generateRandomModelSId(),
    rank,
    conversationId: conversation.id,
    agentMessageId: agentMessage.id,
    workspaceId: workspace.id,
  });
}

async function createCompactionMessage(
  auth: Authenticator,
  {
    conversation,
    rank,
    status,
    runIds,
  }: {
    conversation: ConversationWithoutContentType;
    rank: number;
    status: "created" | "succeeded" | "failed";
    runIds: string[] | null;
  }
) {
  const workspace = auth.getNonNullableWorkspace();

  const compactionMessage = await CompactionMessageModel.create({
    status,
    content: status === "succeeded" ? "Summary." : null,
    runIds,
    workspaceId: workspace.id,
  });

  await MessageModel.create({
    sId: generateRandomModelSId(),
    rank,
    conversationId: conversation.id,
    compactionMessageId: compactionMessage.id,
    workspaceId: workspace.id,
  });
}

describe("GET /api/w/[wId]/assistant/conversations/[cId]/context-usage", () => {
  it("uses the latest succeeded compaction run when it is newer than the latest agent run", async () => {
    const { req, res, auth, agent, conversation } = await setupTest();

    await createAgentMessage(auth, {
      agent,
      conversation,
      rank: 10,
      runIds: ["agent_run"],
    });
    await createCompactionMessage(auth, {
      conversation,
      rank: 20,
      status: "succeeded",
      runIds: ["compaction_run"],
    });
    await createCompactionMessage(auth, {
      conversation,
      rank: 30,
      status: "failed",
      runIds: ["failed_compaction_run"],
    });

    await createRunWithUsage(auth, {
      dustRunId: "agent_run",
      createdAt: new Date("2024-01-01T00:00:01.000Z"),
      promptTokens: 111,
    });
    await createRunWithUsage(auth, {
      dustRunId: "compaction_run",
      createdAt: new Date("2024-01-01T00:00:02.000Z"),
      promptTokens: 222,
      completionTokens: 123,
    });
    await createRunWithUsage(auth, {
      dustRunId: "failed_compaction_run",
      createdAt: new Date("2024-01-01T00:00:03.000Z"),
      promptTokens: 333,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      model: {
        providerId: "anthropic",
        modelId: "claude-haiku-4-5-20251001",
      },
      contextUsage: 123,
    });
  });

  it("uses the latest agent run when it is newer than the latest succeeded compaction run", async () => {
    const { req, res, auth, agent, conversation } = await setupTest();

    await createCompactionMessage(auth, {
      conversation,
      rank: 10,
      status: "succeeded",
      runIds: ["compaction_run"],
    });
    await createAgentMessage(auth, {
      agent,
      conversation,
      rank: 20,
      runIds: ["agent_run"],
    });

    await createRunWithUsage(auth, {
      dustRunId: "compaction_run",
      createdAt: new Date("2024-01-01T00:00:01.000Z"),
      promptTokens: 111,
      completionTokens: 77,
    });
    await createRunWithUsage(auth, {
      dustRunId: "agent_run",
      createdAt: new Date("2024-01-01T00:00:02.000Z"),
      promptTokens: 222,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toMatchObject({
      model: {
        providerId: "anthropic",
        modelId: "claude-haiku-4-5-20251001",
      },
      contextUsage: 222,
    });
  });
});
