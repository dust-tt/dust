import * as t from "io-ts";
import { BaseAction } from "../../../front/assistant/actions";
import { ModelId } from "../../../shared/model_id";
export type WebsearchConfigurationType = {
    id: ModelId;
    sId: string;
    type: "websearch_configuration";
    name: string;
    description: string | null;
};
export declare const WebsearchAppActionOutputSchema: t.UnionC<[t.TypeC<{
    results: t.ArrayC<t.TypeC<{
        title: t.StringC;
        snippet: t.StringC;
        link: t.StringC;
    }>>;
}>, t.TypeC<{
    error: t.StringC;
    results: t.ArrayC<t.TypeC<{
        title: t.StringC;
        snippet: t.StringC;
        link: t.StringC;
    }>>;
}>]>;
declare const WebsearchResultSchema: t.TypeC<{
    title: t.StringC;
    snippet: t.StringC;
    link: t.StringC;
    reference: t.StringC;
}>;
export declare const WebsearchActionOutputSchema: t.UnionC<[t.TypeC<{
    results: t.ArrayC<t.TypeC<{
        title: t.StringC;
        snippet: t.StringC;
        link: t.StringC;
        reference: t.StringC;
    }>>;
}>, t.TypeC<{
    results: t.ArrayC<t.TypeC<{
        title: t.StringC;
        snippet: t.StringC;
        link: t.StringC;
        reference: t.StringC;
    }>>;
    error: t.StringC;
}>]>;
export type WebsearchActionOutputType = t.TypeOf<typeof WebsearchActionOutputSchema>;
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
export {};
//# sourceMappingURL=websearch.d.ts.map