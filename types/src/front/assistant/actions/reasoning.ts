import { BaseAction } from "../../../front/assistant/actions/index";
import { ModelId } from "../../../shared/model_id";
import {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffortIdType,
} from "../../lib/assistant";
import { TokensClassification } from "../generation";

export type ReasoningConfigurationType = {
  description: string | null;
  id: ModelId;
  name: string;
  sId: string;
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  temperature: number | null;
  reasoningEffort: ReasoningEffortIdType | null;
  type: "reasoning_configuration";
};

export interface ReasoningActionType extends BaseAction {
  id: ModelId;
  output: string | null;
  thinking: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  agentMessageId: ModelId;
  step: number;
  type: "reasoning_action";
}

export type ReasoningErrorEvent = {
  type: "reasoning_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: "reasoning_error";
    message: string;
  };
};

export type ReasoningStartedEvent = {
  type: "reasoning_started";
  created: number;
  configurationId: string;
  messageId: string;
  action: ReasoningActionType;
};

export type ReasoningThinkingEvent = {
  type: "reasoning_thinking";
  created: number;
  configurationId: string;
  messageId: string;
  action: ReasoningActionType;
};

export type ReasoningSuccessEvent = {
  type: "reasoning_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: ReasoningActionType;
};

export type ReasoningTokensEvent = {
  type: "reasoning_tokens";
  created: number;
  configurationId: string;
  messageId: string;
  action: ReasoningActionType;
  content: string;
  classification: TokensClassification;
};
