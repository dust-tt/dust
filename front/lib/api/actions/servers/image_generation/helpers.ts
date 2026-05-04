import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  MCPProgressNotificationType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { resolveConversationFileRef } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import { uploadBase64ImageToFileStorage } from "@app/lib/api/files/upload";
import type { ReferenceImageFile } from "@app/lib/api/llm/imageGeneration";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { ImageModelIdType } from "@app/types/assistant/models/models";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import {
  fileSizeToHumanReadable,
  isSupportedImageContentType,
  MAX_FILE_SIZES,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

export type ImageGenerationErrorCode =
  | "api_error"
  | "safety_blocked"
  | "empty_response";

export class ImageGenerationError extends Error {
  constructor(
    public readonly code: ImageGenerationErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, { cause: options?.cause });
    this.name = "ImageGenerationError";
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

export type Base64ImageData = {
  base64: string;
  mimeType?: string;
};

export function computeImageGenerationCostDetails(
  usageMetadata: {
    inputTokens: number;
    outputTokens: number;
  },
  modelId: ImageModelIdType
): {
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
    modelId,
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
  workspace: WorkspaceType,
  providerId: ModelProviderIdType
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
      `provider:${providerId}`,
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
    maxImageSize,
    supportedContentTypes,
    providerId,
    agentLoopContext,
  }: {
    imageFileId: string;
    maxImageSize: number;
    supportedContentTypes: string[];
    providerId: ModelProviderIdType;
    agentLoopContext: AgentLoopContextType | undefined;
  }
): Promise<Ok<ReferenceImageFile> | Err<MCPError>> {
  const workspace = auth.getNonNullableWorkspace();

  const refResult = await resolveConversationFileRef(
    auth,
    imageFileId,
    agentLoopContext
  );
  if (refResult.isErr()) {
    return new Err(
      new MCPError(`File not found: ${imageFileId}`, { tracked: false })
    );
  }

  const { contentType, sizeBytes, fileName, getSignedUrl } = refResult.value;

  // TODO(@jd) JIT resize over 20MB once imagemagick is available.
  if (sizeBytes > maxImageSize) {
    logger.warn(
      {
        imageFileId,
        fileSize: sizeBytes,
        maxFileSize: maxImageSize,
        workspaceId: workspace.sId,
      },
      "generate_image: File size exceeds maximum allowed size"
    );

    getStatsDClient().increment(
      "tools.image_generation.file_size_limit_exceeded",
      1,
      [`provider:${providerId}`]
    );

    return new Err(
      new MCPError(
        `Image file ${imageFileId} too large. Maximum allowed size is ${fileSizeToHumanReadable(maxImageSize, 0)}, but file is ${fileSizeToHumanReadable(sizeBytes, 0)}.`,
        { tracked: false }
      )
    );
  }

  if (!supportedContentTypes.includes(contentType)) {
    return new Err(
      new MCPError(
        `File ${imageFileId} is not a supported image type. Got: ${contentType}. Supported types: ${supportedContentTypes
          .map((t) => t.replace("image/", "").toUpperCase())
          .join(", ")}.`,
        { tracked: false }
      )
    );
  }

  const signedUrl = await getSignedUrl();
  return new Ok({ signedUrl, fileName, contentType });
}

export async function processImageFileIds(
  auth: Authenticator,
  {
    imageFileIds,
    agentLoopContext,
    supportedContentTypes,
    providerId,
  }: {
    imageFileIds: string[];
    agentLoopContext: AgentLoopContextType | undefined;
    supportedContentTypes: string[];
    providerId: ModelProviderIdType;
  }
): Promise<Ok<ReferenceImageFile[]> | Err<MCPError>> {
  if (!agentLoopContext?.runContext) {
    return new Err(
      new MCPError("No conversation context available for file access", {
        tracked: false,
      })
    );
  }

  const maxImageSize = MAX_FILE_SIZES.image;

  const results = await concurrentExecutor(
    imageFileIds,
    (imageFileId) =>
      processSingleImageFile(auth, {
        imageFileId,
        maxImageSize,
        supportedContentTypes,
        providerId,
        agentLoopContext,
      }),
    { concurrency: 8 }
  );

  const firstError = results.find((r) => r.isErr());
  if (firstError?.isErr()) {
    return firstError;
  }

  return new Ok(
    results
      .filter((r): r is Ok<ReferenceImageFile> => r.isOk())
      .map((r) => r.value)
  );
}
