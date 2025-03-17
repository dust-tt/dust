import { DustAppParameters } from "../../../front/assistant/actions/dust_app_run";
import { BaseAction } from "../../../front/assistant/actions/index";
import { ModelId } from "../../../shared/model_id";
export type TablesQueryConfigurationType = {
    description: string | null;
    id: ModelId;
    name: string;
    sId: string;
    tables: TableDataSourceConfiguration[];
    type: "tables_query_configuration";
};
export type TableDataSourceConfiguration = {
    workspaceId: string;
    dataSourceViewId: string;
    tableId: string;
};
export interface TablesQueryActionType extends BaseAction {
    id: ModelId;
    params: DustAppParameters;
    output: Record<string, string | number | boolean> | null;
    resultsFileId: string | null;
    resultsFileSnippet: string | null;
    sectionFileId: string | null;
    functionCallId: string | null;
    functionCallName: string | null;
    agentMessageId: ModelId;
    step: number;
    type: "tables_query_action";
}
export declare function getTablesQueryResultsFileTitle({ output, }: {
    output: Record<string, unknown> | null;
}): string;
export declare function getTablesQueryResultsFileAttachments({ resultsFileId, resultsFileSnippet, sectionFileId, output, }: {
    resultsFileId: string | null;
    resultsFileSnippet: string | null;
    sectionFileId: string | null;
    output: Record<string, unknown> | null;
}): string | null;
/**
 * TablesQuey Events
 */
export type TablesQueryErrorEvent = {
    type: "tables_query_error";
    created: number;
    configurationId: string;
    messageId: string;
    error: {
        code: "tables_query_error" | "too_many_result_rows";
        message: string;
    };
};
export type TablesQueryStartedEvent = {
    type: "tables_query_started";
    created: number;
    configurationId: string;
    messageId: string;
    action: TablesQueryActionType;
};
export type TablesQueryModelOutputEvent = {
    type: "tables_query_model_output";
    created: number;
    configurationId: string;
    messageId: string;
    action: TablesQueryActionType;
};
export type TablesQueryOutputEvent = {
    type: "tables_query_output";
    created: number;
    configurationId: string;
    messageId: string;
    action: TablesQueryActionType;
};
//# sourceMappingURL=tables_query.d.ts.map