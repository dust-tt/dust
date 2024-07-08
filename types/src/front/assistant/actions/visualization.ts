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
