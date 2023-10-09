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
  [key: string]: {
    expectedType: "string" | "number" | "boolean";
    value: unknown;
  };
};

export type DustAppRunActionType = {
  id: ModelId; // AgentDustAppRun.
  type: "dust_app_run_action";
  app: {
    workspaceId: string;
    sId: string;
    name: string;
  };
  params: DustAppParameters;
  output: unknown | null;
};
