import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  checkImageGenerationRateLimit,
  computeImageGenerationCostDetails,
  createGeminiClient,
  formatImageResponse,
  processImageFileIds,
  QUALITY_TO_IMAGE_SIZE,
  sendImageProgressNotification,
  trackGeminiTokenUsage,
  validateGeminiImageResponse,
} from "@app/lib/api/actions/servers/image_generation/helpers";
import { IMAGE_GENERATION_TOOLS_METADATA } from "@app/lib/api/actions/servers/image_generation/metadata";
import type { Authenticator } from "@app/lib/auth";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { Err } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Part } from "@google/genai";
import { startObservation } from "@langfuse/tracing";

export function createImageGenerationTools(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  const handlers: ToolHandlers<typeof IMAGE_GENERATION_TOOLS_METADATA> = {
    generate_image: async (
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
    },
  };

  return buildTools(IMAGE_GENERATION_TOOLS_METADATA, handlers);
}
