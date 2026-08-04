import { projectConversationForIsolatedRun } from "@app/lib/api/assistant/conversation_rendering/execution_projection";
import { renderAllMessages } from "@app/lib/api/assistant/conversation_rendering/message_rendering";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentMessageType,
  CompactionMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `getSteps` and `renderContentFragment` load agent step contents and file bodies from the
// database. Everything else in the render path (user messages, other-agent messages, compaction
// summaries) is pure and runs for real, which is what carries the message content these tests
// assert on.
vi.mock(import("./helpers"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSteps: vi.fn(),
    renderContentFragment: vi.fn(),
  };
});

import { getSteps, renderContentFragment } from "./helpers";

// Unique canaries, one per provenance category the isolation boundary has to separate.
const CANARY = {
  preUserMessage: "CANARY_PRE_USER_MESSAGE_a1",
  preAgentAnswer: "CANARY_PRE_AGENT_ANSWER_b2",
  preToolResult: "CANARY_PRE_TOOL_RESULT_c3",
  preReasoning: "CANARY_PRE_REASONING_d4",
  preContentFragment: "CANARY_PRE_CONTENT_FRAGMENT_e5",
  compactionSummary: "CANARY_COMPACTION_SUMMARY_f6",
  conversationTitle: "CANARY_CONVERSATION_TITLE_g7",
  otherAgentAnswer: "CANARY_OTHER_AGENT_ANSWER_h8",
  markedUserMessage: "CANARY_MARKED_USER_MESSAGE_i9",
  markedAttachment: "CANARY_MARKED_ATTACHMENT_j0",
  sameRunToolResult: "CANARY_SAME_RUN_TOOL_RESULT_k1",
  sameRunReasoning: "CANARY_SAME_RUN_REASONING_l2",
  nextUserMessage: "CANARY_NEXT_USER_MESSAGE_m3",
} as const;

const PRE_BOUNDARY_CANARIES = [
  CANARY.preUserMessage,
  CANARY.preAgentAnswer,
  CANARY.preToolResult,
  CANARY.preReasoning,
  CANARY.preContentFragment,
  CANARY.compactionSummary,
  CANARY.conversationTitle,
  CANARY.otherAgentAnswer,
];

// Walks every string reachable from an arbitrary value. Assertions run on the whole serialized
// artifact rather than on a hand-picked field, so a leak through a nested payload (tool
// `runContext`, replay placeholders, provider passthrough blocks, nested-agent arguments) fails
// the test too.
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, out);
    }
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      collectStrings(item, out);
    }
  }
  return out;
}

function expectAbsent(value: unknown, canaries: readonly string[]) {
  const strings = collectStrings(value);
  for (const canary of canaries) {
    expect(
      strings.some((s) => s.includes(canary)),
      `expected ${canary} to be absent`
    ).toBe(false);
  }
}

function expectPresent(value: unknown, canaries: readonly string[]) {
  const strings = collectStrings(value);
  for (const canary of canaries) {
    expect(
      strings.some((s) => s.includes(canary)),
      `expected ${canary} to be present`
    ).toBe(true);
  }
}

function userMessage({
  rank,
  content,
  sId,
  conversationContextMode = "full",
}: {
  rank: number;
  content: string;
  sId: string;
  conversationContextMode?: UserMessageType["conversationContextMode"];
}): UserMessageType {
  return {
    id: rank + 1,
    created: 1_700_000_000_000 + rank,
    type: "user_message",
    sId,
    visibility: "visible",
    version: 0,
    rank,
    branchId: null,
    user: null,
    mentions: [],
    richMentions: [],
    content,
    context: {
      username: "testuser",
      timezone: "UTC",
      fullName: null,
      email: null,
      profilePictureUrl: null,
      origin: "web",
    },
    reactions: [],
    requestedModel: null,
    conversationContextMode,
  };
}

