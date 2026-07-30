/** Shared token accounting and tool-result pruning helpers. */
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_CAT_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import type { Interaction } from "@app/lib/api/assistant/conversation/interactions";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
import { isImageContent } from "@app/types/assistant/generation";

const PRUNED_TOOL_RESULT_PLACEHOLDER =
  "<dust_system>" +
  "This tool result is no longer available (pruned to prevent context window overflow)." +
  "</dust_system>";
const PRUNED_TOOL_RESULT_TOKENS = 24;

// Fixed number of tokens assumed for image contents during message tokenization.
export const IMAGE_CONTENT_TOKEN_COUNT = 3_100;

// Fixed token estimate for the text that replaces a pruned image preview, covering the
// placeholder sentence and the recovery hint with its file path.
export const PRUNED_IMAGE_PREVIEW_TOKENS = 128;

const FILES_CAT_TOOL_NAME = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_CAT_ACTION_NAME
);

// Pruning advances through history in batches of this size, not message by message. Every move
// of the pruning frontier invalidates the provider cache from that point on. Moving it for a
// handful of tokens costs more than it saves, so it only moves once a batch has accumulated.
// Flat rather than a percentage of contextSize since no model in our fleet sits between 16k-64k
// tokens. Starting point, tune against production cache-miss metrics.
export const PRUNING_CHECKPOINT_TOKENS = 20_000;

export type MessageWithTokens = ModelMessageTypeMultiActions & {
  tokenCount: number;
};

export type InteractionWithTokens = Interaction<MessageWithTokens>;

/** Turns a function-role message into the pruned placeholder. */
export function pruneToolResultMessage(
  message: Extract<MessageWithTokens, { role: "function" }>
): Extract<MessageWithTokens, { role: "function" }> {
  return {
    ...message,
    content: PRUNED_TOOL_RESULT_PLACEHOLDER,
    tokenCount: PRUNED_TOOL_RESULT_TOKENS,
  };
}

/** Replaces one image preview inside a tool result with an explanatory text placeholder. */
export function pruneToolResultImagePreview(
  message: Extract<MessageWithTokens, { role: "function" }>,
  contentIndex: number,
  maxInputImages: number
): Extract<MessageWithTokens, { role: "function" }> {
  if (!Array.isArray(message.content)) {
    return message;
  }

  const content = [...message.content];
  const preview = content[contentIndex];
  const filePath = isImageContent(preview) ? preview.file_path : undefined;
  content[contentIndex] = {
    type: "text" as const,
    text:
      `[This image preview is no longer displayed because the conversation exceeds the ${maxInputImages}-image limit.` +
      (filePath
        ? ` Use \`${FILES_CAT_TOOL_NAME}\` with path \`${filePath}\` to display it again.]`
        : " Re-run the tool to display it again.]"),
  };

  return {
    ...message,
    content,
    tokenCount: Math.max(
      message.tokenCount -
        IMAGE_CONTENT_TOKEN_COUNT +
        PRUNED_IMAGE_PREVIEW_TOKENS,
      0
    ),
  };
}

/** Total tokens across an interaction's messages. */
export function getInteractionTokenCount(
  interaction: InteractionWithTokens
): number {
  return interaction.messages.reduce((sum, msg) => sum + msg.tokenCount, 0);
}

/** Total tokens across every interaction in the array. */
export function sumInteractionTokens(
  interactions: InteractionWithTokens[]
): number {
  return interactions.reduce(
    (sum, interaction) => sum + getInteractionTokenCount(interaction),
    0
  );
}

/** Tokens removed by replacing a tool result with the pruning placeholder. */
export function getToolResultTokenSavings(message: MessageWithTokens): number {
  return message.role === "function"
    ? Math.max(message.tokenCount - PRUNED_TOOL_RESULT_TOKENS, 0)
    : 0;
}
