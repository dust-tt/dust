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
  results: WebsearchResultType[];
};

export type WebsearchResultType = {
  title: string;
  snippet: string;
  link: string;
};

export interface WebsearchActionType extends BaseAction {
  agentMessageId: ModelId;
  query: string;
  output: WebsearchActionOutputType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}
