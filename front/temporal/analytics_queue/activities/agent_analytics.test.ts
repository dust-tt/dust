import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";

import type { Authenticator } from "@app/lib/auth";
import { USAGE_TYPE_USER } from "@app/lib/metronome/constants";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { RunResource } from "@app/lib/resources/run_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { storeAgentAnalyticsActivity } from "@app/temporal/analytics_queue/activities/agent_analytics";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TagFactory } from "@app/tests/utils/TagFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/types/assistant/models/anthropic";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type {
  ModelResolutionMethodType,
  ResolvedRequestedModel,
} from "@app/types/assistant/models/types";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Keep the DB and resources real; only stub the Elasticsearch boundary so we can
// capture the document that would be indexed without depending on a live cluster.
vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, withEs: vi.fn() };
});

/**
 * Wire `withEs` to run its callback against a stub client that records every
 * `index` call, and return the array of captured params.
 */
function captureIndexedDocs(): Array<{ index: string; id: string; body: any }> {
  const indexed: Array<{ index: string; id: string; body: any }> = [];
  vi.mocked(withEs).mockImplementation(async (fn: any) => {
    const client = {
      index: async (params: any) => {
        indexed.push(params);
        return {};
      },
      bulk: async () => ({}),
      update: async () => ({}),
    };
    return new Ok(await fn(client));
  });
  return indexed;
}

function analyticsDoc(
  indexed: Array<{ index: string; body: any }>
): Record<string, any> | undefined {
  return indexed.find((p) => p.index === ANALYTICS_ALIAS_NAME)?.body;
}

/**
 * Create a conversation with a user message and an agent message pinned to the
 * given agent configuration id/version, and return the sIds needed to run the
 * analytics activity.
 */
async function seedMessages(
  auth: Authenticator,
  {
    agentConfigurationId,
    agentConfigurationVersion,
    spaceModelId,
    resolvedModel,
    modelResolutionMethod,
  }: {
    agentConfigurationId: string;
    agentConfigurationVersion: number;
    spaceModelId?: ModelId;
    resolvedModel?: ResolvedRequestedModel | null;
    modelResolutionMethod?: ModelResolutionMethodType | null;
  }
): Promise<{
  conversationSId: string;
  userMessageId: string;
  agentMessageId: string;
}> {
  const workspace = auth.getNonNullableWorkspace();

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId,
    messagesCreatedAt: [],
    spaceId: spaceModelId,
  });

  const userMessageRow = await ConversationFactory.createUserMessageWithRank({
    auth,
    workspace,
    conversationId: conversation.id,
    rank: 0,
    content: "Hello",
  });

  const agentMessageRow = await ConversationFactory.createAgentMessageWithRank({
    workspace,
    conversationId: conversation.id,
    rank: 1,
    agentConfigurationId,
    agentConfigurationVersion,
    resolvedModel,
    modelResolutionMethod,
  });

  return {
    conversationSId: conversation.sId,
    userMessageId: userMessageRow.sId,
    agentMessageId: agentMessageRow.sId,
  };
}

async function runAnalytics(
  auth: Authenticator,
  {
    conversationSId,
    agentMessageId,
    userMessageId,
  }: { conversationSId: string; agentMessageId: string; userMessageId: string }
): Promise<void> {
  await storeAgentAnalyticsActivity(auth.toJSON(), {
    agentLoopArgs: {
      agentMessageId,
      agentMessageVersion: 0,
      conversationId: conversationSId,
      conversationTitle: null,
      userMessageId,
      userMessageVersion: 0,
      userMessageOrigin: "web",
    },
  });
}

describe("storeAgentAnalyticsActivity - agent_tag_ids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stamps the agent's tag sIds onto the analytics document", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const tag = await TagFactory.create(auth.getNonNullableWorkspace(), {
      name: "post-sales",
    });
    await tag.addToAgent(auth, agent);

    const seeded = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });

    const indexed = captureIndexedDocs();
    await runAnalytics(auth, seeded);

    const doc = analyticsDoc(indexed);
    expect(doc).toBeDefined();
    expect(doc?.agent_id).toBe(agent.sId);
    expect(doc?.agent_tag_ids).toEqual([tag.sId]);
  });

  it("stamps all tag sIds when the agent has multiple tags", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const workspace = auth.getNonNullableWorkspace();
    const tagA = await TagFactory.create(workspace, { name: "post-sales" });
    const tagB = await TagFactory.create(workspace, { name: "help-center" });
    await tagA.addToAgent(auth, agent);
    await tagB.addToAgent(auth, agent);

    const seeded = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });

    const indexed = captureIndexedDocs();
    await runAnalytics(auth, seeded);

    const doc = analyticsDoc(indexed);
    expect(doc?.agent_tag_ids).toHaveLength(2);
    expect([...doc!.agent_tag_ids].sort()).toEqual([tagA.sId, tagB.sId].sort());
  });

  it("stamps an empty array when the agent has no tags", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const seeded = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });

    const indexed = captureIndexedDocs();
    await runAnalytics(auth, seeded);

    expect(analyticsDoc(indexed)?.agent_tag_ids).toEqual([]);
  });

  it("stamps an empty array for global agents", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const seeded = await seedMessages(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.HELPER,
      agentConfigurationVersion: 0,
    });

    const indexed = captureIndexedDocs();
    await runAnalytics(auth, seeded);

    const doc = analyticsDoc(indexed);
    expect(doc?.agent_id).toBe(GLOBAL_AGENTS_SID.HELPER);
    expect(doc?.agent_tag_ids).toEqual([]);
  });

  it("reflects the tags from the agent version that produced the message", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    // v0 has one tag.
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const tag = await TagFactory.create(auth.getNonNullableWorkspace(), {
      name: "post-sales",
    });
    await tag.addToAgent(auth, agent);

    // Bump to v1, which is created without tags.
    const updated = await AgentConfigurationFactory.updateTestAgent(
      auth,
      agent.sId
    );
    expect(updated.version).toBeGreaterThan(agent.version);

    // A message pinned to v0 still resolves v0's tags.
    const seededV0 = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });
    let indexed = captureIndexedDocs();
    await runAnalytics(auth, seededV0);
    expect(analyticsDoc(indexed)?.agent_tag_ids).toEqual([tag.sId]);

    // A message pinned to v1 resolves v1's (empty) tags.
    const seededV1 = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: updated.version,
    });
    indexed = captureIndexedDocs();
    await runAnalytics(auth, seededV1);
    expect(analyticsDoc(indexed)?.agent_tag_ids).toEqual([]);
  });
});

