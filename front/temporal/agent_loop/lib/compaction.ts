import type { LLMConfig } from "@app/lib/api/assistant/call_llm";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { updateCompactionMessageWithContentAndFinalStatus } from "@app/lib/api/assistant/conversation";
import { replaceStandaloneAttachmentIds } from "@app/lib/api/assistant/conversation/compaction_attachment_id_replacements";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationAsText } from "@app/lib/api/assistant/conversation/render_as_text";
import { PREVIOUS_INTERACTIONS_TO_PRESERVE } from "@app/lib/api/assistant/conversation_rendering";
import { publishConversationEvent } from "@app/lib/api/assistant/streaming/events";
import { createGCSMountFile } from "@app/lib/api/files/gcs_mount/files";
import { isProviderWhitelisted } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { CompactionSourceConversation } from "@app/types/assistant/compaction";
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

function filterConversationContentUpToRank(
  conversation: ConversationType,
  maxRank: number
): ConversationType {
  return {
    ...conversation,
    content: conversation.content.filter((versions) => {
      const latestVersion = versions[versions.length - 1];
      return latestVersion ? latestVersion.rank <= maxRank : false;
    }),
  };
}

function findCompactionMessage(
  conversation: ConversationType,
  compactionMessageId: string,
  compactionMessageVersion: number
): CompactionMessageType | undefined {
  for (let i = conversation.content.length - 1; i >= 0; i--) {
    const messageGroup = conversation.content[i];
    for (const msg of messageGroup) {
      if (
        isCompactionMessageType(msg) &&
        msg.sId === compactionMessageId &&
        msg.version === compactionMessageVersion
      ) {
        return msg;
      }
    }
  }

  return undefined;
}

function formatCompactionHistoryTimestamp(date: Date): string {
  return date
    .toISOString()
    .slice(0, 16)
    .replace(/-/g, "")
    .replace("T", "-")
    .replace(":", "");
}

async function createCompactionHistoryFile(
  auth: Authenticator,
  {
    targetConversation,
    sourceConversation,
    compactionMessage,
    renderedMessages,
  }: {
    targetConversation: ConversationType;
    sourceConversation: ConversationType;
    compactionMessage: CompactionMessageType;
    renderedMessages: string;
  }
): Promise<Result<string, Error>> {
  const generatedAt = new Date();
  const relativeFilePath = `history/${formatCompactionHistoryTimestamp(generatedAt)}-compaction-${compactionMessage.sId}.history`;
  const metadataLines = [
    "# Conversation History Before Compaction",
    "",
    `Generated at: ${generatedAt.toISOString()}`,
    `Conversation: ${sourceConversation.sId}`,
    "",
    "## Conversation",
    "",
  ];

  const entryRes = await createGCSMountFile(
    auth,
    { useCase: "conversation", conversationId: targetConversation.sId },
    {
      relativeFilePath,
      content: Buffer.from(
        `${metadataLines.join("\n")}${renderedMessages}`,
        "utf8"
      ),
      contentType: "text/plain",
    }
  );

  if (entryRes.isErr()) {
    return entryRes;
  }
  return new Ok(entryRes.value.path);
}

