import type { Part } from "@google/genai";
import { createPartFromUri, GoogleGenAI } from "@google/genai";
import { startObservation } from "@langfuse/tracing";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { GENERATE_IMAGE_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { GenerateImageInputSchema } from "@app/lib/actions/mcp_internal_actions/types";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { computeTokensCostForUsageInMicroUsd } from "@app/lib/api/assistant/token_pricing";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { dustManagedCredentials, Err, normalizeError, Ok } from "@app/types";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { fileSizeToHumanReadable, MAX_FILE_SIZES } from "@app/types/files";

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

const IMAGE_GENERATION_RATE_LIMITER_KEY = "image_generation";
const IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS = 60 * 60 * 24 * 7; // 1 week.
const QUALITY_TO_IMAGE_SIZE: Record<string, string> = {
  low: "1K",
  medium: "2K",
  high: "4K",
};

const DEFAULT_IMAGE_MIME_TYPE = "image/png";

// Token pricing is expressed as cost per million tokens (micro-USD per token)
const MICRO_USD_PER_USD = 1_000_000;

/**
 * Computes cost details for Gemini image generation from usage metadata.
 * Returns structured cost information for Langfuse observation updates.
 */
function computeImageGenerationCostDetails(usageMetadata: {
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

const GeminiImagePartSchema = z.object({
  inlineData: z.object({
    data: z.string(),
    mimeType: z.string(),
  }),
});

type ValidatedGeminiImagePart = z.infer<typeof GeminiImagePartSchema>;

function isValidatedGeminiImagePart(
  part: unknown
): part is ValidatedGeminiImagePart {
  return GeminiImagePartSchema.safeParse(part).success;
}

const GeminiBlockedResponseSchema = z.object({
  candidates: z.array(z.unknown()).length(0).optional(),
  promptFeedback: z.object({
    blockReason: z.string(),
    safetyRatings: z.unknown().optional(),
  }),
});

const GeminiSuccessResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(z.unknown()),
        }),
      })
    )
    .min(1),
});

async function sendImageProgressNotification(
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
      data: {
        label,
        output: {
          type: "image",
          mimeType: DEFAULT_IMAGE_MIME_TYPE,
        },
      },
    },
  };

  await sendNotification(notification);
}

async function checkImageGenerationRateLimit(
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

function validateGeminiImageResponse(
  response: unknown,
  operationType: "generation" | "editing",
  promptText: string
): Ok<ValidatedGeminiImagePart[]> | Err<MCPError> {
  const blockedResult = GeminiBlockedResponseSchema.safeParse(response);
  if (blockedResult.success) {
    const { blockReason, safetyRatings } = blockedResult.data.promptFeedback;
    logger.error(
      {
        blockReason,
        safetyRatings,
        prompt: promptText,
      },
      `Gemini image ${operationType}: Prompt blocked by safety filters`
    );
    return new Err(
      new MCPError(
        `Image ${operationType} blocked by safety filters: ${blockReason}`
      )
    );
  }

  const successResult = GeminiSuccessResponseSchema.safeParse(response);
  if (!successResult.success) {
    return new Err(new MCPError("No image generated."));
  }

  const parts = successResult.data.candidates[0].content.parts;
  const validatedParts = parts.filter(isValidatedGeminiImagePart);
  if (validatedParts.length === 0) {
    return new Err(new MCPError("No image data in response."));
  }

  return new Ok(validatedParts);
}

function trackGeminiTokenUsage(
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

function formatImageResponse(
  imageParts: ValidatedGeminiImagePart[],
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
      mimeType: part.inlineData.mimeType,
      data: part.inlineData.data,
      name: outputFileName,
    }))
  );
}

function createGeminiClient(): GoogleGenAI {
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

async function processImageFileIds(
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

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("image_generation");

  server.tool(
    GENERATE_IMAGE_TOOL_NAME,
    "Generate or edit images from text descriptions and reference images.",
    GenerateImageInputSchema.shape,
    withToolLogging(
      auth,
      { toolNameForMonitoring: GENERATE_IMAGE_TOOL_NAME, agentLoopContext },
      async (
        { prompt, outputName, aspectRatio, referenceImages, quality },
        { sendNotification, _meta }
      ) => {
        const workspace = auth.getNonNullableWorkspace();

        await sendImageProgressNotification(
          sendNotification,
          _meta?.progressToken,
          "Generating image..."
        );

        const statsDClient = getStatsDClient();
        statsDClient.increment("tools.image_generation.generated", 1, [
          `aspect_ratio:${aspectRatio}`,
          `image_count:${referenceImages?.length ?? 0}`,
          `quality:${quality}`,
          "provider:gemini",
        ]);

        const rateLimitResult = await checkImageGenerationRateLimit(
          auth,
          workspace
        );
        if (rateLimitResult.isErr()) {
          return rateLimitResult;
        }

        const gemini = createGeminiClient();

        let referenceImageParts: Part[] = [];

        if (referenceImages && referenceImages.length > 0) {
          const processResult = await processImageFileIds(auth, {
            imageFileIds: referenceImages,
            agentLoopContext,
          });
          if (processResult.isErr()) {
            return processResult;
          }
          referenceImageParts = processResult.value;
        }

        const imageSize = QUALITY_TO_IMAGE_SIZE[quality ?? "low"];

        const generation = startObservation(
          "image-generation",
          {
            input: {
              prompt,
              aspectRatio,
              outputName,
              imageFileIds: referenceImages,
              quality,
            },
            model: GEMINI_3_PRO_IMAGE_MODEL_ID,
            modelParameters: { aspectRatio, imageSize, temperature: 0.7 },
          },
          { asType: "generation" }
        );

        generation.updateTrace({
          tags: [
            `workspaceId:${workspace.sId}`,
            `operationType:image_generation`,
            `tool:generate_image`,
          ],
          metadata: {
            fileIds: referenceImages,
          },
          userId: workspace.sId,
        });

        const contents =
          referenceImageParts.length > 0
            ? [
                {
                  parts: [...referenceImageParts, { text: prompt }],
                },
              ]
            : prompt;
        let response;
        try {
          response = await gemini.models.generateContent({
            model: GEMINI_3_PRO_IMAGE_MODEL_ID,
            contents,
            config: {
              temperature: 0.7,
              responseModalities: ["IMAGE"],
              candidateCount: 1,
              imageConfig: {
                aspectRatio,
                imageSize,
              },
            },
          });
        } catch (error) {
          logger.error(
            {
              error,
            },
            "Error generating image."
          );
          generation.update({
            level: "ERROR",
            statusMessage: "Error generating image",
            metadata: {
              error: normalizeError(error),
            },
          });
          generation.end();
          return new Err(new MCPError("Error generating image."));
        }

        const validationResult = validateGeminiImageResponse(
          response,
          "generation",
          prompt
        );
        if (validationResult.isErr()) {
          logger.error(
            {
              error: validationResult.error,
            },
            "Error generating image."
          );
          generation.update({
            level: "ERROR",
            statusMessage: validationResult.error.message,
          });
          generation.end();
          return validationResult;
        }

        const imageParts = validationResult.value;

        trackGeminiTokenUsage(response, statsDClient);

        if (response.usageMetadata) {
          const { inputTokens, outputTokens, totalTokens, costDetails } =
            computeImageGenerationCostDetails(response.usageMetadata);

          generation.update({
            usageDetails: {
              input: inputTokens,
              output: outputTokens,
              total: totalTokens,
            },
            costDetails,
          });
        }
        generation.end();
        return formatImageResponse(imageParts, outputName);
      }
    )
  );

  return server;
}

export default createServer;
