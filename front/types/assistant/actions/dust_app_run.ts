import { ModelId } from "@app/lib/databases";
import { AgentActionConfigurationType } from "@app/types/assistant/agent";
import { AgentActionType } from "@app/types/assistant/conversation";

export type DustAppRunConfigurationType = {
  id: ModelId;
  sId: string;

  type: "dust_app_run_configuration";

  appWorkspaceId: string;
  appId: string;
};

export function isDustAppRunConfiguration(
  arg: AgentActionConfigurationType | null
): arg is DustAppRunConfigurationType {
  return arg !== null && arg.type && arg.type === "dust_app_run_configuration";
}

export function isDustAppRunActionType(
  arg: AgentActionType
): arg is DustAppRunActionType {
  return arg.type === "dust_app_run_action";
}

export type DatasetEntry = {
  [key: string]: any;
};

export type DustAppParameters = {
  [key: string]: string | number | boolean;
};

export type DustAppRunActionType = {
  id: ModelId; // AgentDustAppRun.
  type: "dust_app_run_action";
  appWorkspaceId: string;
  appId: string;
  appName: string;
  params: DustAppParameters;
  runningBlock: {
    type: string;
    name: string;
  } | null;
  output: unknown | null;
};