function agentMessage({
  rank,
  sId,
  parentMessageId,
  content,
  agentName = "TestAgent",
  conversationContextMode = "full",
  contextIsolationRootRank = null,
}: {
  rank: number;
  sId: string;
  parentMessageId: string;
  content: string;
  agentName?: string;
  conversationContextMode?: AgentMessageType["conversationContextMode"];
  contextIsolationRootRank?: number | null;
}): AgentMessageType {
  return {
    id: rank + 1,
    agentMessageId: rank + 1,
    created: 1_700_000_000_000 + rank,
    completedTs: null,
    type: "agent_message",
    sId,
    visibility: "visible",
    version: 0,
    rank,
    branchId: null,
    parentMessageId,
    parentAgentMessageId: null,
    status: "succeeded",
    content,
    chainOfThought: null,
    error: null,
    configuration: {
      sId: `agent_config_${agentName}`,
      name: agentName,
      pictureUrl: "",
      status: "active",
      canRead: true,
    } as AgentMessageType["configuration"],
    skipToolsValidation: false,
    actions: [],
    contents: [],
    modelInteractionDurationMs: null,
    completionDurationMs: null,
    richMentions: [],
    reactions: [],
    costCredits: null,
    resolvedModel: null,
    modelResolutionMethod: null,
    conversationContextMode,
    contextIsolationRootRank,
  };
}

function contentFragment({
  rank,
  sId,
  title,
}: {
  rank: number;
  sId: string;
  title: string;
}): ContentFragmentType {
  return {
    id: rank + 1,
    sId,
    created: 1_700_000_000_000 + rank,
    type: "content_fragment",
    visibility: "visible",
    version: 0,
    rank,
    title,
  } as unknown as ContentFragmentType;
}

function compactionMessage({
  rank,
  sId,
  content,
}: {
  rank: number;
  sId: string;
  content: string;
}): CompactionMessageType {
  return {
    id: rank + 1,
    compactionMessageId: rank + 1,
    created: 1_700_000_000_000 + rank,
    type: "compaction_message",
    sId,
    visibility: "visible",
    version: 0,
    rank,
    branchId: null,
    status: "succeeded",
    content,
  } as unknown as CompactionMessageType;
}

const MARKED_AGENT_MESSAGE_ID = "agent_msg_marked";
const MARKED_USER_MESSAGE_RANK = 7;

/**
 * Short, unpruned fixture reproducing a full conversation:
 *
 *   rank 0  compaction (summary of even earlier turns)
 *   rank 1  content fragment attached to the earlier user message
 *   rank 2  earlier user message
 *   rank 3  earlier agent answer (tool result + reasoning live in its steps)
 *   rank 4  earlier answer from a *different* agent
 *   rank 6  content fragment attached to the marked message
 *   rank 7  M, the marked user message
 *   rank 8  M's agent message (the isolated run)
 *   rank 9  N, the next ordinary user message
 *   rank 10 N's agent message
 */
