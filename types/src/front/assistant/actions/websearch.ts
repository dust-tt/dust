import * as t from "io-ts";

import { ModelId } from "../../../shared/model_id";
import { BaseAction } from "../../lib/api/assistant/actions";

export type WebsearchConfigurationType = {
  id: ModelId;
  sId: string;

  type: "websearch_configuration";

  name: string;
  description: string | null;
};

const WebsearchRunOutputResultSchema = t.type({
  title: t.string,
  snippet: t.string,
  sourceUrl: t.string,
  link: t.union([t.string, t.undefined]), // @todo[daph] 2024-07-19 Remove the fallback on link.
});
export const WebsearchRunOutputSchema = t.union([
  t.type({
    results: t.array(WebsearchRunOutputResultSchema),
  }),
  t.type({
    results: t.array(WebsearchRunOutputResultSchema),
    error: t.string,
  }),
]);

export type WebsearchResultType = t.TypeOf<
  typeof WebsearchRunOutputResultSchema
> & {
  type: "websearch_result";
  reference: string;
};

export type WebsearchActionOutputType = {
  results: WebsearchResultType[];
  error?: string | null;
};

export interface WebsearchActionType extends BaseAction {
  agentMessageId: ModelId;
  query: string;
  output: WebsearchActionOutputType | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "websearch_action";
}
