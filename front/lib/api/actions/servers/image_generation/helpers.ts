import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  MCPProgressNotificationType,
  ToolGeneratedFilePathType,
  ToolGeneratedFileType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { resolveConversationFileRef } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import type {
  AgentLoopRunContext,
  SandboxFunctionRunContext,
  ToolContext,
} from "@app/lib/actions/types";
import type { ReferenceImageFile } from "@app/lib/api/actions/servers/image_generation/imageGeneration";
import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import { writeToToolOutputsFolder } from "@app/lib/api/files/action_output_fs";
import { makeFileName } from "@app/lib/api/files/action_output_fs/naming";
import { uploadBase64ImageToFileStorage } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import type { ImageModelIdType } from "@app/types/assistant/models/models";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import {
  extensionsForContentType,
  fileSizeToHumanReadable,
  isSupportedImageContentType,
  MAX_FILE_SIZES,
  stripFileExtension,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

type ImageGenerationErrorCode =
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

const IMAGE_GENERATION_RATE_LIMITER_KEY = "image_generation";
const IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS = 60 * 60 * 24 * 7; // 1 week.

const DEFAULT_IMAGE_MIME_TYPE = "image/png";

// Token pricing is expressed as cost per million tokens (micro-USD per token)
const MICRO_USD_PER_USD = 1_000_000;

export const QUALITY_TO_IMAGE_SIZE: Record<string, string> = {
  low: "1K",
  medium: "2K",
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

  // -1 means unlimited: skip the rate limit check entirely.
  if (maxImagesPerWeek === -1) {
    return new Ok(undefined);
  }

  const remaining = await rateLimiter({
    key: `${IMAGE_GENERATION_RATE_LIMITER_KEY}_${workspace.sId}`,
    maxPerTimeframe: maxImagesPerWeek,
    timeframeSeconds: IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS,
    logger,
  });

  if (remaining <= 0) {
    statsDMetrics.increment("tools.image_generation.rate_limit_hit", 1, [
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
  statsDMetrics.increment(
    "tools.image_generation.usage.input_tokens",
    inputTokens,
    [`provider:${providerId}`]
  );
  statsDMetrics.increment(
    "tools.image_generation.usage.output_tokens",
    outputTokens,
    [`provider:${providerId}`]
  );
}

async function uploadAndFormatAgentLoopImageResponse(
  auth: Authenticator,
  runContext: AgentLoopRunContext,
  images: Base64ImageData[],
  fileName: string
): Promise<
  Result<Array<{ type: "resource"; resource: ToolGeneratedFileType }>, MCPError>
> {
  const conversationId = runContext.conversation.sId;
  const baseFileName = stripFileExtension(fileName);

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

    const extension = extensionsForContentType(mimeType)[0] ?? ".png";
    const outputFileName = `${baseFileName}${extension}`;

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

async function writeSandboxFunctionImageResponse(
  auth: Authenticator,
  runContext: SandboxFunctionRunContext,
  images: Base64ImageData[],
  fileName: string
): Promise<
  Result<
    Array<{ type: "resource"; resource: ToolGeneratedFilePathType }>,
    MCPError
  >
> {
  const baseFileName = stripFileExtension(fileName);
  const resources: Array<{
    type: "resource";
    resource: ToolGeneratedFilePathType;
  }> = [];

  for (const [index, image] of images.entries()) {
    const mimeType = image.mimeType ?? DEFAULT_IMAGE_MIME_TYPE;
    if (!isSupportedImageContentType(mimeType)) {
      return new Err(
        new MCPError(`Unsupported image type: ${mimeType}`, {
          tracked: false,
        })
      );
    }

    const extension = extensionsForContentType(mimeType)[0] ?? ".png";
    const outputBaseName =
      images.length > 1 ? `${baseFileName}-${index + 1}` : baseFileName;
    const outputFileName = makeFileName({
      name: outputBaseName,
      ext: extension,
    });
    const base64Data = image.base64.replace(/^data:image\/[^;]+;base64,/, "");
    const content = Buffer.from(base64Data, "base64");
    const writeResult = await writeToToolOutputsFolder(auth, runContext, {
      fileName: outputFileName,
      content,
      contentType: mimeType,
    });
    if (writeResult.isErr()) {
      return new Err(
        new MCPError(
          `Error saving generated image: ${writeResult.error.message}`,
          { cause: writeResult.error }
        )
      );
    }
    const scopedPath = writeResult.value;

    resources.push({
      type: "resource",
      resource: {
        mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH,
        uri: scopedPath,
        path: scopedPath,
        title: outputFileName,
        contentType: mimeType,
        text: `Generated image: ${outputFileName}`,
      },
    });
  }

  return new Ok(resources);
}

export async function uploadAndFormatImageResponse(
  auth: Authenticator,
  toolContext: ToolContext | undefined,
  images: Base64ImageData[],
  fileName: string
): Promise<
  Result<
    Array<{
      type: "resource";
      resource: ToolGeneratedFileType | ToolGeneratedFilePathType;
    }>,
    MCPError
  >
> {
  if (!toolContext?.runContext) {
    return new Err(
      new MCPError("No tool run context available for file upload", {
        tracked: false,
      })
    );
  }

  const { runContext } = toolContext;
  switch (runContext.contextType) {
    case "agent_loop":
      return uploadAndFormatAgentLoopImageResponse(
        auth,
        runContext,
        images,
        fileName
      );
    case "sandbox_function":
      return writeSandboxFunctionImageResponse(
        auth,
        runContext,
        images,
        fileName
      );
    default:
      return assertNever(runContext);
  }
}

async function processSingleImageFile(
  auth: Authenticator,
  {
    imageFileId,
    maxImageSize,
    supportedContentTypes,
    providerId,
    runContext,
  }: {
    imageFileId: string;
    maxImageSize: number;
    supportedContentTypes: string[];
    providerId: ModelProviderIdType;
    runContext: AgentLoopRunContext;
  }
): Promise<Ok<ReferenceImageFile> | Err<MCPError>> {
  const workspace = auth.getNonNullableWorkspace();

  const refResult = await resolveConversationFileRef(
    auth,
    imageFileId,
    runContext
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

    statsDMetrics.increment(
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
    runContext,
    supportedContentTypes,
    providerId,
  }: {
    imageFileIds: string[];
    runContext: AgentLoopRunContext;
    supportedContentTypes: string[];
    providerId: ModelProviderIdType;
  }
): Promise<Ok<ReferenceImageFile[]> | Err<MCPError>> {
  const maxImageSize = MAX_FILE_SIZES.image;

  const results = await concurrentExecutor(
    imageFileIds,
    (imageFileId) =>
      processSingleImageFile(auth, {
        imageFileId,
        maxImageSize,
        supportedContentTypes,
        providerId,
        runContext,
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
