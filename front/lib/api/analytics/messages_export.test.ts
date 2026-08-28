import { fetchMessageExportRows } from "@app/lib/api/analytics/messages_export";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { AgentMessageSkillModel } from "@app/lib/models/skill/conversation_skill";
import { docxSkill } from "@app/lib/resources/skill/code_defined/global/docx";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TagFactory } from "@app/tests/utils/TagFactory";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok } from "@app/types/shared/result";
import moment from "moment-timezone";
import { describe, expect, it, vi } from "vitest";

// Keep everything real; only stub the Elasticsearch query (the consumption
// index) so the test does not depend on a live cluster.
vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchConsumptionAnalytics: vi.fn() };
});

// The export reads from the read replica; in tests there is no replica so point
// it at the primary test connection.
vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () => actual.frontSequelize,
  };
});

function mockCreditsByMessage(creditMicroByMessageId: Record<string, number>) {
  vi.mocked(searchConsumptionAnalytics).mockReset();
  vi.mocked(searchConsumptionAnalytics).mockResolvedValueOnce(
    new Ok({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
      aggregations: {
        by_message: {
          buckets: Object.entries(creditMicroByMessageId).map(
            ([messageId, creditMicro]) => ({
              key: { value: messageId },
              credit_micro: { value: creditMicro },
            })
          ),
        },
      },
    })
  );
}

async function exportForToday(params: {
  auth: Parameters<typeof fetchMessageExportRows>[0]["auth"];
  owner: Parameters<typeof fetchMessageExportRows>[0]["owner"];
}) {
  const today = moment.utc();
  return fetchMessageExportRows({
    auth: params.auth,
    owner: params.owner,
    startDate: today.clone().subtract(1, "day").format("YYYY-MM-DD"),
    endDate: today.clone().add(1, "day").format("YYYY-MM-DD"),
    timezone: "UTC",
  });
}

describe("fetchMessageExportRows", () => {
  it("reads message rows from Postgres and credits from the consumption index", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "builder",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Test Agent" }
    );

    const conv = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });

    const { messageRow: userMessageRow } =
      await ConversationFactory.createUserMessage({
        auth: authenticator,
        workspace,
        conversation: conv,
        content: "Hello",
        origin: "web",
      });

    const agentMessageRow =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conv.id as ModelId,
        rank: 1,
        agentConfigurationId: agent.sId,
        parentId: userMessageRow.id,
      });

    mockCreditsByMessage({ [agentMessageRow.sId]: 7_000_000 });

    const result = await exportForToday({
      auth: authenticator,
      owner: workspace,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      messageId: agentMessageRow.sId,
      assistantId: agent.sId,
      assistantName: "Test Agent",
      conversationId: conv.sId,
      parentMessageId: "",
      userId: user.sId,
      userEmail: user.email ?? "",
      source: "web",
      toolsUsed: "",
      skillsUsed: "",
      credits: 7,
    });
  });

  it("returns an empty array when there is no message in the requested window", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "builder",
    });

    mockCreditsByMessage({});

    const result = await fetchMessageExportRows({
      auth: authenticator,
      owner: workspace,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([]);
  });

  it("resolves the run_agent origin message id into parentMessageId", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "builder",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Root Agent" }
    );

    const conv = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });

    // The sub-agent invocation's user message carries the sId of the agent
    // message that triggered it via run_agent.
    const { messageRow: subUserMessageRow } =
      await ConversationFactory.createUserMessage({
        auth: authenticator,
        workspace,
        conversation: conv,
        content: "Sub-agent request",
        agenticMessageType: "run_agent",
        agenticOriginMessageId: "msg_origin",
      });

    const subAgentMessageRow =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conv.id as ModelId,
        rank: 1,
        agentConfigurationId: agent.sId,
        parentId: subUserMessageRow.id,
      });

    mockCreditsByMessage({});

    const result = await exportForToday({
      auth: authenticator,
      owner: workspace,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].messageId).toBe(subAgentMessageRow.sId);
    expect(result.value[0].parentMessageId).toBe("msg_origin");
  });

  it("resolves agent tags to sorted, distinct tag names", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "builder",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Tagged Agent" }
    );

    const [zeta, alpha] = await Promise.all([
      TagFactory.create(workspace, { name: "Zeta" }),
      TagFactory.create(workspace, { name: "Alpha" }),
    ]);
    await Promise.all([
      zeta.addToAgent(authenticator, agent),
      alpha.addToAgent(authenticator, agent),
    ]);

    const conv = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const { messageRow: userMessageRow } =
      await ConversationFactory.createUserMessage({
        auth: authenticator,
        workspace,
        conversation: conv,
        content: "Hello",
      });
    await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conv.id as ModelId,
      rank: 1,
      agentConfigurationId: agent.sId,
      parentId: userMessageRow.id,
    });

    mockCreditsByMessage({});

    const result = await exportForToday({
      auth: authenticator,
      owner: workspace,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].assistantTags).toBe("Alpha,Zeta");
  });

  it("reports the resolved model columns", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "builder",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Model Agent" }
    );

    const conv = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const { messageRow: userMessageRow } =
      await ConversationFactory.createUserMessage({
        auth: authenticator,
        workspace,
        conversation: conv,
        content: "Hello",
      });
    await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conv.id as ModelId,
      rank: 1,
      agentConfigurationId: agent.sId,
      parentId: userMessageRow.id,
      resolvedModel: {
        providerId: "anthropic",
        modelId: "claude-opus-5",
        reasoningEffort: "medium",
      },
      modelResolutionMethod: "agent",
    });

    mockCreditsByMessage({});

    const result = await exportForToday({
      auth: authenticator,
      owner: workspace,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].modelId).toBe("claude-opus-5");
    expect(result.value[0].modelProviderId).toBe("anthropic");
    expect(result.value[0].modelResolutionMethod).toBe("agent");
  });

  it("lists the global skill name used on the message in skillsUsed", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "builder",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Skill Agent" }
    );

    const conv = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const { messageRow: userMessageRow } =
      await ConversationFactory.createUserMessage({
        auth: authenticator,
        workspace,
        conversation: conv,
        content: "Hello",
      });
    const agentMessageRow =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conv.id as ModelId,
        rank: 1,
        agentConfigurationId: agent.sId,
        parentId: userMessageRow.id,
      });

    const skillLink = {
      workspaceId: workspace.id,
      conversationId: conv.id as ModelId,
      agentMessageId: agentMessageRow.agentMessageId!,
      agentConfigurationId: agent.sId,
      globalSkillId: docxSkill.sId,
      customSkillId: null,
      source: "agent_enabled" as const,
      addedByUserId: null,
    };
    await AgentMessageSkillModel.bulkCreate([skillLink]);

    mockCreditsByMessage({});

    const result = await exportForToday({
      auth: authenticator,
      owner: workspace,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].skillsUsed).toBe(docxSkill.name);
  });
});
