import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { createImageProvider } from "@app/lib/actions/mcp_internal_actions/servers/image_generation/provider_factory";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { streamToBuffer } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { getSupportedImageModelConfig } from "@app/lib/image_models";
import { FileResource } from "@app/lib/resources/file_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types";
import {
  DEFAULT_IMAGE_MODEL_CONFIG,
  SUPPORTED_IMAGE_MODEL_CONFIGS,
} from "@app/types/assistant/models/image_models";
import {
  fileSizeToHumanReadable,
  isSupportedImageContentType,
  MAX_FILE_SIZES,
} from "@app/types/files";

const IMAGE_GENERATION_RATE_LIMITER_KEY = "image_generation";
const IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS = 60 * 60 * 24 * 7; // 1 week.

const DEFAULT_IMAGE_OUTPUT_FORMAT = "png";
const DEFAULT_IMAGE_MIME_TYPE = "image/png";

// Map tool size parameters to aspect ratios.
const SIZE_TO_ASPECT_RATIO: Record<string, string> = {
  "1024x1024": "1:1",
  "1536x1024": "3:2",
  "1024x1536": "2:3",
};

// Build the options schema for image models.
// Each model becomes an option with value and label.
function buildImageModelOptionsSchema() {
  const modelSchemas = SUPPORTED_IMAGE_MODEL_CONFIGS.map((model) =>
    z
      .object({
        value: z.literal(model.modelId),
        label: z.literal(model.displayName),
      })
      .describe(model.description)
  );

  // For z.union() to generate anyOf in JSON schema, we need at least 2 schemas.
  // If there's only one model, duplicate it to ensure anyOf is generated.
  if (modelSchemas.length === 1) {
    modelSchemas.push(modelSchemas[0]);
  }

  return z
    .union(
      modelSchemas as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]
    )
    .optional();
}

// Configurable image model schema - hidden from LLM but shown in agent builder.
const imageModelSchema = z
  .object({
    options: buildImageModelOptionsSchema(),
    value: z.string(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM),
  })
  .describe("The image generation model to use.")
  .default({
    value: DEFAULT_IMAGE_MODEL_CONFIG.modelId,
    mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
  });

// Helper functions for image generation tools.

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

function trackTokenUsage(
  usage: { inputTokens: number; outputTokens: number } | undefined,
  statsDClient: ReturnType<typeof getStatsDClient>,
  providerId: string
): void {
  if (!usage) {
    return;
  }
  statsDClient.increment(
    "tools.image_generation.usage.input_tokens",
    usage.inputTokens,
    [`provider:${providerId}`]
  );
  statsDClient.increment(
    "tools.image_generation.usage.output_tokens",
    usage.outputTokens,
    [`provider:${providerId}`]
  );
}

function formatImageResponse(
  images: Array<{ imageBase64: string; mimeType: string }>,
  fileName: string
): Ok<
  Array<{
    type: "image";
    mimeType: string;
    data: string;
    name: string;
  }>
