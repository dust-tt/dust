import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ConversationContextMode } from "@app/types/assistant/conversation_context_mode";
import { isContentFragmentType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Raised when an isolated run cannot prove its own boundary. Isolation fails closed: rather than
 * silently picking a policy and risking the run seeing material it must not see, the loop surfaces
 * an error.
 */
export class ExecutionProjectionError extends Error {
  readonly type:
    | "missing_isolation_root"
    | "isolation_root_after_run"
    | "empty_projection";

  constructor(
    type: ExecutionProjectionError["type"],
    details: Record<string, unknown>
  ) {
    super(
      `Cannot build isolated execution projection (${type}): ${JSON.stringify(details)}`
    );
    this.type = type;
  }
}

/**
 * The provider-agnostic projection of a conversation for one agent run.
 *
 * Everything the agent loop consumes downstream — model prompt construction, conversation
 * rendering, attachment listing, JIT servers, tool `runContext`, nested-agent arguments — reads
 * this conversation and nothing else, so the boundary is applied exactly once, at the single point
 * where the run's data is resolved (`getAgentLoopDataWithAuth`).
 *
 * Allowed provenance in "isolated" mode:
 *   - Dust platform/safety instructions and the agent configuration's own instructions (they never
 *     come from `conversation.content`);
 *   - configuration-derived capabilities (equipped/system/conversation-enabled Skills, selected
 *     Spaces, toolsets) which are read from their own persisted tables, not from messages;
 *   - the initiating user message, its mentions and the content fragments attached to it;
 *   - every model, tool, approval, reasoning and steering item produced by this same run.
 *
 * Forbidden provenance in "isolated" mode (all of it lives at a rank strictly below the isolation
 * root, so a single rank cut removes it): earlier user and agent messages and their versions,
 * earlier tool calls/results/reasoning, earlier content fragments, compaction messages and the
 * summaries they carry, and the conversation title, which is derived from earlier messages.
 */
export type AgentRunExecutionProjection = {
  conversationContextMode: ConversationContextMode;
  conversation: ConversationType;
};

/**
 * Builds the isolated projection of `conversation` for the run rooted at `contextIsolationRootRank`.
 *
 * The cut is a pure rank filter, which is what makes it stable across activity retries, worker
 * restarts and differently-sized conversation windows: the root rank is snapshotted on the agent
 * message row at creation time and never recomputed from the live conversation.
 *
 * Content fragments are ranked strictly below the user message they belong to, so the contiguous
 * run of fragments immediately preceding the root is kept. That is the same association the
 * transcript and `renderConversationForModel` already use to attach fragments to their user
 * message (`getRelatedContentFragments`); using anything else here would render the initiating
 * message without its own attachments.
 *
 * The returned conversation is a fresh object with a fresh `content` array: the caller's
 * conversation is never mutated, and the downstream slicer can keep operating on its own copy.
 */
export function projectConversationForIsolatedRun(
  conversation: ConversationType,
  {
    agentMessage,
    userMessage,
    contextIsolationRootRank,
  }: {
    agentMessage: AgentMessageType;
    userMessage: UserMessageType;
    contextIsolationRootRank: number | null;
  }
): Result<ConversationType, ExecutionProjectionError> {
  const details = {
    conversationId: conversation.sId,
    agentMessageId: agentMessage.sId,
    agentMessageVersion: agentMessage.version,
    userMessageId: userMessage.sId,
    userMessageVersion: userMessage.version,
    contextIsolationRootRank,
  };

  if (contextIsolationRootRank === null) {
    return new Err(
      new ExecutionProjectionError("missing_isolation_root", details)
    );
  }

  if (contextIsolationRootRank > userMessage.rank) {
    return new Err(
      new ExecutionProjectionError("isolation_root_after_run", details)
    );
  }

  // First group at or after the boundary. When the root is older than the loaded window this
  // lands on the window's first group, which is already entirely after the root — the cut is a
  // no-op and nothing pre-boundary can be present. The agent message of this very run always sits
  // at a rank above the root, so a `-1` here means the run's own messages are missing from the
  // conversation and the boundary cannot be proven.
  const rootIndex = conversation.content.findIndex((versions) =>
    versions.some((message) => message.rank >= contextIsolationRootRank)
  );
  if (rootIndex === -1) {
    return new Err(new ExecutionProjectionError("empty_projection", details));
  }

  const startIndex = includePrecedingContentFragments(
    conversation,
    rootIndex,
    contextIsolationRootRank
  );

  // Fresh outer object and fresh outer array: the caller's conversation is never mutated, so a
  // full-mode read of the same underlying data is unaffected. Version groups and message objects
  // are shared with the source conversation, which is itself resolved per call (`getConversation`,
  // or a Redis-cached value that is JSON round-tripped on every read); the downstream slicer
  // rebuilds `content` rather than mutating groups in place, so it behaves exactly as in full mode.
  const content = conversation.content.slice(startIndex);

  const hasRunMessages = content.some((versions) =>
    versions.some((message) => message.sId === agentMessage.sId)
  );
  if (!hasRunMessages) {
    return new Err(new ExecutionProjectionError("empty_projection", details));
  }

  return new Ok({
    ...conversation,
    // Derived from the messages that precede the boundary, so it must not reach the run.
    title: null,
    content,
  });
}

/**
 * Walks backwards from the isolation root over the contiguous run of content fragments that belong
 * to it — the fragments at ranks `rootRank - 1`, `rootRank - 2`, … with no gap.
 */
function includePrecedingContentFragments(
  conversation: ConversationType,
  rootIndex: number,
  rootRank: number
): number {
  let startIndex = rootIndex;
  let expectedRank = rootRank - 1;

  for (let index = rootIndex - 1; index >= 0; index--) {
    const versions = conversation.content[index];
    const message = versions[versions.length - 1];

    if (!message || !isContentFragmentType(message)) {
      break;
    }
    if (message.rank !== expectedRank) {
      break;
    }

    startIndex = index;
    expectedRank -= 1;
  }

  return startIndex;
}
