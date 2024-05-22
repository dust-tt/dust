import { ModelId } from "../../../shared/model_id";
import { BaseAction } from "../../lib/api/assistant/actions/index";

export type BrowseConfigurationType = {
  id: ModelId;
  sId: string;

  type: "browse_configuration";

  name: string | null;
  description: string | null;

  forceUseAtIteration: number | null;
};

export interface BrowseActionType extends BaseAction {
  agentMessageId: ModelId;
  url: string;
  output: unknown | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}
