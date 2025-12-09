import { GoogleGenAI } from "@google/genai";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { MCPProgressNotificationType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { streamToBuffer } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { dustManagedCredentials, Err, Ok } from "@app/types";
import { GEMINI_2_5_FLASH_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import {
  fileSizeToHumanReadable,
  isSupportedImageContentType,
  MAX_FILE_SIZES,
} from "@app/types/files";

const IMAGE_GENERATION_RATE_LIMITER_KEY = "image_generation";
const IMAGE_GENERATION_RATE_LIMITER_TIMEFRAME_SECONDS = 60 * 60 * 24 * 7; // 1 week.

const DEFAULT_IMAGE_OUTPUT_FORMAT = "png";
const DEFAULT_IMAGE_MIME_TYPE = "image/png";

// Map tool size parameters to Gemini aspect ratios.
const SIZE_TO_ASPECT_RATIO: Record<string, string> = {
  "1024x1024": "1:1",
  "1536x1024": "3:2",
  "1024x1536": "2:3",
};

const GeminiInlineDataPartSchema = z.object({
  inlineData: z.object({
    data: z.string(),
    mimeType: z.string().optional(),
  }),
});

type GeminiInlineDataPart = z.infer<typeof GeminiInlineDataPartSchema>;

// Type guard to validate Gemini inline data parts.
function isValidGeminiInlineDataPart(
  part: unknown
): part is GeminiInlineDataPart {
  return GeminiInlineDataPartSchema.safeParse(part).success;
}

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

type GeminiResponseParts = {
  textParts: string[];
  imageParts: GeminiInlineDataPart[];
};

function extractGeminiResponseParts(
  response: any,
  operationType: "generation" | "editing",
  promptText: string
): Ok<GeminiResponseParts> | Err<MCPError> {
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

  const allTextParts: string[] = [];
  const allImageParts: GeminiInlineDataPart[] = [];

  for (const candidate of response.candidates) {
    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (typeof part.text === "string") {
          allTextParts.push(part.text);
        } else if (isValidGeminiInlineDataPart(part)) {
          allImageParts.push(part);
        }
      }
    }
  }

  if (allImageParts.length === 0) {
    return new Err(new MCPError("No image data in response."));
  }

  return new Ok({ textParts: allTextParts, imageParts: allImageParts });
}

function extractFilenamesFromJson(textParts: string[]): string[] {
  for (const text of textParts) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.images && Array.isArray(parsed.images)) {
        return parsed.images.map(
          (img: { filename?: string }) => img.filename ?? "image"
        );
      }
    } catch {
      // Not valid JSON, continue to next text part
    }
  }
  return [];
}

function trackGeminiTokenUsage(
  response: any,
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
  imageParts: GeminiInlineDataPart[],
  filenames: string[]
): Ok<
  Array<{
    type: "image";
    mimeType: string;
    data: string;
    name: string;
  }>
> {
  return new Ok(
    imageParts.map((part, index) => {
      const baseName = filenames[index] ?? `image_${index}`;
      return {
        type: "image" as const,
        mimeType: part.inlineData.mimeType ?? DEFAULT_IMAGE_MIME_TYPE,
        data: part.inlineData.data,
        name: `${baseName}.${DEFAULT_IMAGE_OUTPUT_FORMAT}`,
      };
    })
  );
}

