import { ModelId } from "../../../shared/model_id";
import { BaseAction } from "../../lib/api/assistant/actions";

export type RequestUserDataConfigurationType = {
  id: ModelId;
  sId: string;
  type: "request_user_data_configuration";

  name: string;
  description: string | null;
  available_data: string[];
};

export type RequestUserDataActionOutputType = {
  name: string;
  value: string;
};

export interface RequestUserDataActionType extends BaseAction {
  outputs: RequestUserDataActionOutputType[] | null;
  functionCallId: string | null;
  functionCallName: string | null;
  params: {
    requested_data: string[];
  };
  step: number;
  type: "request_user_data_action";
}