describe("storeAgentAnalyticsActivity - model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stamps the model that actually ran the message", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const seeded = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
      resolvedModel: {
        providerId: "anthropic",
        modelId: CLAUDE_SONNET_4_6_MODEL_ID,
        reasoningEffort: "medium",
      },
      modelResolutionMethod: "agent",
    });

    const indexed = captureIndexedDocs();
    await runAnalytics(auth, seeded);

    const doc = analyticsDoc(indexed);
    expect(doc).toBeDefined();
    expect(doc?.model).toEqual({
      provider_id: "anthropic",
      model_id: CLAUDE_SONNET_4_6_MODEL_ID,
      reasoning_effort: "medium",
      resolution_method: "agent",
    });
  });

  it("stamps the concrete model a stream tier resolved to, not the stream id", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const seeded = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
      resolvedModel: {
        providerId: "anthropic",
        modelId: CLAUDE_SONNET_4_6_MODEL_ID,
        reasoningEffort: "high",
      },
      modelResolutionMethod: "auto_complex",
    });

    const indexed = captureIndexedDocs();
    await runAnalytics(auth, seeded);

    const doc = analyticsDoc(indexed);
    expect(doc?.model?.model_id).toBe(CLAUDE_SONNET_4_6_MODEL_ID);
    expect(doc?.model?.resolution_method).toBe("auto_complex");
  });

  it("stamps null when the agent message has no resolved model", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const seeded = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });

    const indexed = captureIndexedDocs();
    await runAnalytics(auth, seeded);

    const doc = analyticsDoc(indexed);
    expect(doc).toBeDefined();
    expect(doc?.model).toBeNull();
  });
});

describe("storeAgentAnalyticsActivity - space_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stamps the space sId when the conversation lives in a pod", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const space = await SpaceFactory.project(
      auth.getNonNullableWorkspace(),
      auth.getNonNullableUser().id
    );
    // Pick up the pod editor group membership created above.
    await auth.refresh();

    const seeded = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
      spaceModelId: space.id,
    });

    const indexed = captureIndexedDocs();
    await runAnalytics(auth, seeded);

    const doc = analyticsDoc(indexed);
    expect(doc).toBeDefined();
    expect(doc?.space_id).toBe(space.sId);
  });

  it("stamps null when the conversation is not attached to a space", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const seeded = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });

    const indexed = captureIndexedDocs();
    await runAnalytics(auth, seeded);

    const doc = analyticsDoc(indexed);
    expect(doc).toBeDefined();
    expect(doc?.space_id).toBeNull();
  });
});

describe("storeAgentAnalyticsActivity - reasoning tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates provider-reported reasoning tokens from run usages", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const workspace = auth.getNonNullableWorkspace();
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const seeded = await seedMessages(auth, {
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
    });
    const message = await MessageModel.findOne({
      where: {
        sId: seeded.agentMessageId,
        workspaceId: workspace.id,
      },
    });
    if (!message?.agentMessageId) {
      throw new Error("Expected an agent message.");
    }

    const run = await RunResource.makeNew({
      appId: null,
      dustRunId: generateRandomModelSId(),
      runType: "deploy",
      useWorkspaceCredentials: false,
      workspaceId: workspace.id,
    });
    await run.recordTokenUsage(
      auth,
      {
        inputTokens: 1_000,
        totalOutputTokens: 300,
        reasoningTokens: 200,
        totalTokens: 1_300,
      },
      GPT_5_MINI_MODEL_CONFIG.modelId,
      { usageType: USAGE_TYPE_USER }
    );
    await AgentMessageModel.update(
      { runIds: [run.dustRunId] },
      {
        where: {
          id: message.agentMessageId,
          workspaceId: workspace.id,
        },
      }
    );

    const indexed = captureIndexedDocs();
    await runAnalytics(auth, seeded);

    expect(analyticsDoc(indexed)?.tokens).toMatchObject({
      completion: 300,
      reasoning: 200,
    });
  });
});
