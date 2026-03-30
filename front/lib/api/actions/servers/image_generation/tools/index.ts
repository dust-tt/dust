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
  sendImageProgressNotification,
  trackTokenUsage,
  uploadAndFormatImageResponse,
} from "@app/lib/api/actions/servers/image_generation/helpers";
import { IMAGE_GENERATION_TOOLS_METADATA } from "@app/lib/api/actions/servers/image_generation/metadata";
import { getImageGenerationLLM } from "@app/lib/api/llm/getImageGenerationLLM";
import type { ImageGenerationInput } from "@app/lib/api/llm/imageGeneration";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { getStatsDClient } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
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

      const imageGenerationModel = await getImageGenerationLLM(auth);

      if (!imageGenerationModel) {
        const errorMessage =
          "No image generation model available for this workspace.";
        logger.error({ workspaceId: workspace.sId }, errorMessage);
        return new Err(new MCPError(errorMessage, { tracked: false }));
      }

      const { providerId } = imageGenerationModel;

      getStatsDClient().increment("tools.image_generation.generated", 1, [
        `aspect_ratio:${aspectRatio}`,
        `image_count:${referenceImages?.length ?? 0}`,
        `quality:${quality}`,
        `provider:${providerId}`,
      ]);

      const rateLimitResult = await checkImageGenerationRateLimit(
        auth,
        workspace,
        providerId
      );
      if (rateLimitResult.isErr()) {
        return rateLimitResult;
      }

      let referenceFileResources: FileResource[] = [];

      if (referenceImages && referenceImages.length > 0) {
        const processResult = await processImageFileIds(auth, {
          imageFileIds: referenceImages,
          agentLoopContext,
          supportedContentTypes: imageGenerationModel.supportedContentTypes,
          providerId,
        });
        if (processResult.isErr()) {
          return processResult;
        }
        referenceFileResources = processResult.value;
      }

      const generationInput = {
        prompt,
        aspectRatio,
        fileResources: referenceFileResources,
        quality,
      } satisfies ImageGenerationInput;

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
          model: imageGenerationModel.modelId,
          modelParameters:
            imageGenerationModel.getModelParameters(generationInput),
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

      const generationResult =
        await imageGenerationModel.generateImage(generationInput);

      if (generationResult.isErr()) {
        const genError = generationResult.error;
        const tracked = genError.code !== "safety_blocked";

        logger.error(
          {
            error: genError,
          },
          "Error generating image."
        );
        generation.update({
          level: "ERROR",
          statusMessage: "Error generating image",
          metadata: {
            error: normalizeError(genError),
          },
        });
        generation.end();

        return new Err(
          new MCPError(genError.message, { tracked, cause: genError })
        );
      }

      const { images, usageMetadata } = generationResult.value;

      trackTokenUsage({
        ...usageMetadata,
        providerId: imageGenerationModel.providerId,
      });

      const { inputTokens, outputTokens, totalTokens, costDetails } =
        computeImageGenerationCostDetails(
          usageMetadata,
          imageGenerationModel.modelId
        );

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
