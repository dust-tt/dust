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
  processImageFileIds,
  QUALITY_TO_IMAGE_SIZE,
  sendImageProgressNotification,
  trackTokenUsage,
  uploadAndFormatImageResponse,
} from "@app/lib/api/actions/servers/image_generation/helpers";
import { IMAGE_GENERATION_TOOLS_METADATA } from "@app/lib/api/actions/servers/image_generation/metadata";
import { ImageGenerationGoogleLLM } from "@app/lib/api/llm/clients/google/imageGeneration";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { Err } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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

      getStatsDClient().increment("tools.image_generation.generated", 1, [
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

      const credentials = await getLlmCredentials(auth, {
        skipEmbeddingApiKeyRequirement: true,
      });

      const generationImageModel = new ImageGenerationGoogleLLM(auth, {
        modelId: GEMINI_3_PRO_IMAGE_MODEL_ID,
        credentials,
      });

      let referenceFileResources: FileResource[] = [];

      if (referenceImages && referenceImages.length > 0) {
        const processResult = await processImageFileIds(auth, {
          imageFileIds: referenceImages,
          agentLoopContext,
          supportedContentTypes: generationImageModel.supportedContentTypes,
        });
        if (processResult.isErr()) {
          return processResult;
        }
        referenceFileResources = processResult.value;
      }

      const imageSize = QUALITY_TO_IMAGE_SIZE[quality];

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

      const generationResult = await generationImageModel.generateImage({
        prompt,
        aspectRatio,
        fileResources: referenceFileResources,
        quality,
      });

      if (generationResult.isErr()) {
        logger.error(
          {
            error: generationResult.error,
          },
          "Error generating image."
        );
        generation.update({
          level: "ERROR",
          statusMessage: "Error generating image",
          metadata: {
            error: normalizeError(generationResult.error),
          },
        });
        generation.end();

        return new Err(new MCPError("Error generating image."));
      }

      const { images, usageMetadata } = generationResult.value;

      trackTokenUsage({
        ...usageMetadata,
        providerId: generationImageModel.providerId,
      });

      const { inputTokens, outputTokens, totalTokens, costDetails } =
        computeImageGenerationCostDetails(usageMetadata);

      generation.update({
        usageDetails: {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens,
        },
        costDetails,
      });

      generation.end();

      return uploadAndFormatImageResponse(
        auth,
        agentLoopContext,
        images,
        outputName
      );
    },
  };

  return buildTools(IMAGE_GENERATION_TOOLS_METADATA, handlers);
}
