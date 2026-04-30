import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { compactConversation } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { createGCSMountFile } from "@app/lib/api/files/gcs_mount/files";
import type { Authenticator } from "@app/lib/auth";
import { CompactionMessageModel } from "@app/lib/models/agent/conversation";
import { launchCompactionWorkflow } from "@app/temporal/agent_loop/client";
import { runCompaction } from "@app/temporal/agent_loop/lib/compaction";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  CompactionMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import { isCompactionMessageType } from "@app/types/assistant/conversation";
import type { SupportedModel } from "@app/types/assistant/models/types";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/call_llm", () => ({
  runMultiActionsAgent: vi.fn(),
}));

vi.mock("@app/lib/api/files/gcs_mount/files", () => ({
  createGCSMountFile: vi.fn(),
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
    vi.mocked(createGCSMountFile).mockImplementation(
      async (_auth, scope, { relativeFilePath, content, contentType }) =>
        new Ok({
          isDirectory: false,
          fileName: relativeFilePath.split("/").pop() ?? relativeFilePath,
          path: `${scope.useCase}/${relativeFilePath}`,
          sizeBytes: content.length,
          contentType,
          lastModifiedMs: Date.now(),
          fileId: null,
          thumbnailUrl: null,
        })
    );
  });

  async function createCompactionMessage(
    targetConversation: ConversationType = conversation
  ): Promise<CompactionMessageType> {
    const result = await compactConversation(auth, {
      conversation: targetConversation,
      model: MODEL,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    return result.value.compactionMessage;
  }

  it("forwards source overrides when launching compaction", async () => {
    const result = await compactConversation(auth, {
      conversation,
      model: MODEL,
      sourceConversation: {
        conversationId: "conv_source",
        messageRank: 3,
        attachmentIdReplacements: {
          file_parent_1: "file_child_1",
        },
      },
    });

    expect(result.isOk()).toBe(true);
    expect(vi.mocked(launchCompactionWorkflow)).toHaveBeenCalledWith(
      expect.objectContaining({
        auth,
        conversationId: conversation.sId,
        compactionMessageId: result.isOk()
          ? result.value.compactionMessage.sId
          : undefined,
        compactionMessageVersion: result.isOk()
          ? result.value.compactionMessage.version
          : undefined,
        model: MODEL,
        sourceConversation: {
          conversationId: "conv_source",
          messageRank: 3,
          attachmentIdReplacements: {
            file_parent_1: "file_child_1",
          },
        },
      })
    );
  });

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
    expect(compactionMessageRow?.content).toContain("Summary.");
    expect(compactionMessageRow?.content).toContain(
      "Full conversation history before compaction: conversation/history/compaction-"
    );
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

  it("sanitizes run ids before interpolating them into SQL", async () => {
    const compactionMessage = await createCompactionMessage();

    vi.mocked(runMultiActionsAgent).mockImplementationOnce(
      async (_auth, _config, _input, options) => {
        await options?.onRunId?.("llm_trace_run_'quoted'");

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

    expect(compactionMessageRow?.runIds).toEqual(["llm_trace_run_'quoted'"]);
  });

  it("creates a conversation history file when compaction succeeds", async () => {
    await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: 0,
      content: "Important pre-compaction request.",
    });

    const conversationWithMessageRes = await getConversation(
      auth,
      conversation.sId
    );
    expect(conversationWithMessageRes.isOk()).toBe(true);
    if (conversationWithMessageRes.isErr()) {
      return;
    }

    const compactionMessage = await createCompactionMessage(
      conversationWithMessageRes.value
    );

    vi.mocked(runMultiActionsAgent).mockResolvedValueOnce(
      new Ok({
        actions: [],
        generation:
          "<analysis>Scratchpad.</analysis><summary>Summary.</summary>",
      })
    );

    const result = await runCompaction(auth, {
      conversationId: conversation.sId,
      compactionMessageId: compactionMessage.sId,
      compactionMessageVersion: compactionMessage.version,
      model: MODEL,
    });

    expect(result.isOk()).toBe(true);
    expect(createGCSMountFile).toHaveBeenCalledWith(
      auth,
      { useCase: "conversation", conversationId: conversation.sId },
      expect.objectContaining({
        relativeFilePath: expect.stringMatching(
          new RegExp(
            `^history/compaction-\\d{8}-\\d{4}-${compactionMessage.sId}\\.history$`
          )
        ),
        contentType: "text/plain",
      })
    );

    const createCall = vi.mocked(createGCSMountFile).mock.calls[0];
    const writtenContent = createCall?.[2].content.toString("utf8");
    expect(writtenContent).toContain(
      "# Conversation History Before Compaction"
    );
    expect(writtenContent).toContain("Important pre-compaction request.");

    const compactionMessageRow = await CompactionMessageModel.findOne({
      where: {
        id: compactionMessage.compactionMessageId,
        workspaceId: workspace.id,
      },
    });
    expect(compactionMessageRow?.content).toContain(
      `conversation/history/compaction-`
    );
    expect(compactionMessageRow?.content).toContain(compactionMessage.sId);
  });

  it("summarizes a source snapshot into the target compaction message", async () => {
    const sourceConversationWithoutContent = await ConversationFactory.create(
      auth,
      {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      }
    );

    await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: sourceConversationWithoutContent.id,
      rank: 0,
      content: "source before cutoff",
    });
    await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: sourceConversationWithoutContent.id,
      rank: 1,
      content: "source at cutoff",
    });
    await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: sourceConversationWithoutContent.id,
      rank: 2,
      content: "source after cutoff",
    });

    const compactionMessage = await createCompactionMessage();
    let summarizedText: string | null = null;

    vi.mocked(runMultiActionsAgent).mockImplementationOnce(
      async (_auth, _config, input) => {
        const firstMessage = input.conversation.messages[0];
        const firstContent = firstMessage?.content?.[0];

        if (
          !firstContent ||
          typeof firstContent === "string" ||
          firstContent.type !== "text"
        ) {
          throw new Error("Expected compaction prompt text input");
        }

        summarizedText = firstContent.text;

        return new Ok({
          actions: [],
          generation:
            "<analysis>Scratchpad.</analysis><summary>Summary from source.</summary>",
        });
      }
    );

    const result = await runCompaction(auth, {
      conversationId: conversation.sId,
      compactionMessageId: compactionMessage.sId,
      compactionMessageVersion: compactionMessage.version,
      model: MODEL,
      sourceConversation: {
        conversationId: sourceConversationWithoutContent.sId,
        messageRank: 1,
      },
    });

    expect(result.isOk()).toBe(true);
    expect(summarizedText).toContain("source before cutoff");
    expect(summarizedText).toContain("source at cutoff");
    expect(summarizedText).not.toContain("source after cutoff");

    const updatedCompactionMessageRow = await CompactionMessageModel.findOne({
      where: {
        id: compactionMessage.compactionMessageId,
        workspaceId: workspace.id,
      },
    });
    expect(updatedCompactionMessageRow?.status).toBe("succeeded");
    expect(updatedCompactionMessageRow?.content).toContain(
      "Summary from source."
    );

    const sourceConversation = await getConversation(
      auth,
      sourceConversationWithoutContent.sId
    );
    expect(sourceConversation.isOk()).toBe(true);
    if (sourceConversation.isErr()) {
      return;
    }

    expect(
      sourceConversation.value.content
        .flat()
        .some((message) => isCompactionMessageType(message))
    ).toBe(false);
  });

  it("rewrites standalone attachment ids in source compaction summaries", async () => {
    const sourceConversationWithoutContent = await ConversationFactory.create(
      auth,
      {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      }
    );

    const compactionMessage = await createCompactionMessage();

    vi.mocked(runMultiActionsAgent).mockImplementationOnce(async () => {
      return new Ok({
        actions: [],
        generation:
          '<analysis>Scratchpad.</analysis><summary>Use file_parent_1, `file_parent_2`, and "cf_parent_1". Keep prefixfile_parent_1suffix unchanged.</summary>',
      });
    });

    const result = await runCompaction(auth, {
      conversationId: conversation.sId,
      compactionMessageId: compactionMessage.sId,
      compactionMessageVersion: compactionMessage.version,
      model: MODEL,
      sourceConversation: {
        conversationId: sourceConversationWithoutContent.sId,
        messageRank: 0,
        attachmentIdReplacements: {
          file_parent_1: "file_child_1",
          file_parent_2: "file_child_2",
          cf_parent_1: "cf_child_1",
        },
      },
    });

    expect(result.isOk()).toBe(true);

    const updatedCompactionMessageRow = await CompactionMessageModel.findOne({
      where: {
        id: compactionMessage.compactionMessageId,
        workspaceId: workspace.id,
      },
    });

    expect(updatedCompactionMessageRow?.content).toContain(
      'Use file_child_1, `file_child_2`, and "cf_child_1". Keep prefixfile_parent_1suffix unchanged.'
    );
    expect(updatedCompactionMessageRow?.content).toContain(
      "Full conversation history before compaction: conversation/history/compaction-"
    );
  });

  it("rewrites standalone attachment ids in source history files", async () => {
    const sourceConversationWithoutContent = await ConversationFactory.create(
      auth,
      {
        agentConfigurationId: agentConfig.sId,
        messagesCreatedAt: [],
      }
    );

    await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: sourceConversationWithoutContent.id,
      rank: 0,
      content:
        "Use file_parent_1, `file_parent_2`, and keep prefixfile_parent_1suffix.",
    });

    const compactionMessage = await createCompactionMessage();

    vi.mocked(runMultiActionsAgent).mockResolvedValueOnce(
      new Ok({
        actions: [],
        generation:
          "<analysis>Scratchpad.</analysis><summary>Summary.</summary>",
      })
    );

    const result = await runCompaction(auth, {
      conversationId: conversation.sId,
      compactionMessageId: compactionMessage.sId,
      compactionMessageVersion: compactionMessage.version,
      model: MODEL,
      sourceConversation: {
        conversationId: sourceConversationWithoutContent.sId,
        messageRank: 0,
        attachmentIdReplacements: {
          file_parent_1: "file_child_1",
          file_parent_2: "file_child_2",
        },
      },
    });

    expect(result.isOk()).toBe(true);

    const createCall = vi.mocked(createGCSMountFile).mock.calls[0];
    const writtenContent = createCall?.[2].content.toString("utf8");
    expect(writtenContent).toContain("file_child_1");
    expect(writtenContent).toContain("file_child_2");
    expect(writtenContent).toContain("prefixfile_parent_1suffix");
    expect(writtenContent).not.toContain("`file_parent_2`");
  });

  it("marks compaction as failed when history file creation fails", async () => {
    const compactionMessage = await createCompactionMessage();
    vi.mocked(createGCSMountFile).mockResolvedValueOnce(
      new Err(new Error("GCS write failed"))
    );
    vi.mocked(runMultiActionsAgent).mockResolvedValueOnce(
      new Ok({
        actions: [],
        generation:
          "<analysis>Scratchpad.</analysis><summary>Summary.</summary>",
      })
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
    expect(compactionMessageRow?.status).toBe("failed");
    expect(compactionMessageRow?.content).toBeNull();
  });
});