function buildConversation(): ConversationType {
  return {
    id: 1,
    sId: "conv_1",
    created: 1_700_000_000_000,
    title: CANARY.conversationTitle,
    visibility: "unlisted",
    depth: 0,
    owner: { sId: "ws_1" } as ConversationType["owner"],
    metadata: {},
    content: [
      [
        compactionMessage({
          rank: 0,
          sId: "compaction_0",
          content: CANARY.compactionSummary,
        }),
      ],
      [
        contentFragment({
          rank: 1,
          sId: "cf_pre",
          title: CANARY.preContentFragment,
        }),
      ],
      [
        userMessage({
          rank: 2,
          sId: "user_msg_pre",
          content: CANARY.preUserMessage,
        }),
      ],
      [
        agentMessage({
          rank: 3,
          sId: "agent_msg_pre",
          parentMessageId: "user_msg_pre",
          content: CANARY.preAgentAnswer,
        }),
      ],
      [
        agentMessage({
          rank: 4,
          sId: "agent_msg_other",
          parentMessageId: "user_msg_pre",
          content: CANARY.otherAgentAnswer,
          agentName: "OtherAgent",
        }),
      ],
      [
        contentFragment({
          rank: 6,
          sId: "cf_marked",
          title: CANARY.markedAttachment,
        }),
      ],
      [
        userMessage({
          rank: MARKED_USER_MESSAGE_RANK,
          sId: "user_msg_marked",
          content: CANARY.markedUserMessage,
          conversationContextMode: "isolated",
        }),
      ],
      [
        agentMessage({
          rank: 8,
          sId: MARKED_AGENT_MESSAGE_ID,
          parentMessageId: "user_msg_marked",
          content: "Marked answer",
          conversationContextMode: "isolated",
          contextIsolationRootRank: MARKED_USER_MESSAGE_RANK,
        }),
      ],
      [
        userMessage({
          rank: 9,
          sId: "user_msg_next",
          content: CANARY.nextUserMessage,
        }),
      ],
      [
        agentMessage({
          rank: 10,
          sId: "agent_msg_next",
          parentMessageId: "user_msg_next",
          content: "Next answer",
        }),
      ],
    ],
  } as unknown as ConversationType;
}

function findAgentMessage(
  conversation: ConversationType,
  sId: string
): AgentMessageType {
  for (const versions of conversation.content) {
    for (const message of versions) {
      if (message.sId === sId && message.type === "agent_message") {
        return message;
      }
    }
  }
  throw new Error(`agent message ${sId} not found`);
}

function findUserMessage(
  conversation: ConversationType,
  sId: string
): UserMessageType {
  for (const versions of conversation.content) {
    for (const message of versions) {
      if (message.sId === sId && message.type === "user_message") {
        return message;
      }
    }
  }
  throw new Error(`user message ${sId} not found`);
}

