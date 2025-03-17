import { BaseAction } from "../../../front/assistant/actions/index";
import { DataSourceConfiguration, RetrievalTimeframe, TimeFrame } from "../../../front/assistant/actions/retrieval";
import { ModelId } from "../../../shared/model_id";
export declare const PROCESS_SCHEMA_ALLOWED_TYPES: readonly ["string", "number", "boolean"];
export type ProcessSchemaPropertyType = {
    name: string;
    type: (typeof PROCESS_SCHEMA_ALLOWED_TYPES)[number];
    description: string;
};
export declare function renderSchemaPropertiesAsJSONSchema(schema: ProcessSchemaPropertyType[]): {
    [name: string]: {
        type: string;
        description: string;
    };
};
export type ProcessTagsFilter = {
    in: string[];
};
export type ProcessConfigurationType = {
    id: ModelId;
    sId: string;
    type: "process_configuration";
    dataSources: DataSourceConfiguration[];
    relativeTimeFrame: RetrievalTimeframe;
    schema: ProcessSchemaPropertyType[];
    name: string;
    description: string | null;
};
export type ProcessActionOutputsType = {
    data: unknown[];
    min_timestamp: number;
    total_documents: number;
    total_chunks: number;
    total_tokens: number;
};
export declare const PROCESS_ACTION_TOP_K = 768;
export interface ProcessActionType extends BaseAction {
    id: ModelId;
    agentMessageId: ModelId;
    params: {
        relativeTimeFrame: TimeFrame | null;
        tagsIn: string[] | null;
        tagsNot: string[] | null;
    };
    schema: ProcessSchemaPropertyType[];
    outputs: ProcessActionOutputsType | null;
    functionCallId: string | null;
    functionCallName: string | null;
    step: number;
    type: "process_action";
}
/**
 * Process Action Events
 */
export type ProcessParamsEvent = {
    type: "process_params";
    created: number;
    configurationId: string;
    messageId: string;
    dataSources: DataSourceConfiguration[];
    action: ProcessActionType;
};
export type ProcessErrorEvent = {
    type: "process_error";
    created: number;
    configurationId: string;
    messageId: string;
    error: {
        code: string;
        message: string;
    };
};
export type ProcessSuccessEvent = {
    type: "process_success";
    created: number;
    configurationId: string;
    messageId: string;
    action: ProcessActionType;
};
//# sourceMappingURL=process.d.ts.map