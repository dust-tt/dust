import * as t from "io-ts";
import { BaseAction } from "../../../front/assistant/actions";
import { ModelId } from "../../../shared/model_id";
export type BrowseConfigurationType = {
    id: ModelId;
    sId: string;
    type: "browse_configuration";
    name: string;
    description: string | null;
};
export declare const BrowseResultSchema: t.TypeC<{
    requestedUrl: t.StringC;
    browsedUrl: t.StringC;
    content: t.StringC;
    responseCode: t.StringC;
    errorMessage: t.StringC;
}>;
export declare const BrowseActionOutputSchema: t.TypeC<{
    results: t.ArrayC<t.TypeC<{
        requestedUrl: t.StringC;
        browsedUrl: t.StringC;
        content: t.StringC;
        responseCode: t.StringC;
        errorMessage: t.StringC;
    }>>;
}>;
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
//# sourceMappingURL=browse.d.ts.map