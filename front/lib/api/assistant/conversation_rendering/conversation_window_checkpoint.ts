import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { ConversationWindowStateSnapshot } from "@app/lib/api/assistant/conversation_rendering/checkpointed_window_state";
import { ConversationWindowStateSnapshotSchema } from "@app/lib/api/assistant/conversation_rendering/checkpointed_window_state";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  isGCSNotFoundError,
  isGCSPreconditionFailedError,
} from "@app/lib/file_storage/types";
import type {
  Content,
  ModelMessageTypeMultiActionsWithoutContentFragment,
} from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const CONVERSATION_WINDOW_CHECKPOINT_VERSION = 1 as const;
const CHECKPOINT_MAX_AGE_MS = 55 * 60 * 1000;
const SIGNED_URL_EXPIRY_SAFETY_MARGIN_MS = 5 * 60 * 1000;
const MAX_STORED_CHECKPOINT_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_EXPANDED_CHECKPOINT_SIZE_BYTES = 64 * 1024 * 1024;

const checkpointIdentitySchema = z
  .object({
    workspaceId: z.string(),
    conversationId: z.string(),
    agentMessageId: z.string(),
    agentMessageVersion: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
  })
  .strict();

export type ConversationWindowCheckpointIdentity = z.infer<
  typeof checkpointIdentitySchema
>;

const conversationWindowCheckpointSchema = z
  .object({
    version: z.literal(CONVERSATION_WINDOW_CHECKPOINT_VERSION),
    // Reserved for invalidating cross-message checkpoints after earlier context changes.
    // Same-agent-message schema v1 has no such mutation signal, so the epoch remains zero.
    contextEpoch: z.literal(0),
    identity: checkpointIdentitySchema,
    profileHash: z.string(),
    createdAtMs: z.number().int().nonnegative(),
    validUntilMs: z.number().int().nonnegative(),
    promptTokens: z.number().int().nonnegative(),
    toolDefinitionTokens: z.number().int().nonnegative(),
    missingActionCatcherFunctionCallIds: z.array(z.string()),
    state: ConversationWindowStateSnapshotSchema,
  })
  .strict();

export type ConversationWindowCheckpoint = z.infer<
  typeof conversationWindowCheckpointSchema
>;

function checkpointPath(
  identity: ConversationWindowCheckpointIdentity
): string {
  const component = (value: string | number) =>
    encodeURIComponent(String(value));

  return [
    "conversation-window-checkpoints",
    "w",
    component(identity.workspaceId),
    "conversations",
    component(identity.conversationId),
    "agent-messages",
    component(identity.agentMessageId),
    "versions",
    component(identity.agentMessageVersion),
    "schemas",
    `v${CONVERSATION_WINDOW_CHECKPOINT_VERSION}`,
    "steps",
    `${component(identity.step)}.json`,
  ].join("/");
}

function encodeCheckpoint(checkpoint: ConversationWindowCheckpoint): string {
  const checkpointContent = JSON.stringify(checkpoint);
  if (
    Buffer.byteLength(checkpointContent) > MAX_EXPANDED_CHECKPOINT_SIZE_BYTES
  ) {
    throw new Error("Conversation window checkpoint is too large");
  }

  const content = JSON.stringify({
    encoding: "gzip-base64",
    payload: gzipSync(checkpointContent).toString("base64"),
  });
  if (Buffer.byteLength(content) > MAX_STORED_CHECKPOINT_SIZE_BYTES) {
    throw new Error("Compressed conversation window checkpoint is too large");
  }

  return content;
}

const checkpointEnvelopeSchema = z
  .object({
    encoding: z.literal("gzip-base64"),
    payload: z.string(),
  })
  .strict();

