import { getFeatureFlags } from "@app/lib/auth";
import type { LLM } from "@app/lib/llm";
import { Anthropic } from "@app/lib/llm/providers/anthropic/models/anthropic";
import { GoogleLLM } from "@app/lib/llm/providers/google_ai_studio/models/googleLLM";
import { MistralLLM } from "@app/lib/llm/providers/mistral/models/mistral-large";
import { OpenAIResponses } from "@app/lib/llm/providers/openai/models/openAIResponses";
import type { WorkspaceType } from "@app/types";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/assistant";

export const getModel = async ({
  temperature,
  modelId,
  providerId,
  owner,
}: {
  temperature: number;
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  owner: WorkspaceType;
}): Promise<LLM | null> => {
  const featureFlags = await getFeatureFlags(owner);
  const shouldUseDirectLLMRequests = featureFlags.includes(
    "llm_router_direct_requests"
  );

  switch (providerId) {
    case "openai":
      switch (modelId) {
        case "gpt-4.1-2025-04-14":
        case "gpt-5":
        case "o3": {
          return shouldUseDirectLLMRequests
            ? new OpenAIResponses({ temperature, model: modelId })
            : null;
        }
        default:
          return null;
      }
    case "anthropic":
      switch (modelId) {
        case "claude-4-sonnet-20250514":
        case "claude-sonnet-4-5-20250929": {
          return shouldUseDirectLLMRequests
            ? new Anthropic({ temperature, modelId })
            : null;
        }
        default:
          return null;
      }
    case "mistral":
      switch (modelId) {
        case "mistral-large-latest":
          return shouldUseDirectLLMRequests
            ? new MistralLLM({ temperature })
            : null;
        default:
          return null;
      }
    case "google_ai_studio":
      switch (modelId) {
        case "gemini-2.5-pro":
          return shouldUseDirectLLMRequests
            ? new GoogleLLM({ temperature })
            : null;
        default:
          return null;
      }
    default:
      return null;
  }
};
