import { startObservation } from "@langfuse/tracing";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { streamToBuffer } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  checkImageGenerationRateLimit,
  computeImageGenerationCostDetails,
  createGeminiClient,
  formatImageResponse,
  sendImageProgressNotification,
  SIZE_TO_ASPECT_RATIO,
  trackGeminiTokenUsage,
  validateGeminiImageResponse,
} from "@app/lib/api/actions/servers/image_generation/helpers";
import { IMAGE_GENERATION_TOOLS_METADATA } from "@app/lib/api/actions/servers/image_generation/metadata";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { Err, normalizeError } from "@app/types";
import { GEMINI_2_5_FLASH_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import {
  fileSizeToHumanReadable,
  isSupportedImageContentType,
  MAX_FILE_SIZES,
} from "@app/types/files";

export function createImageGenerationTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof IMAGE_GENERATION_TOOLS_METADATA> = {
    generate_image: async (
      { prompt, name, quality, size },
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

      const generation = startObservation(
        "image-generation",
        {
          input: { prompt, size, quality, name },
          model: GEMINI_2_5_FLASH_IMAGE_MODEL_ID,
          modelParameters: { quality, size, temperature: 0.7 },
        },
        { asType: "generation" }
      );

      generation.updateTrace({
        tags: [
          `workspaceId:${workspace.sId}`,
          `operationType:image_generation`,
          `tool:generate_image`,
        ],
        userId: workspace.sId,
      });

      try {
        const gemini = createGeminiClient();

        const aspectRatio =
          SIZE_TO_ASPECT_RATIO[size] || SIZE_TO_ASPECT_RATIO["1024x1024"];

        const response = await gemini.models.generateContent({
          model: GEMINI_2_5_FLASH_IMAGE_MODEL_ID,
          contents: prompt,
          config: {
            temperature: 0.7,
            responseModalities: ["IMAGE"],
            candidateCount: 1,
            imageConfig: {
              aspectRatio,
            },
          },
        });

        const validationResult = validateGeminiImageResponse(
          response,
          "generation",
          prompt
        );
        if (validationResult.isErr()) {
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

        return formatImageResponse(imageParts, name);
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
    },

    edit_image: async (
      {
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
      const fileResource = await FileResource.fetchById(auth, inputImageFileId);
      if (!fileResource) {
        return new Err(
          new MCPError(`File not found: ${inputImageFileId}`, {
            tracked: false,
          })
        );
      }

      // Validate file belongs to the current conversation
      const conversationId = agentLoopContext.runContext.conversation.sId;
      const belongsResult = fileResource.belongsToConversation(conversationId);
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
          ["provider:gemini"]
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
        "provider:gemini",
      ]);

      const rateLimitResult = await checkImageGenerationRateLimit(
        auth,
        workspace
      );
      if (rateLimitResult.isErr()) {
        return rateLimitResult;
      }

      const imageBase64 = buffer.toString("base64");

      const generation = startObservation(
        "image-editing",
        {
          input: {
            editPrompt: editImageInstructions,
            imageFileId: inputImageFileId,
            outputName: outputImageFileName,
            quality,
            aspectRatio,
          },
          model: GEMINI_2_5_FLASH_IMAGE_MODEL_ID,
          modelParameters: {
            quality,
            aspectRatio: aspectRatio ?? "original",
            temperature: 0.7,
          },
        },
        { asType: "generation" }
      );

      generation.updateTrace({
        tags: [`workspaceId:${workspace.sId}`, `operationType:image_editing`],
        metadata: {
          fileId: inputImageFileId,
        },
        userId: workspace.sId,
      });

      try {
        const gemini = createGeminiClient();

        // Call Gemini API with image inline data and edit prompt.
        // The contents array includes both the image and the text prompt.
        const response = await gemini.models.generateContent({
          model: GEMINI_2_5_FLASH_IMAGE_MODEL_ID,
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    data: imageBase64,
                    mimeType: contentType,
                  },
                },
                {
                  text: editImageInstructions,
                },
              ],
            },
          ],
          config: {
            temperature: 0.7,
            responseModalities: ["IMAGE"],
            candidateCount: 1,
            imageConfig: aspectRatio ? { aspectRatio } : undefined,
          },
        });

        const validationResult = validateGeminiImageResponse(
          response,
          "editing",
          editImageInstructions
        );
        if (validationResult.isErr()) {
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

        return formatImageResponse(imageParts, outputImageFileName);
      } catch (error) {
        logger.error(
          {
            error,
          },
          "Error editing image."
        );
        generation.update({
          level: "ERROR",
          statusMessage: "Error editing image",
          metadata: {
            error: normalizeError(error),
          },
        });
        generation.end();
        return new Err(new MCPError("Error editing image."));
      }
    },
  };

  return buildTools(IMAGE_GENERATION_TOOLS_METADATA, handlers);
}
