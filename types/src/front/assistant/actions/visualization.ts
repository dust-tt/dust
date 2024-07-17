import * as t from "io-ts";

import { ModelId } from "../../../shared/model_id";
import { BaseAction } from "../../lib/api/assistant/actions";

// Configuration
export type VisualizationConfigurationType = {
  id: ModelId; // AgentVisualizationConfiguration ID
  sId: string;
  type: "visualization_configuration";
  name: string;
  description: string | null;
};

// Action execution
export interface VisualizationActionType extends BaseAction {
  agentMessageId: ModelId;
  generation: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "visualization_action";
}

export const VisualizationActionOutputSchema = t.type({
  generation: t.string,
});

function visualizationExtractCodeNonStreaming(code: string) {
  const regex = /<visualization[^>]*>\s*([\s\S]*?)\s*<\/visualization>/;
  let extractedCode: string | null = null;
  const match = code.match(regex);
  if (match && match[1]) {
    extractedCode = match[1];
  }
  if (!extractedCode) {
    return null;
  }
  return extractedCode;
}

function visualizationExtractCodeStreaming(code: string) {
  const regex = /<visualization[^>]*>(.*)/;
  let extractedCode: string | null = null;
  const match = code.match(regex);
  if (match && match[0]) {
    extractedCode = match[0];
  }
  if (!extractedCode) {
    return null;
  }
  return extractedCode;
}

export function visualizationExtractCode(code: string) {
  return (
    visualizationExtractCodeNonStreaming(code) ||
    visualizationExtractCodeStreaming(code)
  );
}
