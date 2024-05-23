import { ModelId } from "../../../shared/model_id";
import { BaseAction } from "../../lib/api/assistant/actions";

export type WebsearchConfigurationType = {
  id: ModelId;
  sId: string;
  type: "websearch_configuration";
  name: string | null;
  description: string | null;
  forceUseAtIteration: number | null;
};

export type WebsearchActionOutputType = {
  results: {
    title: string;
    snippet: string;
    url: string;
  }[];
};

export interface WebsearchActionType extends BaseAction {
  agentMessageId: ModelId;
  query: string;
  output: WebsearchActionOutputType;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}
