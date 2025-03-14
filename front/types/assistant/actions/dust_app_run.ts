import type { SupportedFileContentType } from "../../files";
import type { ModelId } from "../../shared/model_id";
import type { BaseAction } from "./index";

export type DustAppRunConfigurationType = {
  id: ModelId;
  sId: string;

  type: "dust_app_run_configuration";

  appWorkspaceId: string;
  appId: string;

  name: string;
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
  resultsFileId: string | null;
  resultsFileSnippet: string | null;
  resultsFileContentType: SupportedFileContentType | null;
  type: "dust_app_run_action";
}

/**
 * DustAppRun Action Events
 */

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

export function getDustAppRunResultsFileTitle({
  appName,
  resultsFileContentType,
}: {
  appName: string;
  resultsFileContentType: SupportedFileContentType;
}): string {
  const extension = resultsFileContentType.split("/").pop();
  let title = `${appName}_output`;
  if (extension) {
    title += `.${extension}`;
  }
  return title;
}