function createGeminiClient(): GoogleGenAI {
  const credentials = dustManagedCredentials();
  return new GoogleGenAI({
    apiKey: credentials.GOOGLE_AI_STUDIO_API_KEY,
  });
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("image_generation");

  server.tool(
    "generate_image",
    "Generate one or multiple images from text descriptions. The more detailed and specific your prompt is, the" +
      " better the result will be. You can customize the output through various parameters to" +
      " match your needs.",
    {
      prompt: z
        .string()
        .max(4000)
        .describe(
          "A text description of the desired image. The maximum length is 32000 characters."
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
      async ({ prompt, quality, size }, { sendNotification, _meta }) => {
        const workspace = auth.getNonNullableWorkspace();

        await sendImageProgressNotification(
          sendNotification,
          _meta?.progressToken,
          "Generating image..."
        );

        const statsDClient = getStatsDClient();
        statsDClient.increment("tools.image_generation.generated", 1, [
          `quality:${quality}`,
          `size:${size}`,
          "provider:gemini",
        ]);

        const rateLimitResult = await checkImageGenerationRateLimit(
          auth,
          workspace
        );
        if (rateLimitResult.isErr()) {
          return rateLimitResult;
        }

        try {
          const gemini = createGeminiClient();

          const aspectRatio =
            SIZE_TO_ASPECT_RATIO[size] || SIZE_TO_ASPECT_RATIO["1024x1024"];

          const promptWithFilenameRequest =
            `${prompt}\n\nFor each image you generate, provide a short descriptive filename (without extension). ` +
            `Respond with JSON: {"images": [{"filename": "<name>"}]}`;

          const response = await gemini.models.generateContent({
            model: GEMINI_2_5_FLASH_IMAGE_MODEL_ID,
            contents: promptWithFilenameRequest,
            config: {
              temperature: 0.7,
              responseModalities: ["TEXT", "IMAGE"],
              candidateCount: 1,
              imageConfig: {
                aspectRatio,
              },
            },
          });

          const extractionResult = extractGeminiResponseParts(
            response,
            "generation",
            prompt
          );
          if (extractionResult.isErr()) {
            return extractionResult;
          }

          const { textParts, imageParts } = extractionResult.value;
          const filenames = extractFilenamesFromJson(textParts);

          trackGeminiTokenUsage(response, statsDClient);

          return formatImageResponse(imageParts, filenames);
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
    "Edit existing images using text instructions. Provide one or more file IDs of images from Dust" +
      " file storage and describe the changes you want to make. The model may output one or more" +
      " edited images based on your instructions. The tool preserves the original" +
      " image's aspect ratio by default, but you can optionally change it.",
    {
      imageFileIds: z
        .array(z.string())
        .min(1)
        .max(4)
        .describe(
          "The IDs of the image files to edit (e.g. ['fil_abc1234', 'fil_xyz5678']) from conversation attachments. Must be valid image files (PNG, JPEG, etc.). Between 1 and 4 images."
        ),
      editPrompt: z
        .string()
        .max(4000)
        .describe(
          "A text description of the desired edits. Be specific about what should change and what should remain unchanged. The maximum length is 4000 characters."
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
          imageFileIds: inputImageFileIds,
          editPrompt: editImageInstructions,
          quality,
          aspectRatio,
        },
        { sendNotification, _meta }
      ) => {
        const workspace = auth.getNonNullableWorkspace();
        const statsDClient = getStatsDClient();

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

        const conversationId = agentLoopContext.runContext.conversation.sId;
        const maxImageSize = MAX_FILE_SIZES.image;

        // Fetch all file resources in parallel
        const fileResources = await Promise.all(
          inputImageFileIds.map((fileId) =>
            FileResource.fetchById(auth, fileId)
          )
        );

        // Validate all files belong to conversation and meet requirements
        const validFileResources = [];
        for (let i = 0; i < fileResources.length; i++) {
          const fileResource = fileResources[i];
          if (!fileResource) {
            return new Err(
              new MCPError(`File not found: ${inputImageFileIds[i]}`, {
                tracked: false,
              })
            );
          }

          const belongsResult =
            fileResource.belongsToConversation(conversationId);
          if (belongsResult.isErr() || !belongsResult.value) {
            return new Err(
              new MCPError(
                `File ${fileResource.sId} does not belong to this conversation`,
                { tracked: false }
              )
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
              "edit_image: File size exceeds maximum allowed size"
            );

            statsDClient.increment(
              "tools.image_generation.file_size_limit_exceeded",
              1,
              ["provider:gemini"]
            );

            return new Err(
              new MCPError(
                `Image file ${fileResource.sId} too large for editing. Maximum allowed size is ${fileSizeToHumanReadable(maxImageSize, 0)}, but file is ${fileSizeToHumanReadable(fileResource.fileSize, 0)}.`,
                { tracked: false }
              )
            );
          }

          if (!isSupportedImageContentType(fileResource.contentType)) {
            return new Err(
              new MCPError(
                `File ${fileResource.sId} is not a supported image type. Got: ${fileResource.contentType}. Supported types: PNG, JPEG, WebP, HEIC, HEIF.`,
                { tracked: false }
              )
            );
          }

          validFileResources.push(fileResource);
        }

        // Read all files in parallel
        const bufferResults = await Promise.all(
          validFileResources.map((fr) => {
            const readStream = fr.getReadStream({ auth, version: "original" });
            return streamToBuffer(readStream);
          })
        );

        // Validate all reads succeeded and extract buffers
        const buffers: Buffer[] = [];
        for (let i = 0; i < bufferResults.length; i++) {
          const result = bufferResults[i];
          if (result.isErr()) {
            return new Err(
              new MCPError(
                `Failed to read file ${inputImageFileIds[i]}: ${result.error}`,
                { tracked: false }
              )
            );
          }
          buffers.push(result.value);
        }

        // Build image data array
        const imageDataArray = validFileResources.map((fr, i) => ({
          base64: buffers[i].toString("base64"),
          contentType: fr.contentType,
        }));

        statsDClient.increment("tools.image_generation.edited", 1, [
          `quality:${quality}`,
          `aspect_ratio:${aspectRatio ?? "original"}`,
          `input_count:${inputImageFileIds.length}`,
          "provider:gemini",
        ]);

        const rateLimitResult = await checkImageGenerationRateLimit(
          auth,
          workspace
        );
        if (rateLimitResult.isErr()) {
          return rateLimitResult;
        }

        try {
          const gemini = createGeminiClient();

          // Build parts array with all images plus the edit prompt
          const inputImageParts = imageDataArray.map((img) => ({
            inlineData: {
              data: img.base64,
              mimeType: img.contentType,
            },
          }));

          const promptWithFilenameRequest =
            `${editImageInstructions}\n\nFor each image you generate, provide a short descriptive filename (without extension). ` +
            `Respond with JSON: {"images": [{"filename": "<name>"}]}`;

          // Call Gemini API with images inline data and edit prompt.
          // The contents array includes all images and the text prompt.
          const response = await gemini.models.generateContent({
            model: GEMINI_2_5_FLASH_IMAGE_MODEL_ID,
            contents: [
              {
                parts: [
                  ...inputImageParts,
                  { text: promptWithFilenameRequest },
                ],
              },
            ],
            config: {
              temperature: 0.7,
              responseModalities: ["TEXT", "IMAGE"],
              candidateCount: 1,
              imageConfig: aspectRatio ? { aspectRatio } : undefined,
            },
          });

          const extractionResult = extractGeminiResponseParts(
            response,
            "editing",
            editImageInstructions
          );
          if (extractionResult.isErr()) {
            return extractionResult;
          }

          const { textParts, imageParts: outputImageParts } =
            extractionResult.value;
          const filenames = extractFilenamesFromJson(textParts);

          trackGeminiTokenUsage(response, statsDClient);

          return formatImageResponse(outputImageParts, filenames);
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
