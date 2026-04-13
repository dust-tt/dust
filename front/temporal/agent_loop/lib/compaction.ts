import type { LLMConfig } from "@app/lib/api/assistant/call_llm";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { updateCompactionMessageWithContentAndFinalStatus } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationAsText } from "@app/lib/api/assistant/conversation/render_as_text";
import { PREVIOUS_INTERACTIONS_TO_PRESERVE } from "@app/lib/api/assistant/conversation_rendering";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type {
  CompactionMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import { isCompactionMessageType } from "@app/types/assistant/conversation";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { SupportedModel } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const COMPACTION_PROMPT = `Your task is to create a detailed summary of the conversation so far, \
paying close attention to the user's explicit requests and the agents' previous actions and \
responses. This summary should be thorough enough that the conversation can continue without \
losing important context.

Before providing your final summary, wrap your analysis in <analysis> tags to organize your \
thoughts and ensure you've covered all necessary points. In your analysis:

1. Chronologically analyze each message in the conversation. For each section identify:
   - The user's explicit requests and intents
   - The agents' approaches to addressing those requests
   - Key decisions and information exchanged
   - Specific details: data, names, references, or artifacts mentioned
   - Any errors or issues encountered and how they were resolved
   - Pay special attention to user feedback and corrections

2. Double-check for accuracy and completeness.

After your analysis, provide your detailed summary in <summary> tags with these sections:

1. **Primary Request and Intent** — All explicit user requests and intents.
2. **Key Topics and Concepts** — Main subjects, domains, or frameworks discussed.
3. **Information Exchanged** — Important data, references, or artifacts shared during the \
conversation.
4. **Key Files and Resources** — Important files, documents, or resources shared in the \
conversation that are useful to the current work.
5. **Issues and Resolutions** — Problems encountered, how they were resolved, and user feedback.
6. **Pending Tasks** — Explicitly requested work that is still pending.
7. **Current State** — What was being discussed or worked on immediately before this summary.

Only the content of the <summary> block will be used to continue the conversation — the <analysis> \
block is a scratchpad and will be discarded. Make sure the summary is self-contained and includes \
all the context needed to continue without access to the original messages.

IMPORTANT: Respond with TEXT ONLY. Do NOT attempt to use any tools. Your entire response must be \
plain text: an <analysis> block followed by a <summary> block.`;

/**
 * Extract the <summary> block from the LLM response, stripping the <analysis> scratchpad.
 */
function extractSummary(generation: string): string {
  const summaryMatch = generation.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryMatch) {
    return summaryMatch[1].trim();
  }
  // Fallback: if no <summary> tags, return the full generation stripped of <analysis>.
  return generation.replace(/<analysis>[\s\S]*?<\/analysis>/g, "").trim();
}

export async function runCompaction(
  auth: Authenticator,
  {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
    model,
  }: {
    conversationId: string;
    compactionMessageId: string;
    compactionMessageVersion: number;
    model: SupportedModel;
  }
): Promise<Result<void, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const conversationRes = await getConversation(
    auth,
    conversationId,
    false,
    null,
    PREVIOUS_INTERACTIONS_TO_PRESERVE + 1 // X previous + the last one
  );
  if (conversationRes.isErr()) {
    return conversationRes;
  }
  const conversation = conversationRes.value;

  let compactionMessage: CompactionMessageType | undefined;

  for (
    let i = conversation.content.length - 1;
    i >= 0 && !compactionMessage;
    i--
  ) {
    const messageGroup = conversation.content[i];
    for (const msg of messageGroup) {
      if (
        isCompactionMessageType(msg) &&
        msg.sId === compactionMessageId &&
        msg.version === compactionMessageVersion
      ) {
        compactionMessage = msg;
        break;
      }
    }
  }

  if (!compactionMessage) {
    return new Err(new Error("Compaction message not found"));
  }

  const summaryRes = await generateCompactionSummary(auth, {
    conversation,
    model,
  });

  let content: string | null;
  let status: "succeeded" | "failed";

  if (summaryRes.isOk()) {
    content = summaryRes.value;
    status = "succeeded";
  } else {
    logger.error(
      {
        workspaceId: owner.sId,
        conversationId,
        compactionMessageId,
        error: summaryRes.error,
      },
      "Compaction generation failed"
    );
    content = null;
    status = "failed";
  }

  const result = await updateCompactionMessageWithContentAndFinalStatus(auth, {
    conversation,
    compactionMessage,
    status,
    content,
  });

  compactionMessage.status = result.status;
  compactionMessage.content = content;

  await publishConversationEvent(
    {
      type: "compaction_message_done",
      created: Date.now(),
      messageId: compactionMessage.sId,
      message: compactionMessage,
    },
    { conversationId }
  );

  logger.info(
    { workspaceId: owner.sId, conversationId, compactionMessageId, status },
    "Compaction completed"
  );

  return new Ok(undefined);
}

async function generateCompactionSummary(
  auth: Authenticator,
  {
    conversation,
    model,
  }: { conversation: ConversationType; model: SupportedModel }
): Promise<Result<string, Error>> {
  const owner = auth.getNonNullableWorkspace();

  // renderConversationAsText stops at the last succeeded compaction boundary by default and skips
  // running agent messages, producing exactly the messages that need to be summarized.
  const renderedMessages = renderConversationAsText(conversation, {
    includeTimestamps: true,
    includeActions: true,
    includeActionDetails: true,
    skipRunningAgentMessages: true,
  });

  // TODO(compaction): Ensure we don't exceeds the model context size here, as we have no guarantee
  // that the current conversation is not exceeding it already.
  // TODO(compaction): We may want to be more mechanical about files available to the model in
  // conversation and projects by including a lsit as part of the summary.

  const conv: ModelConversationTypeMultiActions = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Conversation to summarize:\n\n${renderedMessages}`,
          },
        ],
        name: "",
      },
    ],
  };

  const config: LLMConfig = {
    providerId: model.providerId,
    modelId: model.modelId,
    temperature: 0,
  };

  const res = await runMultiActionsAgent(
    auth,
    config,
    {
      conversation: conv,
      prompt: COMPACTION_PROMPT,
      specifications: [],
    },
    {
      context: {
        operationType: "compaction",
        conversationId: conversation.sId,
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
    }
  );

  if (res.isErr()) {
    return res;
  }

  const generation = res.value.generation;
  if (!generation) {
    return new Err(new Error("Compaction LLM returned empty generation"));
  }

  const summary = extractSummary(generation);
  if (!summary) {
    return new Err(new Error("Compaction LLM returned empty summary"));
  }

  return new Ok(summary);
}
