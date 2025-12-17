import { GeminiImageProvider } from "@app/lib/actions/mcp_internal_actions/servers/image_generation/gemini_provider";
import type { ImageModelProvider } from "@app/lib/actions/mcp_internal_actions/servers/image_generation/types";
import type { ImageModelConfigurationType } from "@app/types/assistant/models/image_models";

/**
 * Create an image provider instance for the given model configuration.
 */
export function createImageProvider(
  model: ImageModelConfigurationType
): ImageModelProvider {
  switch (model.providerId) {
    case "google_ai_studio":
      return new GeminiImageProvider(model.modelId);

    // Future providers can be added here:
    // case "openai":
    //   return new OpenAIImageProvider(model.modelId);

    default:
      throw new Error(`Unsupported image provider: ${model.providerId}`);
  }
}