function decodeCheckpoint(
  content: string
): Result<ConversationWindowCheckpoint, Error> {
  if (Buffer.byteLength(content) > MAX_STORED_CHECKPOINT_SIZE_BYTES) {
    return new Err(
      new Error("Compressed conversation window checkpoint is too large")
    );
  }

  const rawEnvelopeResult = safeParseJSON(content);
  if (rawEnvelopeResult.isErr()) {
    return rawEnvelopeResult;
  }

  const envelopeResult = checkpointEnvelopeSchema.safeParse(
    rawEnvelopeResult.value
  );
  if (!envelopeResult.success) {
    return new Err(new Error(fromError(envelopeResult.error).toString()));
  }

  let checkpointContent: string;
  try {
    checkpointContent = gunzipSync(
      Buffer.from(envelopeResult.data.payload, "base64"),
      { maxOutputLength: MAX_EXPANDED_CHECKPOINT_SIZE_BYTES }
    ).toString("utf8");
  } catch (error) {
    return new Err(normalizeError(error));
  }

  const rawCheckpointResult = safeParseJSON(checkpointContent);
  if (rawCheckpointResult.isErr()) {
    return rawCheckpointResult;
  }

  const checkpointResult = conversationWindowCheckpointSchema.safeParse(
    rawCheckpointResult.value
  );
  if (!checkpointResult.success) {
    return new Err(new Error(fromError(checkpointResult.error).toString()));
  }

  return new Ok(checkpointResult.data);
}

function identitiesEqual(
  left: ConversationWindowCheckpointIdentity,
  right: ConversationWindowCheckpointIdentity
): boolean {
  return (
    left.workspaceId === right.workspaceId &&
    left.conversationId === right.conversationId &&
    left.agentMessageId === right.agentMessageId &&
    left.agentMessageVersion === right.agentMessageVersion &&
    left.step === right.step
  );
}

function parseGcsV4SignedUrlExpiryMs(value: string): number | null {
  if (!value.includes("X-Goog-Date=") || !value.includes("X-Goog-Expires=")) {
    return null;
  }

  if (!URL.canParse(value)) {
    return null;
  }
  const url = new URL(value);

  const signedAt = url.searchParams.get("X-Goog-Date");
  const expiresInSeconds = Number(url.searchParams.get("X-Goog-Expires"));
  if (!signedAt || !Number.isFinite(expiresInSeconds)) {
    return null;
  }

  const match = signedAt.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/
  );
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second] = match;
  return (
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    ) +
    expiresInSeconds * 1000
  );
}

function earliestImageSignedUrlExpiryMs(
  state: ConversationWindowStateSnapshot
): number | null {
  let earliestMs: number | null = null;
  const visitContent = (content: Content[]): void => {
    for (const item of content) {
      if (item.type !== "image_url") {
        continue;
      }

      const expiryMs = parseGcsV4SignedUrlExpiryMs(item.image_url.url);
      if (expiryMs !== null && (earliestMs === null || expiryMs < earliestMs)) {
        earliestMs = expiryMs;
      }
    }
  };

  for (const interaction of state.interactions) {
    for (const { message } of interaction.messages) {
      switch (message.role) {
        case "user":
        case "content_fragment":
          visitContent(message.content);
          break;
        case "function":
          if (Array.isArray(message.content)) {
            visitContent(message.content);
          }
          break;
        case "assistant":
        case "compaction":
          break;
        default:
          assertNever(message);
      }
    }
  }

  return earliestMs;
}

// Skill activation is intentionally excluded. Its tool call, result, and instructions are
// model-visible messages in the completed-step delta rather than request-level rendering inputs.
export function computeConversationWindowProfileHash({
  model,
  prompt,
  tools,
  allowedTokenCount,
  leadingMessages,
  excludeActions = false,
  excludeImages = false,
  onMissingAction = "inject-placeholder",
  agentConfigurationId,
}: {
  model: ModelConfigurationType;
  prompt: string;
  tools: string;
  allowedTokenCount: number;
  leadingMessages: ModelMessageTypeMultiActionsWithoutContentFragment[];
  excludeActions?: boolean;
  excludeImages?: boolean;
  onMissingAction?: "inject-placeholder" | "skip";
  agentConfigurationId?: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: CONVERSATION_WINDOW_CHECKPOINT_VERSION,
        model,
        prompt,
        tools,
        allowedTokenCount,
        leadingMessages,
        excludeActions,
        excludeImages,
        onMissingAction,
        agentConfigurationId,
      })
    )
    .digest("hex");
}

