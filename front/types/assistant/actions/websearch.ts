import * as t from "io-ts";

import type { ModelId } from "../../shared/model_id";
import type { BaseAction } from ".";

export type WebsearchConfigurationType = {
  id: ModelId;
  sId: string;

  type: "websearch_configuration";

  name: string;
  description: string | null;
};

// Type fresh out from the Dust app
const WebsearchAppResultSchema = t.type({
  title: t.string,
  snippet: t.string,
  link: t.string,
});
export const WebsearchAppActionOutputSchema = t.union([
  t.type({
    results: t.array(WebsearchAppResultSchema),
  }),
  t.type({
    error: t.string,
    results: t.array(WebsearchAppResultSchema),
  }),
]);
// Type after processing in the run loop (to add references)
const WebsearchResultSchema = t.type({
  title: t.string,
  snippet: t.string,
  link: t.string,
  reference: t.string,
});
export const WebsearchActionOutputSchema = t.union([
  t.type({
    results: t.array(WebsearchResultSchema),
  }),
  t.type({
    results: t.array(WebsearchResultSchema),
    error: t.string,
  }),
]);

export type WebsearchActionOutputType = t.TypeOf<
  typeof WebsearchActionOutputSchema
>;

export type WebsearchResultType = t.TypeOf<typeof WebsearchResultSchema>;

export interface WebsearchActionType extends BaseAction {
  agentMessageId: ModelId;
  query: string;
  output: WebsearchActionOutputType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "websearch_action";
}

/**
 * WebSearch Action Events
 */

// Event sent before the execution with the finalized params to be used.
export type WebsearchParamsEvent = {
  type: "websearch_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: WebsearchActionType;
};

export type WebsearchErrorEvent = {
  type: "websearch_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type WebsearchSuccessEvent = {
  type: "websearch_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: WebsearchActionType;
};
