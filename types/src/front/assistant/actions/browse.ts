import * as t from "io-ts";

import { ModelId } from "../../../shared/model_id";
import { BaseAction } from "../../lib/api/assistant/actions";

export type BrowseConfigurationType = {
  id: ModelId;
  sId: string;
  type: "browse_configuration";
  name: string | null;
  description: string | null;
};

export const BrowseResultSchema = t.type({
  content: t.string,
  response: t.type({
    code: t.string,
    url: t.string,
    ip: t.string,
    port: t.string,
  }),
});

export const BrowseActionOutputSchema = t.union([
  t.type({
    results: t.array(BrowseResultSchema),
  }),
  t.type({
    results: t.array(BrowseResultSchema),
    error: t.string,
  }),
]);

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
