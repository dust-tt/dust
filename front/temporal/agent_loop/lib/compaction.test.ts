import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { compactConversation } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { Authenticator } from "@app/lib/auth";
import { CompactionMessageModel } from "@app/lib/models/agent/conversation";
import { runCompaction } from "@app/temporal/agent_loop/lib/compaction";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  CompactionMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import type { SupportedModel } from "@app/types/assistant/models/types";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/call_llm", () => ({
  runMultiActionsAgent: vi.fn(),
}));

vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishAgentMessagesEvents: vi.fn(),
  publishConversationEvent: vi.fn(),
  publishMessageEventsOnMessagePostOrEdit: vi.fn(),
}));

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn(),
  launchCompactionWorkflow: vi.fn(),
}));

const MODEL: SupportedModel = {
  providerId: "anthropic",
  modelId: "claude-haiku-4-5-20251001",
};

describe("runCompaction", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];
  let conversation: ConversationType;
  let agentConfig: LightAgentConfigurationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;

    agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversationWithoutContent = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const fetchedConversationResult = await getConversation(
      auth,
      conversationWithoutContent.sId
    );
    if (fetchedConversationResult.isErr()) {
      throw new Error("Failed to fetch conversation");
    }
    conversation = fetchedConversationResult.value;

    vi.clearAllMocks();
  });

  async function createCompactionMessage(): Promise<CompactionMessageType> {
    const result = await compactConversation(auth, {
      conversation,
      model: MODEL,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    return result.value.compactionMessage;
  }

  it("stores the run id before marking compaction as succeeded", async () => {
    const compactionMessage = await createCompactionMessage();

    vi.mocked(runMultiActionsAgent).mockImplementationOnce(
      async (_auth, _config, _input, options) => {
        await options?.onRunId?.("llm_trace_run_1");

        return new Ok({
          actions: [],
          generation:
            "<analysis>Scratchpad.</analysis><summary>Summary.</summary>",
        });
      }
    );

    const result = await runCompaction(auth, {
      conversationId: conversation.sId,
      compactionMessageId: compactionMessage.sId,
      compactionMessageVersion: compactionMessage.version,
      model: MODEL,
    });

    expect(result.isOk()).toBe(true);

    const compactionMessageRow = await CompactionMessageModel.findOne({
      where: {
        id: compactionMessage.compactionMessageId,
        workspaceId: workspace.id,
      },
    });

    expect(compactionMessageRow?.runIds).toEqual(["llm_trace_run_1"]);
    expect(compactionMessageRow?.status).toBe("succeeded");
    expect(compactionMessageRow?.content).toBe("Summary.");
  });

  it("keeps the run id when compaction fails", async () => {
    const compactionMessage = await createCompactionMessage();

    vi.mocked(runMultiActionsAgent).mockImplementationOnce(
      async (_auth, _config, _input, options) => {
        await options?.onRunId?.("llm_trace_run_2");

        return new Err(new Error("LLM failed"));
      }
    );

    const result = await runCompaction(auth, {
      conversationId: conversation.sId,
      compactionMessageId: compactionMessage.sId,
      compactionMessageVersion: compactionMessage.version,
      model: MODEL,
    });

    expect(result.isOk()).toBe(true);

    const compactionMessageRow = await CompactionMessageModel.findOne({
      where: {
        id: compactionMessage.compactionMessageId,
        workspaceId: workspace.id,
      },
    });

    expect(compactionMessageRow?.runIds).toEqual(["llm_trace_run_2"]);
    expect(compactionMessageRow?.status).toBe("failed");
    expect(compactionMessageRow?.content).toBeNull();
  });
});
