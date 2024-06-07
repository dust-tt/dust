import { BaseAction } from "../../../front/lib/api/assistant/actions/index";
import { ModelId } from "../../../shared/model_id";

export type DustAppRunConfigurationType = {
  id: ModelId;
  sId: string;

  type: "dust_app_run_configuration";

  appWorkspaceId: string;
  appId: string;

  name: string | null;
  description: string | null;
};

export type DustAppParameters = {
  [key: string]: string | number | boolean;
};

export interface DustAppRunActionType extends BaseAction {
  agentMessageId: ModelId;
  appWorkspaceId: string;
  appId: string;
  appName: string;
  params: DustAppParameters;
  runningBlock: {
    type: string;
    name: string;
    status: "running" | "succeeded" | "errored";
  } | null;
  output: unknown | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "dust_app_run_action";
}