> {
  const outputFileName = `${fileName}.${DEFAULT_IMAGE_OUTPUT_FORMAT}`;

  return new Ok(
    images.map((image) => ({
      type: "image" as const,
      mimeType: image.mimeType ?? DEFAULT_IMAGE_MIME_TYPE,
      data: image.imageBase64,
      name: outputFileName,
    }))
  );
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("image_generation");

  server.tool(
    "generate_image",
    "Generate an image from text descriptions. The more detailed and specific your prompt is, the" +
      " better the result will be. You can customize the output through various parameters to" +
      " match your needs.",
    {
      imageModel: imageModelSchema,
      prompt: z
        .string()
        .max(4000)
        .describe(
          "A text description of the desired image. The maximum length is 32000 characters."
        ),
      name: z
        .string()
        .max(64)
        .describe(
          "The filename that will be used to save the generated image. Must be 64 characters or less."
        ),
      quality: z
        .enum(["auto", "low", "medium", "high"])
        .optional()
        .default("auto")
        .describe(
          "The quality of the generated image. Must be one of auto, low, medium, or high. Auto" +
            " will automatically choose the best quality for the size."
        ),
      size: z
        .enum(["1024x1024", "1536x1024", "1024x1536"])
        .optional()
        .default("1024x1024")
        .describe(
          "The size of the generated image. Must be one of 1024x1024, 1536x1024, or 1024x1536"
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "generate_image", agentLoopContext },
      async (
        { imageModel, prompt, name, quality, size },
        { sendNotification, _meta }
      ) => {
        const workspace = auth.getNonNullableWorkspace();

        // Get the model configuration from the imageModel value.
        const modelConfig = getSupportedImageModelConfig(imageModel.value);
        if (!modelConfig) {
          return new Err(
            new MCPError(`Unsupported image model: ${imageModel.value}`, {
              tracked: false,
            })
          );
        }

        await sendImageProgressNotification(
          sendNotification,
          _meta?.progressToken,
          "Generating image..."
        );

        const statsDClient = getStatsDClient();
        statsDClient.increment("tools.image_generation.generated", 1, [
          `quality:${quality}`,
          `size:${size}`,
          `provider:${modelConfig.providerId}`,
          `model:${modelConfig.modelId}`,
        ]);

        const rateLimitResult = await checkImageGenerationRateLimit(
          auth,
          workspace
        );
        if (rateLimitResult.isErr()) {
          return rateLimitResult;
        }

        try {
          const provider = createImageProvider(modelConfig);

          const aspectRatio =
            SIZE_TO_ASPECT_RATIO[size] || SIZE_TO_ASPECT_RATIO["1024x1024"];

          const result = await provider.generateImage({
            prompt,
            aspectRatio,
            quality,
          });

          if (result.isErr()) {
            return new Err(new MCPError(result.error.message));
          }

          trackTokenUsage(result.value.usage, statsDClient, modelConfig.providerId);

          return formatImageResponse(result.value.images, name);
        } catch (error) {
          logger.error(
            {
              error,
            },
            "Error generating image."
          );
          return new Err(new MCPError("Error generating image."));
        }
      }
    )
  );

  server.tool(
    "edit_image",
    "Edit an existing image using text instructions. Provide the file ID of an image from Dust" +
      " file storage and describe the changes you want to make. The tool preserves the original" +
      " image's aspect ratio by default, but you can optionally change it.",
    {
      imageModel: imageModelSchema,
      imageFileId: z
        .string()
        .describe(
          "The ID of the image file to edit (e.g. fil_abc1234) from conversation attachments. Must be a valid image file (PNG, JPEG, etc.)."
        ),
      editPrompt: z
        .string()
        .max(4000)
        .describe(
          "A text description of the desired edits. Be specific about what should change and what should remain unchanged. The maximum length is 4000 characters."
        ),
      outputName: z
        .string()
        .max(64)
        .describe(
          "The filename that will be used to save the edited image. Must be 64 characters or less."
        ),
      quality: z
        .enum(["auto", "low", "medium", "high"])
        .optional()
        .default("auto")
        .describe(
          "The quality of the edited image. Must be one of auto, low, medium, or high. Auto" +
            " will automatically choose the best quality."
        ),
      aspectRatio: z
        .enum(["1:1", "3:2", "2:3"])
        .optional()
        .describe(
          "Optional aspect ratio override for the edited image. If not specified, preserves the" +
            " original image's aspect ratio. Must be one of 1:1, 3:2, or 2:3."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "edit_image", agentLoopContext },
      async (
        {
          imageModel,
          imageFileId: inputImageFileId,
          editPrompt: editImageInstructions,
          outputName: outputImageFileName,
          quality,
          aspectRatio,
        },
        { sendNotification, _meta }
      ) => {
        const workspace = auth.getNonNullableWorkspace();
        const statsDClient = getStatsDClient();

        // Get the model configuration from the imageModel value.
        const modelConfig = getSupportedImageModelConfig(imageModel.value);
        if (!modelConfig) {
          return new Err(
            new MCPError(`Unsupported image model: ${imageModel.value}`, {
              tracked: false,
            })
          );
        }

        await sendImageProgressNotification(
          sendNotification,
          _meta?.progressToken,
          "Editing image..."
        );

        // Check if agentLoopContext is available (required for conversation validation)
        if (!agentLoopContext?.runContext) {
          return new Err(
            new MCPError("No conversation context available for file access", {
              tracked: false,
            })
          );
        }

        // Fetch the file resource
        const fileResource = await FileResource.fetchById(
          auth,
          inputImageFileId
        );
        if (!fileResource) {
          return new Err(
            new MCPError(`File not found: ${inputImageFileId}`, {
              tracked: false,
            })
          );
        }

        // Validate file belongs to the current conversation
        const conversationId = agentLoopContext.runContext.conversation.sId;
        const belongsResult =
          fileResource.belongsToConversation(conversationId);
        if (belongsResult.isErr() || !belongsResult.value) {
          return new Err(
            new MCPError(`File does not belong to this conversation`, {
              tracked: false,
            })
          );
        }

        const maxImageSize = MAX_FILE_SIZES.image;
        if (fileResource.fileSize > maxImageSize) {
          logger.warn(
            {
              fileId: fileResource.sId,
              fileSize: fileResource.fileSize,
              maxFileSize: maxImageSize,
              workspaceId: workspace.sId,
            },
            "edit_image: File size exceeds maximum allowed size"
          );

          statsDClient.increment(
            "tools.image_generation.file_size_limit_exceeded",
            1,
            [`provider:${modelConfig.providerId}`]
          );

          return new Err(
            new MCPError(
              `Image file too large for editing. Maximum allowed size is ${fileSizeToHumanReadable(maxImageSize, 0)}, but file is ${fileSizeToHumanReadable(fileResource.fileSize, 0)}.`,
              {
                tracked: false,
              }
            )
          );
        }

        // Get file content as buffer
        const readStream = fileResource.getReadStream({
          auth,
          version: "original",
        });
        const bufferResult = await streamToBuffer(readStream);
        if (bufferResult.isErr()) {
          return new Err(
            new MCPError(`Failed to read file: ${bufferResult.error}`, {
              tracked: false,
            })
          );
        }

        const buffer = bufferResult.value;
        const contentType = fileResource.contentType;

        if (!isSupportedImageContentType(fileResource.contentType)) {
          return new Err(
            new MCPError(
              `File is not a supported image type. Got: ${fileResource.contentType}. Supported types: PNG, JPEG, WebP, HEIC, HEIF.`,
              {
                tracked: false,
              }
            )
          );
        }

        statsDClient.increment("tools.image_generation.edited", 1, [
          `quality:${quality}`,
          `aspect_ratio:${aspectRatio ?? "original"}`,
          `provider:${modelConfig.providerId}`,
          `model:${modelConfig.modelId}`,
        ]);

        const rateLimitResult = await checkImageGenerationRateLimit(
          auth,
          workspace
        );
        if (rateLimitResult.isErr()) {
          return rateLimitResult;
        }

        const imageBase64 = buffer.toString("base64");

        try {
          const provider = createImageProvider(modelConfig);

          const result = await provider.editImage({
            imageBase64,
            imageMimeType: contentType,
            editPrompt: editImageInstructions,
            aspectRatio,
            quality,
          });

          if (result.isErr()) {
            return new Err(new MCPError(result.error.message));
          }

          trackTokenUsage(
            result.value.usage,
            statsDClient,
            modelConfig.providerId
          );

          return formatImageResponse(result.value.images, outputImageFileName);
        } catch (error) {
          logger.error(
            {
              error,
            },
            "Error editing image."
          );
          return new Err(new MCPError("Error editing image."));
        }
      }
    )
  );

  return server;
}

export default createServer;
