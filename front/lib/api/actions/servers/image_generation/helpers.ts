import type { Part } from "@google/genai";
import { createPartFromUri, GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { dustManagedCredentials } from "@app/types/api/credentials";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { fileSizeToHumanReadable, MAX_FILE_SIZES } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";

const GEMINI_SUPPORTED_IMAGE_TYPES = [
  "image/bmp",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type GeminiSupportedImageType = (typeof GEMINI_SUPPORTED_IMAGE_TYPES)[number];

function isGeminiSupportedImageType(
  contentType: string
): contentType is GeminiSupportedImageType {
  return GEMINI_SUPPORTED_IMAGE_TYPES.some((type) => type === contentType);
}

export const IMAGE_GENERATION_RATE_LIMITER_KEY = "image_generation";
export const IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS = 60 * 60 * 24 * 7; // 1 week.

export const DEFAULT_IMAGE_OUTPUT_FORMAT = "png";
export const DEFAULT_IMAGE_MIME_TYPE = "image/png";

// Token pricing is expressed as cost per million tokens (micro-USD per token)
const MICRO_USD_PER_USD = 1_000_000;

export const QUALITY_TO_IMAGE_SIZE: Record<string, string> = {
  low: "1K",
  medium: "2K",
  high: "4K",
};

const GeminiInlineDataPartSchema = z.object({
  inlineData: z.object({
    data: z.string(),
    mimeType: z.string().optional(),
  }),
});

export type GeminiInlineDataPart = z.infer<typeof GeminiInlineDataPartSchema>;

export function isValidGeminiInlineDataPart(
  part: unknown
): part is GeminiInlineDataPart {
  return GeminiInlineDataPartSchema.safeParse(part).success;
}

export function computeImageGenerationCostDetails(usageMetadata: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  costDetails: {
    input: number;
    output: number;
    total: number;
  };
} {
  const inputTokens = usageMetadata.promptTokenCount ?? 0;
  const outputTokens = usageMetadata.candidatesTokenCount ?? 0;
  const totalTokens = inputTokens + outputTokens;

  const totalCostMicroUsd = computeTokensCostForUsageInMicroUsd({
    modelId: GEMINI_3_PRO_IMAGE_MODEL_ID,
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    cachedTokens: null,
    cacheCreationTokens: null,
  });

  const costUsd = totalCostMicroUsd / MICRO_USD_PER_USD;

  const inputCostUsd =
    totalTokens > 0 ? (costUsd * inputTokens) / totalTokens : 0;
  const outputCostUsd =
    totalTokens > 0 ? (costUsd * outputTokens) / totalTokens : 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    costDetails: {
      input: inputCostUsd,
      output: outputCostUsd,
      total: costUsd,
    },
  };
}

export async function sendImageProgressNotification(
  sendNotification: (
    notification: MCPProgressNotificationType
  ) => Promise<void>,
  progressToken: string | number | undefined,
  label: string
): Promise<void> {
  if (!progressToken) {
    return;
  }

  const notification: MCPProgressNotificationType = {
    method: "notifications/progress",
    params: {
      progress: 0,
      total: 1,
      progressToken,
      _meta: {
        data: {
          label,
          output: {
            type: "image",
            mimeType: DEFAULT_IMAGE_MIME_TYPE,
          },
        },
      },
    },
  };

  await sendNotification(notification);
}

export async function checkImageGenerationRateLimit(
  auth: Authenticator,
  workspace: { sId: string }
): Promise<Ok<void> | Err<MCPError>> {
  const { limits } = auth.getNonNullablePlan();
  const { maxImagesPerWeek } = limits.capabilities.images;

  const remaining = await rateLimiter({
    key: `${IMAGE_GENERATION_RATE_LIMITER_KEY}_${workspace.sId}`,
    maxPerTimeframe: maxImagesPerWeek,
    timeframeSeconds: IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS,
    logger,
  });

  if (remaining <= 0) {
    const statsDClient = getStatsDClient();
    statsDClient.increment("tools.image_generation.rate_limit_hit", 1, [
      "provider:gemini",
    ]);

    return new Err(
      new MCPError(
        `Rate limit of ${maxImagesPerWeek} requests per week exceeded. Contact your ` +
          "administrator to increase the limit.",
        {
          tracked: false,
        }
      )
    );
  }

  return new Ok(undefined);
}

export function validateGeminiImageResponse(
  response: {
    candidates?: Array<{
      content?: {
        parts?: unknown[];
      };
    }>;
    promptFeedback?: {
      blockReason?: string;
      safetyRatings?: unknown;
    };
  },
  operationType: "generation" | "editing",
  promptText: string
): Ok<GeminiInlineDataPart[]> | Err<MCPError> {
  if (!response.candidates || response.candidates.length === 0) {
    if (response.promptFeedback?.blockReason) {
      logger.error(
        {
          blockReason: response.promptFeedback.blockReason,
          safetyRatings: response.promptFeedback.safetyRatings,
          prompt: promptText,
        },
        `Gemini image ${operationType}: Prompt blocked by safety filters`
      );
      return new Err(
        new MCPError(
          `Image ${operationType} blocked by safety filters: ${response.promptFeedback.blockReason}`
        )
      );
    }
    return new Err(new MCPError("No image generated."));
  }

  const content = response.candidates[0].content;
  if (!content || !content.parts) {
    return new Err(new MCPError("No image data in response"));
  }

  const imageParts = content.parts.filter(isValidGeminiInlineDataPart);
  if (imageParts.length === 0) {
    return new Err(new MCPError("No image data in response."));
  }

  return new Ok(imageParts);
}

export function trackGeminiTokenUsage(
  response: {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  },
  statsDClient: ReturnType<typeof getStatsDClient>
): void {
  statsDClient.increment(
    "tools.image_generation.usage.input_tokens",
    response.usageMetadata?.promptTokenCount ?? 0,
    ["provider:gemini"]
  );
  statsDClient.increment(
    "tools.image_generation.usage.output_tokens",
    response.usageMetadata?.candidatesTokenCount ?? 0,
    ["provider:gemini"]
  );
}

export function formatImageResponse(
  imageParts: GeminiInlineDataPart[],
  fileName: string
): Ok<
  Array<{
    type: "image";
    mimeType: string;
    data: string;
    name: string;
  }>
> {
  const outputFileName = fileName.toLowerCase().endsWith(".png")
    ? fileName
    : `${fileName}.png`;

  return new Ok(
    imageParts.map((part) => ({
      type: "image" as const,
      mimeType: part.inlineData.mimeType ?? DEFAULT_IMAGE_MIME_TYPE,
      data: part.inlineData.data,
      name: outputFileName,
    }))
  );
}

export function createGeminiClient(): GoogleGenAI {
  const credentials = dustManagedCredentials();
  return new GoogleGenAI({
    apiKey: credentials.GOOGLE_AI_STUDIO_API_KEY,
  });
}

async function processSingleImageFile(
  auth: Authenticator,
  {
    imageFileId,
    conversationId,
    maxImageSize,
  }: {
    imageFileId: string;
    conversationId: string;
    maxImageSize: number;
  }
): Promise<Ok<Part> | Err<MCPError>> {
  const workspace = auth.getNonNullableWorkspace();
  const statsDClient = getStatsDClient();
  const fileResource = await FileResource.fetchById(auth, imageFileId);
  if (!fileResource) {
    return new Err(
      new MCPError(`File not found: ${imageFileId}`, {
        tracked: false,
      })
    );
  }

  const belongsResult = fileResource.belongsToConversation(conversationId);
  if (belongsResult.isErr() || !belongsResult.value) {
    return new Err(
      new MCPError(`File ${imageFileId} does not belong to this conversation`, {
        tracked: false,
      })
    );
  }

  // TODO(@jd) JIT resize over 20MB once imagemagick is available.
  if (fileResource.fileSize > maxImageSize) {
    logger.warn(
      {
        fileId: fileResource.sId,
        fileSize: fileResource.fileSize,
        maxFileSize: maxImageSize,
        workspaceId: workspace.sId,
      },
      "generate_image: File size exceeds maximum allowed size"
    );

    statsDClient.increment(
      "tools.image_generation.file_size_limit_exceeded",
      1,
      ["provider:gemini"]
    );

    return new Err(
      new MCPError(
        `Image file ${imageFileId} too large. Maximum allowed size is ${fileSizeToHumanReadable(maxImageSize, 0)}, but file is ${fileSizeToHumanReadable(fileResource.fileSize, 0)}.`,
        {
          tracked: false,
        }
      )
    );
  }

  if (!isGeminiSupportedImageType(fileResource.contentType)) {
    return new Err(
      new MCPError(
        `File ${imageFileId} is not a supported image type for editing. Got: ${fileResource.contentType}. Supported types: ${GEMINI_SUPPORTED_IMAGE_TYPES.map((t) => t.replace("image/", "").toUpperCase()).join(", ")}.`,
        {
          tracked: false,
        }
      )
    );
  }

  const signedUrl = await fileResource.getSignedUrlForDownload(
    auth,
    "original"
  );

  return new Ok(createPartFromUri(signedUrl, fileResource.contentType));
}

export async function processImageFileIds(
  auth: Authenticator,
  {
    imageFileIds,
    agentLoopContext,
  }: {
    imageFileIds: string[];
    agentLoopContext: AgentLoopContextType | undefined;
  }
): Promise<Ok<Part[]> | Err<MCPError>> {
  if (!agentLoopContext?.runContext) {
    return new Err(
      new MCPError("No conversation context available for file access", {
        tracked: false,
      })
    );
  }

  const conversationId = agentLoopContext.runContext.conversation.sId;
  const maxImageSize = MAX_FILE_SIZES.image;

  const results = await concurrentExecutor(
    imageFileIds,
    (imageFileId) =>
      processSingleImageFile(auth, {
        imageFileId,
        conversationId,
        maxImageSize,
      }),
    { concurrency: 8 }
  );

  const firstError = results.find((r) => r.isErr());
  if (firstError?.isErr()) {
    return firstError;
  }

  const parts = results
    .filter((r): r is Ok<Part> => r.isOk())
    .map((r) => r.value);

  return new Ok(parts);
}
