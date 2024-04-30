import type { ModelId } from "@dust-tt/types";

import type { AgentActionType } from "@app/lib/api/assistant/actions/types";

export type DustAppRunConfigurationType = {
  id: ModelId;
  sId: string;

  type: "dust_app_run_configuration";

  appWorkspaceId: string;
  appId: string;

  name: string | null;
  description: string | null;
  forceUseAtIteration: number | null;
};

export function isDustAppRunConfiguration(
  arg: unknown
): arg is DustAppRunConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "dust_app_run_configuration"
  );
}

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
    status: "running" | "succeeded" | "errored";
  } | null;
  output: unknown | null;
};

export function isDustAppRunActionType(
  arg: AgentActionType
): arg is DustAppRunActionType {
  return arg.type === "dust_app_run_action";
}

// Event sent before the execution of a dust app run with the finalized params to be used.
export type DustAppRunParamsEvent = {
  type: "dust_app_run_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: DustAppRunActionType;
};

export type DustAppRunErrorEvent = {
  type: "dust_app_run_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type DustAppRunBlockEvent = {
  type: "dust_app_run_block";
  created: number;
  configurationId: string;
  messageId: string;
  action: DustAppRunActionType;
};

export type DustAppRunSuccessEvent = {
  type: "dust_app_run_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: DustAppRunActionType;
};
