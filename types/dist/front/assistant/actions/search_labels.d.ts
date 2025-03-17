import { ModelId } from "../../../shared/model_id";
import { BaseAction } from ".";
export type SearchLabelsConfigurationType = {
    id: ModelId;
    sId: string;
    type: "search_labels_configuration";
    name: string;
    description?: string;
    dataSourceViewIds: string[];
    parentTool: string;
};
export interface SearchLabelsResultType {
    tag: string;
    match_count: number;
    data_sources: string[];
}
export interface SearchLabelsActionOutputType {
    tags: SearchLabelsResultType[];
}
export interface SearchLabelsActionType extends BaseAction {
    agentMessageId: ModelId;
    functionCallId: string | null;
    functionCallName: string | null;
    output: SearchLabelsActionOutputType | null;
    searchText: string;
    step: number;
    type: "search_labels_action";
}
/**
 * Search Labels Action Events
 */
export type SearchLabelsParamsEvent = {
    type: "search_labels_params";
    created: number;
    configurationId: string;
    messageId: string;
    action: SearchLabelsActionType;
};
export type SearchLabelsErrorEvent = {
    type: "search_labels_error";
    created: number;
    configurationId: string;
    messageId: string;
    error: {
        code: string;
        message: string;
    };
};
export type SearchLabelsSuccessEvent = {
    type: "search_labels_success";
    created: number;
    configurationId: string;
    messageId: string;
    action: SearchLabelsActionType;
};
//# sourceMappingURL=search_labels.d.ts.map