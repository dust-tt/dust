import { makeEnableSkillResultOutput } from "@app/lib/api/actions/servers/skill_management/rendering";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { computeAndStoreAgentMessageConsumptionAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/store";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(),
}));

const INPUT_TOKENS_COUNT = 100;
const OUTPUT_TOKENS_COUNT = 20;
const REASONING_TOKENS_COUNT = 5;

// Every tokenized footprint counts as this many tokens, so tool-call output and tool input
// footprints are deterministic in the assertions below.
const TOKENS_PER_FOOTPRINT = 2;

async function setupSettledMessageWithUsage() {
  const {
    authenticator: auth,
    globalSpace,
    workspace,
  } = await createResourceTest({ role: "admin" });

  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: `Attribution ${generateRandomModelSId()}` }
  );
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const { run } = await RunFactory.createWithUsage(auth, {
    inputTokens: INPUT_TOKENS_COUNT,
    outputTokens: OUTPUT_TOKENS_COUNT,
    reasoningTokens: REASONING_TOKENS_COUNT,
  });
  // The default factory status is "created", which is a tracked status, so attribution runs.
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
    runIds: [run.dustRunId],
  });

  return {
    auth,
    globalSpace,
    workspace,
    conversation,
    run,
    conversationId: conversation.sId,
    agentMessageId: agentMessage.sId,
    agentMessageModelId: agentMessage.agentMessageId,
  };
}

