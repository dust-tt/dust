import type Anthropic from "@anthropic-ai/sdk";
import AnthropicVertex from "@anthropic-ai/vertex-sdk";

import config from "@app/lib/api/config";
import { VERTEX_MODEL_ID_MAP } from "@app/lib/api/llm/clients/anthropic/types";
import type { ModelIdType } from "@app/types/assistant/models/types";

export function getInferenceClient(
  useVertex: boolean,
  { anthropicClient }: { anthropicClient: Anthropic }
): Anthropic | AnthropicVertex {
  if (!useVertex) {
    return anthropicClient;
  }

  return new AnthropicVertex({
    region: "europe-west1",
    projectId: config.getVertexAiProjectId(),
  });
}

export function getModel(
  useVertex: boolean,
  { modelId }: { modelId: ModelIdType }
): string {
  if (!useVertex) {
    return modelId;
  }

  return VERTEX_MODEL_ID_MAP[modelId] ?? modelId;
}