export function makeConversationWindowCheckpoint({
  identity,
  profileHash,
  promptTokens,
  toolDefinitionTokens,
  missingActionCatcherFunctionCallIds = [],
  state,
  nowMs = Date.now(),
}: {
  identity: ConversationWindowCheckpointIdentity;
  profileHash: string;
  promptTokens: number;
  toolDefinitionTokens: number;
  missingActionCatcherFunctionCallIds?: string[];
  state: ConversationWindowStateSnapshot;
  nowMs?: number;
}): ConversationWindowCheckpoint {
  const signedUrlExpiryMs = earliestImageSignedUrlExpiryMs(state);
  const maxValidUntilMs = nowMs + CHECKPOINT_MAX_AGE_MS;
  const validUntilMs = signedUrlExpiryMs
    ? Math.min(
        maxValidUntilMs,
        signedUrlExpiryMs - SIGNED_URL_EXPIRY_SAFETY_MARGIN_MS
      )
    : maxValidUntilMs;

  return {
    version: CONVERSATION_WINDOW_CHECKPOINT_VERSION,
    contextEpoch: 0,
    identity,
    profileHash,
    createdAtMs: nowMs,
    validUntilMs,
    promptTokens,
    toolDefinitionTokens,
    missingActionCatcherFunctionCallIds: [
      ...missingActionCatcherFunctionCallIds,
    ].sort(),
    state,
  };
}

export async function loadConversationWindowCheckpoint(
  identity: ConversationWindowCheckpointIdentity,
  { nowMs = Date.now() }: { nowMs?: number } = {}
): Promise<Result<ConversationWindowCheckpoint | null, Error>> {
  const storage = getPrivateUploadBucket();
  let contentBuffer: Uint8Array<ArrayBuffer>;
  try {
    contentBuffer = await storage.fetchFileBuffer(checkpointPath(identity));
  } catch (error) {
    if (isGCSNotFoundError(error)) {
      return new Ok(null);
    }
    return new Err(normalizeError(error));
  }

  const checkpointResult = decodeCheckpoint(
    Buffer.from(contentBuffer).toString("utf8")
  );
  if (checkpointResult.isErr()) {
    return checkpointResult;
  }
  const checkpoint = checkpointResult.value;

  if (
    !identitiesEqual(checkpoint.identity, identity) ||
    checkpoint.validUntilMs <= nowMs
  ) {
    return new Ok(null);
  }
  return new Ok(checkpoint);
}

export async function publishConversationWindowCheckpoint(
  checkpoint: ConversationWindowCheckpoint
): Promise<Result<ConversationWindowCheckpoint, Error>> {
  const storage = getPrivateUploadBucket();
  const filePath = checkpointPath(checkpoint.identity);
  try {
    await storage.uploadSmallRawContentToBucketAsNewFile({
      content: encodeCheckpoint(checkpoint),
      contentType: "application/json",
      filePath,
    });
    return new Ok(checkpoint);
  } catch (error) {
    if (!isGCSPreconditionFailedError(error)) {
      return new Err(normalizeError(error));
    }
  }

  const winnerResult = await loadConversationWindowCheckpoint(
    checkpoint.identity
  );
  if (winnerResult.isErr()) {
    return winnerResult;
  }
  const winner = winnerResult.value;
  if (!winner) {
    return new Err(
      new Error("Conversation window checkpoint winner is unavailable")
    );
  }
  return new Ok(winner);
}
