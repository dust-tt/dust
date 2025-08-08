import assert from "assert";

import type { ActionBaseParams } from "@app/lib/actions/mcp";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { ModelId } from "@app/types";
import { isFunctionCallContent } from "@app/types/assistant/agent_message_content";

// TODO(DURABLE-AGENTS 2025-08-08): Clean up once we have full DRY the activities.

/**
 * Builds ActionBaseParams from stepContentId and action data.
 */
export async function buildActionBaseParams({
  agentMessageId,
  citationsAllocated,
  mcpServerConfigurationId,
  step,
  stepContentId,
}: {
  agentMessageId: number;
  citationsAllocated: number;
  mcpServerConfigurationId: string;
  step: number;
  stepContentId: ModelId;
}): Promise<ActionBaseParams> {
  // Fetch and validate step content.
  const stepContent =
    await AgentStepContentResource.fetchByModelId(stepContentId);
  assert(
    stepContent,
    `Step content not found for stepContentId: ${stepContentId}`
  );

  if (!isFunctionCallContent(stepContent.value)) {
    throw new Error(
      `Expected step content to be a function call, got: ${stepContent.value.type}`
    );
  }

  const rawInputs = JSON.parse(stepContent.value.value.arguments);
  const { id: functionCallId, name: functionCallName } =
    stepContent.value.value;

  return {
    agentMessageId,
    citationsAllocated,
    functionCallId,
    functionCallName,
    generatedFiles: [],
    mcpServerConfigurationId,
    params: rawInputs,
    step,
  };
}
