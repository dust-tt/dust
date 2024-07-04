/**
 * Action execution.
 */

import { VisualizationActionType } from "../../../../assistant/actions/visualization";

// Event sent before the execution with the finalized params to be used.
export type VisualizationParamsEvent = {
  type: "visualization_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: VisualizationActionType;
};

export type VisualizationErrorEvent = {
  type: "visualization_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type VisualizationSuccessEvent = {
  type: "visualization_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: VisualizationActionType;
};

export type VisualizationGenerationTokensEvent = {
  type: "visualization_generation_tokens";
  created: number;
  configurationId: string;
  messageId: string;
  actionId: number;
  text: string;
};
