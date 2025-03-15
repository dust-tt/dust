import * as t from "io-ts";

import type { BaseAction } from "@app/lib/actions/types";
import type { ModelId } from "@app/types";

export type BrowseConfigurationType = {
  id: ModelId;
  sId: string;

  type: "browse_configuration";

  name: string;
  description: string | null;
};

export const BrowseResultSchema = t.type({
  requestedUrl: t.string,
  browsedUrl: t.string,
  content: t.string,
  responseCode: t.string,
  errorMessage: t.string,
});

export const BrowseActionOutputSchema = t.type({
  results: t.array(BrowseResultSchema),
});

export type BrowseActionOutputType = t.TypeOf<typeof BrowseActionOutputSchema>;

export type BrowseResultType = t.TypeOf<typeof BrowseResultSchema>;

export interface BrowseActionType extends BaseAction {
  agentMessageId: ModelId;
  urls: string[];
  output: BrowseActionOutputType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "browse_action";
}

/**
 * Browse Action Events
 */

// Event sent before the execution with the finalized params to be used.
export type BrowseParamsEvent = {
  type: "browse_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: BrowseActionType;
};

export type BrowseErrorEvent = {
  type: "browse_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type BrowseSuccessEvent = {
  type: "browse_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: BrowseActionType;
};