describe("computeAndStoreAgentMessageConsumptionAttribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLlmCredentials).mockResolvedValue({} as never);
    vi.mocked(tokenCountForTexts).mockImplementation(
      async (texts) => new Ok(texts.map(() => TOKENS_PER_FOOTPRINT))
    );
  });

  it("writes one input, output and reasoning row per run usage", async () => {
    const { auth, conversationId, agentMessageId, agentMessageModelId } =
      await setupSettledMessageWithUsage();

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );

    const byType = new Map(items.map((item) => [item.itemType, item]));

    expect(byType.get("input")).toMatchObject({
      itemType: "input",
      inputTokensCount: INPUT_TOKENS_COUNT,
      outputTokensCount: null,
      completedAt: expect.any(Date),
    });
    // The output bucket is the completion tokens net of the reasoning subset.
    expect(byType.get("output")).toMatchObject({
      itemType: "output",
      inputTokensCount: null,
      outputTokensCount: OUTPUT_TOKENS_COUNT - REASONING_TOKENS_COUNT,
    });
    expect(byType.get("reasoning")).toMatchObject({
      itemType: "reasoning",
      inputTokensCount: null,
      outputTokensCount: REASONING_TOKENS_COUNT,
    });

    for (const item of items) {
      expect(item.grossAttributedCreditAmountMicro).toBeGreaterThan(0);
      expect(item.directCreditAmountMicro).toBeNull();
      expect(item.agentMCPActionId).toBeNull();
    }
  });

  it("is idempotent across repeated runs", async () => {
    const { auth, conversationId, agentMessageId, agentMessageModelId } =
      await setupSettledMessageWithUsage();

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });
    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );

    expect(items.map((item) => item.itemType).sort()).toEqual([
      "input",
      "output",
      "reasoning",
    ]);
  });

  it("writes a tool row per action and carves the tool output from the assistant output", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      conversationId,
      agentMessageId,
      agentMessageModelId,
    } = await setupSettledMessageWithUsage();

    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId,
      status: "succeeded",
      // Stamp the action's step content with the run that emitted it, which is how attribution ties
      // a tool call back to its run usage.
      dustRunId: run.dustRunId,
    });

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );

    const toolItem = items.find((item) => item.itemType === "tool");
    expect(toolItem).toMatchObject({
      itemType: "tool",
      agentMCPActionId: action.id,
      // The tool call emission and its result footprint each tokenize to TOKENS_PER_FOOTPRINT.
      outputTokensCount: TOKENS_PER_FOOTPRINT,
      inputTokensCount: TOKENS_PER_FOOTPRINT,
    });
    expect(toolItem?.grossAttributedCreditAmountMicro).toBeGreaterThan(0);
    // The tool ran, so it carries the per-invocation charge of its cost category.
    expect(toolItem?.directCreditAmountMicro).toBeGreaterThan(0);

    // The tokens the model spent emitting the tool call are carved out of the assistant output
    // bucket, so the two together still sum to the completion tokens net of reasoning.
    const outputItem = items.find((item) => item.itemType === "output");
    expect(
      (outputItem?.outputTokensCount ?? 0) + (toolItem?.outputTokensCount ?? 0)
    ).toBe(OUTPUT_TOKENS_COUNT - REASONING_TOKENS_COUNT);
  });

  it("attributes enabled skill instructions and tool definitions to the tool input", async () => {
    const {
      auth,
      globalSpace,
      workspace,
      conversation,
      run,
      conversationId,
      agentMessageId,
      agentMessageModelId,
    } = await setupSettledMessageWithUsage();

    const internalServer = await InternalMCPServerInMemoryResource.makeNew(
      auth,
      {
        name: "common_utilities",
        useCase: null,
      }
    );
    const mcpServerView = await MCPServerViewFactory.create(
      workspace,
      internalServer.id,
      globalSpace
    );
    const skill = await SkillFactory.create(auth, {
      instructions: "Follow the enabled skill instructions.",
      mcpServerViews: [mcpServerView],
      name: "Measured Skill",
    });
    await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId,
      status: "succeeded",
      dustRunId: run.dustRunId,
      output: [
        makeEnableSkillResultOutput({
          skillId: skill.sId,
          text: `Skill "${skill.name}" has been enabled.`,
        }),
      ],
    });

    // Character counts let this assertion verify the exact combined text handed to tokenization.
    vi.mocked(tokenCountForTexts).mockImplementation(
      async (texts) => new Ok(texts.map((text) => text.length))
    );

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const [, inputTokenizationCall] = vi.mocked(tokenCountForTexts).mock.calls;
    const [inputTexts] = inputTokenizationCall;
    expect(inputTexts).toHaveLength(1);
    expect(inputTexts[0]).toContain(
      "<dust_system>\n<Measured Skill>\nFollow the enabled skill instructions."
    );
    expect(inputTexts[0]).toContain(
      '"name":"common_utilities__set_conversation_title"'
    );

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );
    const toolItem = items.find((item) => item.itemType === "tool");
    expect(toolItem?.inputTokensCount).toBe(inputTexts[0].length);
  });

  it("writes a blocked tool as a pending row, carving its output but withholding the charge", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      conversationId,
      agentMessageId,
      agentMessageModelId,
    } = await setupSettledMessageWithUsage();

    // The default factory status is "blocked_validation_required": the loop paused for approval and
    // attribution runs while the tool has not executed yet.
    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId,
      dustRunId: run.dustRunId,
    });

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );

    // The tool row is pending: the emitted call output is known and carved, but the result footprint
    // and the direct charge wait for the action to settle.
    const toolItem = items.find((item) => item.itemType === "tool");
    expect(toolItem).toMatchObject({
      itemType: "tool",
      agentMCPActionId: action.id,
      outputTokensCount: TOKENS_PER_FOOTPRINT,
      inputTokensCount: null,
      directCreditAmountMicro: null,
      completedAt: null,
    });
    expect(toolItem?.grossAttributedCreditAmountMicro).toBeGreaterThan(0);

    // The carve still applies while pending: the assistant output bucket is net of the emitted call.
    const outputItem = items.find((item) => item.itemType === "output");
    expect(
      (outputItem?.outputTokensCount ?? 0) + (toolItem?.outputTokensCount ?? 0)
    ).toBe(OUTPUT_TOKENS_COUNT - REASONING_TOKENS_COUNT);
  });

  it("completes the pending tool row with no charge once the blocked action is denied", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      conversationId,
      agentMessageId,
      agentMessageModelId,
    } = await setupSettledMessageWithUsage();

    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId,
      dustRunId: run.dustRunId,
    });

    // First finalize, while the tool is still blocked: a pending row is written.
    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    // The user rejects the approval, so the tool never runs, then the loop finalizes again.
    await AgentMCPActionFactory.setStatus(auth, {
      action,
      status: "denied",
    });
    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const toolItems = (
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      )
    ).filter((item) => item.itemType === "tool");

    // The row settles with no per-invocation charge. What stays attributed is the output the
    // model spent emitting the call.
    expect(toolItems).toHaveLength(1);
    expect(toolItems[0]).toMatchObject({
      agentMCPActionId: action.id,
      outputTokensCount: TOKENS_PER_FOOTPRINT,
      directCreditAmountMicro: 0,
      completedAt: expect.any(Date),
    });
    expect(toolItems[0].grossAttributedCreditAmountMicro).toBeGreaterThan(0);
  });

  it("completes the pending tool row in place once the blocked action is approved", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      conversationId,
      agentMessageId,
      agentMessageModelId,
    } = await setupSettledMessageWithUsage();

    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId,
      dustRunId: run.dustRunId,
    });

    // First finalize, while the tool is still blocked: a pending row is written.
    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    // The user approves, the tool executes and succeeds, then the loop finalizes again.
    await AgentMCPActionFactory.setStatus(auth, {
      action,
      status: "succeeded",
    });
    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const toolItems = (
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      )
    ).filter((item) => item.itemType === "tool");

    // The blocked pending row was completed in place, not duplicated: still one tool row, now
    // carrying the result footprint and the direct charge.
    expect(toolItems).toHaveLength(1);
    expect(toolItems[0]).toMatchObject({
      agentMCPActionId: action.id,
      outputTokensCount: TOKENS_PER_FOOTPRINT,
      inputTokensCount: TOKENS_PER_FOOTPRINT,
      completedAt: expect.any(Date),
    });
    expect(toolItems[0].directCreditAmountMicro).toBeGreaterThan(0);
  });

  it("keeps a completed tool single and stable across a redundant re-finalize", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      conversationId,
      agentMessageId,
      agentMessageModelId,
    } = await setupSettledMessageWithUsage();

    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId,
      dustRunId: run.dustRunId,
    });

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });
    await AgentMCPActionFactory.setStatus(auth, {
      action,
      status: "succeeded",
    });
    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    // A redundant finalize (e.g. a Temporal retry) re-upserts the same values. It must not duplicate
    // the row or change the attributed evidence, and the row stays completed.
    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const toolItems = (
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      )
    ).filter((item) => item.itemType === "tool");

    expect(toolItems).toHaveLength(1);
    expect(toolItems[0]).toMatchObject({
      agentMCPActionId: action.id,
      outputTokensCount: TOKENS_PER_FOOTPRINT,
      inputTokensCount: TOKENS_PER_FOOTPRINT,
      completedAt: expect.any(Date),
    });
  });

  it("writes nothing when the message has no runs", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});

    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: `Attribution ${generateRandomModelSId()}` }
    );
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      {
        workspace,
        conversation,
        agentConfig: agentConfiguration,
        runIds: null,
      }
    );

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
      conversationId: conversation.sId,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessage.agentMessageId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );

    expect(items).toHaveLength(0);
  });
});