describe("projectConversationForIsolatedRun", () => {
  it("keeps the marked message, its attachment and its run, and drops everything before", () => {
    const conversation = buildConversation();

    const res = projectConversationForIsolatedRun(conversation, {
      agentMessage: findAgentMessage(conversation, MARKED_AGENT_MESSAGE_ID),
      userMessage: findUserMessage(conversation, "user_msg_marked"),
      contextIsolationRootRank: MARKED_USER_MESSAGE_RANK,
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      throw res.error;
    }

    // The projected conversation is what `run_model.ts` renders and what `run_tool.ts` hands to
    // `executeToolStreaming` as `runContext.conversation`, so a deep scan of it covers the tool
    // context, nested-agent arguments and every other consumer at once.
    expectAbsent(res.value, PRE_BOUNDARY_CANARIES);
    expectPresent(res.value, [
      CANARY.markedUserMessage,
      CANARY.markedAttachment,
    ]);

    expect(res.value.content.map((versions) => versions[0].rank)).toEqual([
      6, 7, 8, 9, 10,
    ]);
  });

  it("never mutates the source conversation", () => {
    const conversation = buildConversation();
    const before = JSON.stringify(conversation);

    projectConversationForIsolatedRun(conversation, {
      agentMessage: findAgentMessage(conversation, MARKED_AGENT_MESSAGE_ID),
      userMessage: findUserMessage(conversation, "user_msg_marked"),
      contextIsolationRootRank: MARKED_USER_MESSAGE_RANK,
    });

    expect(JSON.stringify(conversation)).toEqual(before);
  });

  it("drops the conversation title, which is derived from earlier messages", () => {
    const conversation = buildConversation();

    const res = projectConversationForIsolatedRun(conversation, {
      agentMessage: findAgentMessage(conversation, MARKED_AGENT_MESSAGE_ID),
      userMessage: findUserMessage(conversation, "user_msg_marked"),
      contextIsolationRootRank: MARKED_USER_MESSAGE_RANK,
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      throw res.error;
    }
    expect(res.value.title).toBeNull();
  });

  it("keeps the boundary at the isolation root for a handover that inherits it", () => {
    const conversation = buildConversation();
    // A same-conversation handover: the child agent message sits after M's run and inherits M's
    // root rank, so the parent run's post-boundary state stays visible.
    const handoverAgentMessage = agentMessage({
      rank: 10,
      sId: "agent_msg_next",
      parentMessageId: "user_msg_next",
      content: "Next answer",
      conversationContextMode: "isolated",
      contextIsolationRootRank: MARKED_USER_MESSAGE_RANK,
    });
    conversation.content[conversation.content.length - 1] = [
      handoverAgentMessage,
    ];

    const res = projectConversationForIsolatedRun(conversation, {
      agentMessage: handoverAgentMessage,
      userMessage: findUserMessage(conversation, "user_msg_next"),
      contextIsolationRootRank: MARKED_USER_MESSAGE_RANK,
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      throw res.error;
    }
    expectAbsent(res.value, PRE_BOUNDARY_CANARIES);
    // Parent-run state after the boundary is retained.
    expectPresent(res.value, [CANARY.markedUserMessage]);
  });

  it("fails closed when the isolation root is missing", () => {
    const conversation = buildConversation();

    const res = projectConversationForIsolatedRun(conversation, {
      agentMessage: findAgentMessage(conversation, MARKED_AGENT_MESSAGE_ID),
      userMessage: findUserMessage(conversation, "user_msg_marked"),
      contextIsolationRootRank: null,
    });

    expect(res.isErr()).toBe(true);
    if (res.isOk()) {
      throw new Error("expected an error");
    }
    expect(res.error.type).toEqual("missing_isolation_root");
  });

  it("fails closed when the isolation root is after the run's own message", () => {
    const conversation = buildConversation();

    const res = projectConversationForIsolatedRun(conversation, {
      agentMessage: findAgentMessage(conversation, MARKED_AGENT_MESSAGE_ID),
      userMessage: findUserMessage(conversation, "user_msg_marked"),
      contextIsolationRootRank: MARKED_USER_MESSAGE_RANK + 1,
    });

    expect(res.isErr()).toBe(true);
    if (res.isOk()) {
      throw new Error("expected an error");
    }
    expect(res.error.type).toEqual("isolation_root_after_run");
  });

  it("fails closed when the run's own agent message is not in the conversation", () => {
    const conversation = buildConversation();
    const orphanAgentMessage = agentMessage({
      rank: 99,
      sId: "agent_msg_orphan",
      parentMessageId: "user_msg_marked",
      content: "Orphan",
      conversationContextMode: "isolated",
      contextIsolationRootRank: MARKED_USER_MESSAGE_RANK,
    });

    const res = projectConversationForIsolatedRun(conversation, {
      agentMessage: orphanAgentMessage,
      userMessage: findUserMessage(conversation, "user_msg_marked"),
      contextIsolationRootRank: MARKED_USER_MESSAGE_RANK,
    });

    expect(res.isErr()).toBe(true);
    if (res.isOk()) {
      throw new Error("expected an error");
    }
    expect(res.error.type).toEqual("empty_projection");
  });
});

describe("rendered model input for an isolated run", () => {
  let auth: Authenticator;
  let model: ModelConfigurationType;

  beforeEach(() => {
    vi.clearAllMocks();

    auth = {} as Authenticator;
    model = {
      providerId: "openai",
      modelId: "gpt-4",
    } as unknown as ModelConfigurationType;

    // Each agent message renders one step carrying its own content plus a same-run tool result and
    // reasoning item, so the pre-boundary agent's tool/reasoning canaries flow through the same
    // code path as the marked run's.
    vi.mocked(getSteps).mockImplementation(async (_auth, { message }) => {
      const isPreBoundary = message.sId === "agent_msg_pre";
      return [
        {
          contents: [
            {
              type: "reasoning",
              value: {
                reasoning: isPreBoundary
                  ? CANARY.preReasoning
                  : CANARY.sameRunReasoning,
                metadata: null,
                provider: "openai",
                tokens: 1,
              },
            },
            { type: "text_content", value: message.content ?? "" },
          ],
          actions: [
            {
              call: {
                id: `call_${message.sId}`,
                name: "some_tool",
                arguments: "{}",
              },
              result: {
                role: "function",
                function_call_id: `call_${message.sId}`,
                name: "some_tool",
                content: isPreBoundary
                  ? CANARY.preToolResult
                  : CANARY.sameRunToolResult,
              },
              enabledSkillMessages: [],
            },
          ],
        },
      ] as unknown as Awaited<ReturnType<typeof getSteps>>;
    });

    vi.mocked(renderContentFragment).mockImplementation(async (_auth, m) => ({
      role: "content_fragment" as const,
      name: "attachment",
      content: [
        { type: "text" as const, text: `<attachment title="${m.title}" />` },
      ],
    }));
  });

  const agentConfiguration = {
    sId: "agent_config_TestAgent",
  } as Parameters<typeof renderAllMessages>[1]["agentConfiguration"];

  it("contains no conversation-derived item that predates the marked message", async () => {
    const conversation = buildConversation();
    const projectionRes = projectConversationForIsolatedRun(conversation, {
      agentMessage: findAgentMessage(conversation, MARKED_AGENT_MESSAGE_ID),
      userMessage: findUserMessage(conversation, "user_msg_marked"),
      contextIsolationRootRank: MARKED_USER_MESSAGE_RANK,
    });
    if (projectionRes.isErr()) {
      throw projectionRes.error;
    }

    const rendered = await renderAllMessages(auth, {
      conversation: projectionRes.value,
      model,
      onMissingAction: "inject-placeholder",
      agentConfiguration,
      enabledSkills: [],
    });

    expectAbsent(rendered, PRE_BOUNDARY_CANARIES);
    expectPresent(rendered, [
      CANARY.markedUserMessage,
      CANARY.markedAttachment,
      CANARY.sameRunToolResult,
      CANARY.sameRunReasoning,
    ]);
  });

  it("renders the whole conversation in full mode (regression)", async () => {
    const conversation = buildConversation();

    const rendered = await renderAllMessages(auth, {
      conversation,
      model,
      onMissingAction: "inject-placeholder",
      agentConfiguration,
      enabledSkills: [],
    });

    // Compaction is a budget mechanism, not the isolation mechanism: in full mode it still sets
    // the rendering boundary, and everything from the compaction onward is present.
    expectPresent(rendered, [
      CANARY.compactionSummary,
      CANARY.preContentFragment,
      CANARY.preUserMessage,
      CANARY.preAgentAnswer,
      CANARY.preToolResult,
      CANARY.preReasoning,
      CANARY.otherAgentAnswer,
      CANARY.markedUserMessage,
      CANARY.markedAttachment,
      CANARY.nextUserMessage,
    ]);
  });

  it("gives the next ordinary message the full conversation again, isolated exchange included", async () => {
    const conversation = buildConversation();
    const nextAgentMessage = findAgentMessage(conversation, "agent_msg_next");

    expect(nextAgentMessage.conversationContextMode).toEqual("full");
    expect(nextAgentMessage.contextIsolationRootRank).toBeNull();

    const rendered = await renderAllMessages(auth, {
      conversation,
      model,
      onMissingAction: "inject-placeholder",
      agentConfiguration,
      enabledSkills: [],
    });

    // Both halves of the requirement in one assertion: the pre-M history is back, and so is the
    // isolated exchange. Isolation left no persistent boundary behind.
    expectPresent(rendered, [
      CANARY.preUserMessage,
      CANARY.preAgentAnswer,
      CANARY.markedUserMessage,
      CANARY.sameRunToolResult,
      CANARY.nextUserMessage,
    ]);
  });
});
