import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  MCPProgressNotificationType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import { uploadBase64ImageToFileStorage } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import {
  fileSizeToHumanReadable,
  isSupportedImageContentType,
  MAX_FILE_SIZES,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

export class ImageGenerationError extends Error {
  readonly data?: Record<string, unknown>;

  constructor(message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = "ImageGenerationError";
    this.data = data;
  }
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

export type Base64ImageData = {
  base64: string;
  mimeType?: string;
};

export function geminiPartsToBase64Images(
  parts: GeminiInlineDataPart[]
): Base64ImageData[] {
  return parts.map((part) => ({
    base64: part.inlineData.data,
    mimeType: part.inlineData.mimeType,
  }));
}

export function computeImageGenerationCostDetails(usageMetadata: {
  inputTokens: number;
  outputTokens: number;
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
  const inputTokens = usageMetadata.inputTokens;
  const outputTokens = usageMetadata.outputTokens;
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
    getStatsDClient().increment("tools.image_generation.rate_limit_hit", 1, [
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

export function trackTokenUsage({
  inputTokens,
  outputTokens,
  providerId,
}: {
  inputTokens: number;
  outputTokens: number;
  providerId: ModelProviderIdType;
}): void {
  getStatsDClient().increment(
    "tools.image_generation.usage.input_tokens",
    inputTokens,
    [`provider:${providerId}`]
  );
  getStatsDClient().increment(
    "tools.image_generation.usage.output_tokens",
    outputTokens,
    [`provider:${providerId}`]
  );
}

export async function uploadAndFormatImageResponse(
  auth: Authenticator,
  agentLoopContext: AgentLoopContextType | undefined,
  images: Base64ImageData[],
  fileName: string
): Promise<
  Result<Array<{ type: "resource"; resource: ToolGeneratedFileType }>, MCPError>
> {
  if (!agentLoopContext?.runContext) {
    return new Err(
      new MCPError("No conversation context available for file upload", {
        tracked: false,
      })
    );
  }

  const conversationId = agentLoopContext.runContext.conversation.sId;
  const outputFileName = fileName.toLowerCase().endsWith(".png")
    ? fileName
    : `${fileName}.png`;

  const resources: Array<{
    type: "resource";
    resource: ToolGeneratedFileType;
  }> = [];

  for (const image of images) {
    const mimeType = image.mimeType ?? DEFAULT_IMAGE_MIME_TYPE;

    if (!isSupportedImageContentType(mimeType)) {
      return new Err(
        new MCPError(`Unsupported image type: ${mimeType}`, {
          tracked: false,
        })
      );
    }

    const uploadResult = await uploadBase64ImageToFileStorage(auth, {
      base64: image.base64,
      contentType: mimeType,
      fileName: outputFileName,
      useCase: "conversation",
      useCaseMetadata: { conversationId },
    });

    if (uploadResult.isErr()) {
      return new Err(
        new MCPError(`Failed to upload image: ${uploadResult.error.message}`, {
          tracked: false,
        })
      );
    }

    const file = uploadResult.value;

    resources.push({
      type: "resource",
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE,
        uri: `file://${file.sId}`,
        fileId: file.sId,
        title: outputFileName,
        contentType: file.contentType,
        snippet: file.snippet,
        text: `Generated image: ${outputFileName}`,
      },
    });
  }

  return new Ok(resources);
}

async function processSingleImageFile(
  auth: Authenticator,
  {
    imageFileId,
    conversationId,
    maxImageSize,
    supportedContentTypes,
  }: {
    imageFileId: string;
    conversationId: string;
    maxImageSize: number;
    supportedContentTypes: string[];
  }
): Promise<Ok<FileResource> | Err<MCPError>> {
  const workspace = auth.getNonNullableWorkspace();
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

    getStatsDClient().increment(
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

  if (!supportedContentTypes.includes(fileResource.contentType)) {
    return new Err(
      new MCPError(
        `File ${imageFileId} is not a supported image type. Got: ${fileResource.contentType}. Supported types: ${supportedContentTypes
          .map((t) => t.replace("image/", "").toUpperCase())
          .join(", ")}.`,
        {
          tracked: false,
        }
      )
    );
  }

  return new Ok(fileResource);
}

export async function processImageFileIds(
  auth: Authenticator,
  {
    imageFileIds,
    agentLoopContext,
    supportedContentTypes,
  }: {
    imageFileIds: string[];
    agentLoopContext: AgentLoopContextType | undefined;
    supportedContentTypes: string[];
  }
): Promise<Ok<FileResource[]> | Err<MCPError>> {
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
        supportedContentTypes,
      }),
    { concurrency: 8 }
  );

  const firstError = results.find((r) => r.isErr());
  if (firstError?.isErr()) {
    return firstError;
  }

  const fileResources = results
    .filter((r): r is Ok<FileResource> => r.isOk())
    .map((r) => r.value);

  return new Ok(fileResources);
}