export async function runCompaction(
  auth: Authenticator,
  {
    conversationId,
    compactionMessageId,
    compactionMessageVersion,
    model,
    sourceConversation,
  }: {
    conversationId: string;
    compactionMessageId: string;
    compactionMessageVersion: number;
    model: SupportedModel;
    sourceConversation?: CompactionSourceConversation;
  }
): Promise<Result<void, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const targetConversationRes = await getConversation(
    auth,
    conversationId,
    false,
    null,
    PREVIOUS_INTERACTIONS_TO_PRESERVE + 1 // X previous + the last one
  );
  if (targetConversationRes.isErr()) {
    return targetConversationRes;
  }
  const targetConversation = targetConversationRes.value;

  const compactionMessage = findCompactionMessage(
    targetConversation,
    compactionMessageId,
    compactionMessageVersion
  );

  if (!compactionMessage) {
    return new Err(new Error("Compaction message not found"));
  }

  if (!isProviderWhitelisted(auth, model.providerId)) {
    return new Err(
      new Error(
        `The model provider ${model.providerId} has been disabled by your workspace admin.`
      )
    );
  }

  let conversationToSummarize = targetConversation;
  if (
    sourceConversation &&
    sourceConversation.conversationId !== conversationId
  ) {
    const sourceConversationRes = await getConversation(
      auth,
      sourceConversation.conversationId,
      false,
      null,
      PREVIOUS_INTERACTIONS_TO_PRESERVE + 1
    );
    if (sourceConversationRes.isErr()) {
      return sourceConversationRes;
    }

    conversationToSummarize = sourceConversationRes.value;
  }

  const summaryRes = await generateCompactionSummary(auth, {
    sourceConversation: conversationToSummarize,
    sourceMessageRank: sourceConversation?.messageRank,
    targetConversation: targetConversation,
    compactionMessage,
    model,
  });

  let content: string | null;
  let status: "succeeded" | "failed";

  if (summaryRes.isOk()) {
    const summary = replaceStandaloneAttachmentIds(
      summaryRes.value.summary,
      sourceConversation?.attachmentIdReplacements
    );
    const renderedMessages = replaceStandaloneAttachmentIds(
      summaryRes.value.renderedMessages,
      sourceConversation?.attachmentIdReplacements
    );

    const historyFileRes = await createCompactionHistoryFile(auth, {
      targetConversation: targetConversation,
      sourceConversation: conversationToSummarize,
      compactionMessage,
      renderedMessages,
    });

    if (historyFileRes.isOk()) {
      content = `${summary}\n\n---\n\nFull conversation history before compaction: ${historyFileRes.value}`;
      status = "succeeded";

      logger.info(
        {
          workspaceId: owner.sId,
          conversationId,
          sourceConversationId: sourceConversation?.conversationId,
          compactionMessageId,
          historyFilePath: historyFileRes.value,
          status,
        },
        "Compaction generation succeeded"
      );
    } else {
      content = null;
      status = "failed";

      logger.error(
        {
          workspaceId: owner.sId,
          conversationId,
          sourceConversationId: sourceConversation?.conversationId,
          compactionMessageId,
          error: historyFileRes.error,
        },
        "Compaction history file creation failed"
      );
    }
  } else {
    content = null;
    status = "failed";

    logger.error(
      {
        workspaceId: owner.sId,
        conversationId,
        sourceConversationId: sourceConversation?.conversationId,
        compactionMessageId,
        error: summaryRes.error,
      },
      "Compaction generation failed"
    );
  }

  const result = await updateCompactionMessageWithContentAndFinalStatus(auth, {
    conversation: targetConversation,
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
    { conversationId: targetConversation.sId }
  );

  return new Ok(undefined);
}

async function generateCompactionSummary(
  auth: Authenticator,
  {
    sourceConversation,
    sourceMessageRank,
    targetConversation,
    compactionMessage,
    model,
  }: {
    sourceConversation: ConversationType;
    sourceMessageRank?: number;
    targetConversation: ConversationType;
    compactionMessage: CompactionMessageType;
    model: SupportedModel;
  }
): Promise<Result<{ summary: string; renderedMessages: string }, Error>> {
  const owner = auth.getNonNullableWorkspace();

  const conversationToSummarize =
    sourceMessageRank === undefined
      ? sourceConversation
      : filterConversationContentUpToRank(
          sourceConversation,
          sourceMessageRank
        );

  // renderConversationAsText stops at the last succeeded compaction boundary by default and skips
  // running agent messages, producing exactly the messages that need to be summarized.
  const renderedMessages = renderConversationAsText(conversationToSummarize, {
    includeTimestamps: true,
    includeActions: true,
    includeActionDetails: true,
    skipRunningAgentMessages: true,
  });

  // TODO(compaction): Ensure we don't exceeds the model context size here, as we have no guarantee
  // that the current conversation is not exceeding it already.
  // TODO(compaction): We may want to be more mechanical about files available to the model in
  // conversation and projects by including a list as part of the summary.
  // TODO(compaction: We may want to add retries around the LLM call

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
        conversationId: targetConversation.sId,
        userId: auth.user()?.sId,
        workspaceId: owner.sId,
      },
      onRunId: async (runId) => {
        await ConversationResource.updateCompactionMessageRunIds(auth, {
          compactionMessageModelId: compactionMessage.compactionMessageId,
          runIds: [runId],
        });
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

  return new Ok({ summary, renderedMessages });
}
