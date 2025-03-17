/**
 * Data Source configuration
 */
import { BaseAction } from "../../../front/assistant/actions/index";
import { ConnectorProvider } from "../../../front/data_source";
import { DataSourceViewType, TagsFilter } from "../../../front/data_source_view";
import { ModelId } from "../../../shared/model_id";
export declare const TIME_FRAME_UNITS: readonly ["hour", "day", "week", "month", "year"];
export type TimeframeUnit = (typeof TIME_FRAME_UNITS)[number];
export declare const TimeframeUnitCodec: import("io-ts").Type<"hour" | "day" | "week" | "month" | "year", "hour" | "day" | "week" | "month" | "year", unknown>;
export type TimeFrame = {
    duration: number;
    unit: TimeframeUnit;
};
export declare function isTimeFrame(arg: RetrievalTimeframe): arg is TimeFrame;
export type DataSourceFilter = {
    parents: {
        in: string[];
        not: string[];
    } | null;
    tags?: TagsFilter;
};
export type DataSourceConfiguration = {
    workspaceId: string;
    dataSourceViewId: string;
    filter: DataSourceFilter;
};
/**
 * Retrieval configuration
 */
export type RetrievalQuery = "auto" | "none";
export type RetrievalTimeframe = "auto" | "none" | TimeFrame;
export type RetrievalConfigurationType = {
    id: ModelId;
    sId: string;
    type: "retrieval_configuration";
    dataSources: DataSourceConfiguration[];
    query: RetrievalQuery;
    relativeTimeFrame: RetrievalTimeframe;
    topK: number | "auto";
    name: string;
    description: string | null;
};
/**
 * Retrieval action
 */
export interface RetrievalDocumentChunkType {
    offset: number;
    score: number | null;
    text: string;
}
export interface RetrievalDocumentType {
    chunks: RetrievalDocumentChunkType[];
    documentId: string;
    dataSourceView: DataSourceViewType | null;
    id: ModelId;
    reference: string;
    score: number | null;
    sourceUrl: string | null;
    tags: string[];
    timestamp: number;
}
type ConnectorProviderDocumentType = Exclude<ConnectorProvider, "webcrawler"> | "document";
export declare function getProviderFromRetrievedDocument(document: RetrievalDocumentType): ConnectorProviderDocumentType;
export declare function getTitleFromRetrievedDocument(document: RetrievalDocumentType): string;
export interface RetrievalActionType extends BaseAction {
    id: ModelId;
    agentMessageId: ModelId;
    params: {
        relativeTimeFrame: TimeFrame | null;
        query: string | null;
        topK: number;
        tagsIn: string[] | null;
        tagsNot: string[] | null;
    };
    functionCallId: string | null;
    functionCallName: string | null;
    documents: RetrievalDocumentType[] | null;
    step: number;
    type: "retrieval_action";
}
/**
 * Retrieval Action Events
 */
export type RetrievalParamsEvent = {
    type: "retrieval_params";
    created: number;
    configurationId: string;
    messageId: string;
    dataSources: DataSourceConfiguration[];
    action: RetrievalActionType;
};
export type RetrievalErrorEvent = {
    type: "retrieval_error";
    created: number;
    configurationId: string;
    messageId: string;
    error: {
        code: string;
        message: string;
    };
};
export type RetrievalSuccessEvent = {
    type: "retrieval_success";
    created: number;
    configurationId: string;
    messageId: string;
    action: RetrievalActionType;
};
export {};
//# sourceMappingURL=retrieval.d.ts.map