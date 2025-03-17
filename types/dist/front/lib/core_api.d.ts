import * as t from "io-ts";
import { CoreAPIContentNode } from "../../core/content_node";
import { CoreAPIDataSource, CoreAPIDataSourceConfig, CoreAPIDataSourceDocumentSection, CoreAPIDocument, CoreAPIDocumentBlob, CoreAPIDocumentVersion, CoreAPIFolder, CoreAPILightDocument, CoreAPITableBlob, EmbedderType } from "../../core/data_source";
import { DustAppSecretType } from "../../front/dust_app_secret";
import { GroupType } from "../../front/groups";
import { EmbeddingProviderIdType } from "../../front/lib/assistant";
import { Project } from "../../front/project";
import { CredentialsType } from "../../front/provider";
import { BlockType, RunConfig, RunRunType, RunStatus, TraceType } from "../../front/run";
import { LightWorkspaceType } from "../../front/user";
import { LoggerInterface } from "../../shared/logger";
import { Result } from "../../shared/result";
import { DataSourceViewType } from "../data_source_view";
import { ProviderVisibility } from "./connectors_api";
export declare const MAX_CHUNK_SIZE = 512;
export declare const EMBEDDING_CONFIGS: Record<EmbeddingProviderIdType, EmbedderType>;
export type CoreAPIError = {
    message: string;
    code: string;
};
export declare function isCoreAPIError(obj: unknown): obj is CoreAPIError;
export type CoreAPIResponse<T> = Result<T, CoreAPIError>;
export type CoreAPIDatasetVersion = {
    hash: string;
    created: number;
};
export type CoreAPIDatasetWithoutData = CoreAPIDatasetVersion & {
    dataset_id: string;
    keys: string[];
};
export type CoreAPIDataset = CoreAPIDatasetWithoutData & {
    data: {
        [key: string]: any;
    }[];
};
export type CoreAPIRun = {
    run_id: string;
    created: number;
    run_type: RunRunType;
    app_hash?: string | null;
    specification_hash?: string | null;
    config: RunConfig;
    status: RunStatus;
    traces: Array<[[BlockType, string], Array<Array<TraceType>>]>;
};
export type CoreAPITokenType = [number, string];
type CoreAPICreateRunParams = {
    projectId: string;
    runType: RunRunType;
    specification?: string | null;
    specificationHash?: string | null;
    datasetId?: string | null;
    inputs?: any[] | null;
    config: RunConfig;
    credentials: CredentialsType;
    secrets: DustAppSecretType[];
    isSystemKey?: boolean;
    storeBlocksResults?: boolean;
};
type GetDatasetResponse = {
    dataset: CoreAPIDataset;
};
type GetDatasetsResponse = {
    datasets: {
        [key: string]: CoreAPIDatasetVersion[];
    };
};
export type CoreAPITableSchema = {
    name: string;
    value_type: "int" | "float" | "text" | "bool" | "datetime";
    possible_values: string[] | null;
}[];
export type CoreAPITable = {
    table_id: string;
    name: string;
    description: string;
    schema: CoreAPITableSchema | null;
    timestamp: number;
    tags: string[];
    parent_id: string | null;
    parents: string[];
    created: number;
    data_source_id: string;
    title: string;
    mime_type: string;
    remote_database_table_id: string | null;
    remote_database_secret_id: string | null;
};
export type CoreAPIRowValue = number | string | boolean | {
    type: "datetime";
    epoch: number;
    string_value?: string;
} | null;
export type CoreAPIRow = {
    row_id: string;
    value: Record<string, CoreAPIRowValue>;
};
export declare function isRowMatchingSchema(row: CoreAPIRow, schema: CoreAPITableSchema): boolean;
export type CoreAPIQueryResult = {
    value: Record<string, unknown>;
};
export type CoreAPISearchFilter = {
    tags: {
        in: string[] | null;
        not: string[] | null;
    } | null;
    parents: {
        in: string[] | null;
        not: string[] | null;
    } | null;
    timestamp: {
        gt: number | null;
        lt: number | null;
    } | null;
};
export type CoreAPISortSpec = {
    field: string;
    direction: "asc" | "desc";
};
export type CoreAPISearchOptions = {
    limit?: number;
    cursor?: string;
    sort?: CoreAPISortSpec[];
};
export interface CoreAPISearchCursorRequest {
    sort?: CoreAPISortSpec[];
    limit?: number;
    cursor?: string;
}
export type SearchWarningCode = "truncated-query-clauses";
export interface CoreAPISearchNodesResponse {
    nodes: CoreAPIContentNode[];
    next_page_cursor: string | null;
    hit_count: number;
    hit_count_is_accurate: boolean;
    warning_code: SearchWarningCode | null;
}
export interface CoreAPISearchTagsResponse {
    tags: {
        tag: string;
        match_count: number;
        data_sources: string[];
    }[];
}
export declare const CoreAPISearchScopeSchema: t.UnionC<[t.LiteralC<"nodes_titles">, t.LiteralC<"data_source_name">, t.LiteralC<"both">]>;
export type CoreAPISearchScope = t.TypeOf<typeof CoreAPISearchScopeSchema>;
export declare const CoreAPIDatasourceViewFilterSchema: t.IntersectionC<[t.TypeC<{
    data_source_id: t.StringC;
    view_filter: t.ArrayC<t.StringC>;
}>, t.PartialC<{
    search_scope: t.UnionC<[t.LiteralC<"nodes_titles">, t.LiteralC<"data_source_name">, t.LiteralC<"both">]>;
}>]>;
export type CoreAPIDatasourceViewFilter = t.TypeOf<typeof CoreAPIDatasourceViewFilterSchema>;
export declare const MIN_SEARCH_QUERY_SIZE = 2;
export declare const CoreAPINodesSearchFilterSchema: t.IntersectionC<[t.TypeC<{
    data_source_views: t.ArrayC<t.IntersectionC<[t.TypeC<{
        data_source_id: t.StringC;
        view_filter: t.ArrayC<t.StringC>;
    }>, t.PartialC<{
        search_scope: t.UnionC<[t.LiteralC<"nodes_titles">, t.LiteralC<"data_source_name">, t.LiteralC<"both">]>;
    }>]>>;
}>, t.PartialC<{
    excluded_node_mime_types: t.UnionC<[t.ReadonlyArrayC<t.StringC>, t.UndefinedC]>;
    node_ids: t.ArrayC<t.StringC>;
    node_types: t.ArrayC<t.StringC>;
    parent_id: t.StringC;
    query: t.StringC;
}>]>;
export type CoreAPINodesSearchFilter = t.TypeOf<typeof CoreAPINodesSearchFilterSchema>;
export interface CoreAPIDataSourceStatsResponse {
    data_source: {
        data_source_id: string;
        data_source_internal_id: string;
        timestamp: number;
        name: string;
        text_size: number;
        document_count: number;
    };
}
export interface CoreAPIUpsertDataSourceDocumentPayload {
    projectId: string;
    dataSourceId: string;
    documentId: string;
    timestamp?: number | null;
    tags: string[];
    parentId: string | null;
    parents: string[];
    sourceUrl?: string | null;
    section: CoreAPIDataSourceDocumentSection;
    credentials: CredentialsType;
    lightDocumentOutput?: boolean;
    title: string;
    mimeType: string;
}
export declare class CoreAPI {
    _url: string;
    _logger: LoggerInterface;
    _apiKey: string | null;
    constructor(config: {
        url: string;
        apiKey: string | null;
    }, logger: LoggerInterface);
    createProject(): Promise<CoreAPIResponse<{
        project: Project;
    }>>;
    deleteProject({ projectId, }: {
        projectId: string;
    }): Promise<CoreAPIResponse<{
        success: true;
    }>>;
    getDatasets({ projectId, }: {
        projectId: string;
    }): Promise<CoreAPIResponse<GetDatasetsResponse>>;
    getDataset({ projectId, datasetName, datasetHash, }: {
        projectId: string;
        datasetName: string;
        datasetHash: string;
    }): Promise<CoreAPIResponse<GetDatasetResponse>>;
    createDataset({ projectId, datasetId, data, }: {
        projectId: string;
        datasetId: string;
        data: any[];
    }): Promise<CoreAPIResponse<{
        dataset: CoreAPIDatasetWithoutData;
    }>>;
    cloneProject({ projectId, }: {
        projectId: string;
    }): Promise<CoreAPIResponse<{
        project: Project;
    }>>;
    createRun(workspace: LightWorkspaceType, groups: GroupType[], { projectId, runType, specification, specificationHash, datasetId, inputs, config, credentials, secrets, isSystemKey, storeBlocksResults, }: CoreAPICreateRunParams): Promise<CoreAPIResponse<{
        run: CoreAPIRun;
    }>>;
    createRunStream(workspace: LightWorkspaceType, groups: GroupType[], { projectId, runType, specification, specificationHash, datasetId, inputs, config, credentials, secrets, isSystemKey, storeBlocksResults, }: CoreAPICreateRunParams): Promise<CoreAPIResponse<{
        chunkStream: AsyncGenerator<Uint8Array, void, unknown>;
        dustRunId: Promise<string>;
    }>>;
    deleteRun({ projectId, runId, }: {
        projectId: string;
        runId: string;
    }): Promise<CoreAPIResponse<{
        success: true;
    }>>;
    getRunsBatch({ projectId, dustRunIds, }: {
        projectId: string;
        dustRunIds: string[];
    }): Promise<CoreAPIResponse<{
        runs: {
            [key: string]: CoreAPIRun;
        };
    }>>;
    getRun({ projectId, runId, }: {
        projectId: string;
        runId: string;
    }): Promise<CoreAPIResponse<{
        run: CoreAPIRun;
    }>>;
    getRunStatus({ projectId, runId, }: {
        projectId: string;
        runId: string;
    }): Promise<CoreAPIResponse<{
        run: CoreAPIRun;
    }>>;
    getSpecificationHashes({ projectId, }: {
        projectId: string;
    }): Promise<CoreAPIResponse<{
        hashes: string[];
    }>>;
    getSpecification({ projectId, specificationHash, }: {
        projectId: string;
        specificationHash: string;
    }): Promise<CoreAPIResponse<{
        specification: {
            created: number;
            data: string;
        };
    }>>;
    saveSpecification({ projectId, specification, }: {
        projectId: string;
        specification: string;
    }): Promise<CoreAPIResponse<{
        success: true;
    }>>;
    getRunBlock({ projectId, runId, blockType, blockName, }: {
        projectId: string;
        runId: string;
        blockType: BlockType;
        blockName: string;
    }): Promise<CoreAPIResponse<{
        run: CoreAPIRun;
    }>>;
    createDataSource({ projectId, config, credentials, name, }: {
        projectId: string;
        config: CoreAPIDataSourceConfig;
        credentials: CredentialsType;
        name: string;
    }): Promise<CoreAPIResponse<{
        data_source: CoreAPIDataSource;
    }>>;
    updateDataSource({ projectId, dataSourceId, name, }: {
        projectId: string;
        dataSourceId: string;
        name: string;
    }): Promise<CoreAPIResponse<{
        data_source: CoreAPIDataSource;
    }>>;
    getDataSource({ projectId, dataSourceId, }: {
        projectId: string;
        dataSourceId: string;
    }): Promise<CoreAPIResponse<{
        data_source: CoreAPIDataSource;
    }>>;
    deleteDataSource({ projectId, dataSourceId, }: {
        projectId: string;
        dataSourceId: string;
    }): Promise<CoreAPIResponse<{
        data_source: CoreAPIDataSource;
    }>>;
    searchDataSource(projectId: string, dataSourceId: string, payload: {
        query: string;
        topK: number;
        filter?: CoreAPISearchFilter | null;
        view_filter?: CoreAPISearchFilter | null;
        fullText: boolean;
        credentials: {
            [key: string]: string;
        };
        target_document_tokens?: number | null;
    }): Promise<CoreAPIResponse<{
        documents: CoreAPIDocument[];
    }>>;
    getDataSourceDocuments({ dataSourceId, documentIds, projectId, viewFilter, }: {
        dataSourceId: string;
        documentIds?: string[];
        projectId: string;
        viewFilter?: CoreAPISearchFilter | null;
    }, pagination?: {
        limit: number;
        offset: number;
    }): Promise<CoreAPIResponse<{
        documents: CoreAPIDocument[];
        limit: number;
        offset: number;
        total: number;
    }>>;
    getDataSourceDocument({ dataSourceId, documentId, projectId, versionHash, viewFilter, }: {
        dataSourceId: string;
        documentId: string;
        projectId: string;
        versionHash?: string | null;
        viewFilter?: CoreAPISearchFilter | null;
    }): Promise<CoreAPIResponse<{
        document: CoreAPIDocument;
        data_source: CoreAPIDataSource;
    }>>;
    getDataSourceDocumentVersions({ projectId, dataSourceId, documentId, latest_hash, limit, offset, }: {
        projectId: string;
        dataSourceId: string;
        documentId: string;
        limit: number;
        offset: number;
        latest_hash?: string | null;
    }): Promise<CoreAPIResponse<{
        versions: CoreAPIDocumentVersion[];
        offset: number;
        limit: number;
        total: number;
    }>>;
    upsertDataSourceDocument({ projectId, dataSourceId, documentId, timestamp, tags, parentId, parents, sourceUrl, section, credentials, lightDocumentOutput, title, mimeType, }: CoreAPIUpsertDataSourceDocumentPayload): Promise<CoreAPIResponse<{
        document: CoreAPIDocument | CoreAPILightDocument;
        data_source: CoreAPIDataSource;
    }>>;
    getDataSourceDocumentBlob({ projectId, dataSourceId, documentId, }: {
        projectId: string;
        dataSourceId: string;
        documentId: string;
    }): Promise<CoreAPIResponse<CoreAPIDocumentBlob>>;
    updateDataSourceDocumentTags({ projectId, dataSourceId, documentId, addTags, removeTags, }: {
        projectId: string;
        dataSourceId: string;
        documentId: string;
        addTags?: string[];
        removeTags?: string[];
    }): Promise<CoreAPIResponse<{
        data_source: CoreAPIDataSource;
    }>>;
    updateDataSourceDocumentParents({ projectId, dataSourceId, documentId, parentId, parents, }: {
        projectId: string;
        dataSourceId: string;
        documentId: string;
        parentId: string | null;
        parents: string[];
    }): Promise<CoreAPIResponse<{
        data_source: CoreAPIDataSource;
    }>>;
    deleteDataSourceDocument({ projectId, dataSourceId, documentId, }: {
        projectId: string;
        dataSourceId: string;
        documentId: string;
    }): Promise<CoreAPIResponse<{
        data_source: CoreAPIDataSource;
    }>>;
    scrubDataSourceDocumentDeletedVersions({ projectId, dataSourceId, documentId, }: {
        projectId: string;
        dataSourceId: string;
        documentId: string;
    }): Promise<CoreAPIResponse<{
        versions: CoreAPIDocumentVersion[];
    }>>;
    tokenize({ text, modelId, providerId, }: {
        text: string;
        modelId: string;
        providerId: string;
    }): Promise<CoreAPIResponse<{
        tokens: CoreAPITokenType[];
    }>>;
    tokenizeBatch({ texts, modelId, providerId, }: {
        texts: string[];
        modelId: string;
        providerId: string;
    }): Promise<CoreAPIResponse<{
        tokens: CoreAPITokenType[][];
    }>>;
    dataSourceTokenize({ text, projectId, dataSourceId, }: {
        text: string;
        projectId: string;
        dataSourceId: string;
    }): Promise<CoreAPIResponse<{
        tokens: CoreAPITokenType[];
    }>>;
    tableValidateCSVContent({ projectId, dataSourceId, bucket, bucketCSVPath, }: {
        projectId: string;
        dataSourceId: string;
        bucket: string;
        bucketCSVPath: string;
    }): Promise<CoreAPIResponse<{
        schema: CoreAPITableSchema;
    }>>;
    upsertTable({ projectId, dataSourceId, tableId, name, description, timestamp, tags, parentId, parents, remoteDatabaseTableId, remoteDatabaseSecretId, title, mimeType, sourceUrl, }: {
        projectId: string;
        dataSourceId: string;
        tableId: string;
        name: string;
        description: string;
        timestamp: number | null;
        tags: string[];
        parentId: string | null;
        parents: string[];
        remoteDatabaseTableId?: string | null;
        remoteDatabaseSecretId?: string | null;
        title: string;
        mimeType: string;
        sourceUrl: string | null;
    }): Promise<CoreAPIResponse<{
        table: CoreAPITable;
    }>>;
    getTable({ projectId, dataSourceId, tableId, viewFilter, }: {
        projectId: string;
        dataSourceId: string;
        tableId: string;
        viewFilter?: CoreAPISearchFilter | null;
    }): Promise<CoreAPIResponse<{
        table: CoreAPITable;
    }>>;
    getTables({ dataSourceId, projectId, tableIds, viewFilter, }: {
        dataSourceId: string;
        projectId: string;
        tableIds?: string[];
        viewFilter?: CoreAPISearchFilter | null;
    }, pagination?: {
        limit: number;
        offset: number;
    }): Promise<CoreAPIResponse<{
        limit: number;
        offset: number;
        tables: CoreAPITable[];
        total: number;
    }>>;
    deleteTable({ projectId, dataSourceId, tableId, }: {
        projectId: string;
        dataSourceId: string;
        tableId: string;
    }): Promise<CoreAPIResponse<{
        success: true;
    }>>;
    updateTableParents({ projectId, dataSourceId, tableId, parentId, parents, }: {
        projectId: string;
        dataSourceId: string;
        tableId: string;
        parentId: string | null;
        parents: string[];
    }): Promise<CoreAPIResponse<{
        success: true;
    }>>;
    upsertTableRows({ projectId, dataSourceId, tableId, rows, truncate, }: {
        projectId: string;
        dataSourceId: string;
        tableId: string;
        rows: CoreAPIRow[];
        truncate?: boolean;
    }): Promise<CoreAPIResponse<{
        success: true;
    }>>;
    tableUpsertCSVContent({ projectId, dataSourceId, tableId, bucket, bucketCSVPath, truncate, }: {
        projectId: string;
        dataSourceId: string;
        tableId: string;
        bucket: string;
        bucketCSVPath: string;
        truncate?: boolean;
    }): Promise<CoreAPIResponse<{
        schema: CoreAPITableSchema;
    }>>;
    getTableRow({ projectId, dataSourceId, tableId, rowId, filter, }: {
        projectId: string;
        dataSourceId: string;
        tableId: string;
        rowId: string;
        filter?: CoreAPISearchFilter | null;
    }): Promise<CoreAPIResponse<{
        row: CoreAPIRow;
    }>>;
    getTableRows({ projectId, dataSourceId, tableId, limit, offset, filter, }: {
        projectId: string;
        dataSourceId: string;
        tableId: string;
        limit: number;
        offset: number;
        filter?: CoreAPISearchFilter | null;
    }): Promise<CoreAPIResponse<{
        rows: CoreAPIRow[];
        offset: number;
        limit: number;
        total: number;
    }>>;
    getDataSourceTableBlob({ projectId, dataSourceId, tableId, }: {
        projectId: string;
        dataSourceId: string;
        tableId: string;
    }): Promise<CoreAPIResponse<CoreAPITableBlob>>;
    deleteTableRow({ projectId, dataSourceId, tableId, rowId, }: {
        projectId: string;
        dataSourceId: string;
        tableId: string;
        rowId: string;
    }): Promise<CoreAPIResponse<{
        success: true;
    }>>;
    queryDatabase({ tables, query, filter, }: {
        tables: Array<{
            project_id: string;
            data_source_id: string;
            table_id: string;
        }>;
        query: string;
        filter?: CoreAPISearchFilter | null;
    }): Promise<CoreAPIResponse<{
        schema: CoreAPITableSchema;
        results: CoreAPIQueryResult[];
    }>>;
    getDataSourceFolders({ projectId, dataSourceId, folderIds, viewFilter, }: {
        projectId: string;
        dataSourceId: string;
        folderIds?: string[];
        viewFilter?: CoreAPISearchFilter | null;
    }, pagination?: {
        limit: number;
        offset: number;
    }): Promise<CoreAPIResponse<{
        folders: CoreAPIFolder[];
        limit: number;
        offset: number;
        total: number;
    }>>;
    searchNodes({ query, filter, options, }: {
        query?: string;
        filter: CoreAPINodesSearchFilter;
        options?: CoreAPISearchOptions;
    }): Promise<CoreAPIResponse<CoreAPISearchNodesResponse>>;
    getDataSourceStats({ projectId, dataSourceId, }: {
        projectId: string;
        dataSourceId: string;
    }): Promise<CoreAPIResponse<CoreAPIDataSourceStatsResponse>>;
    searchTags({ query, queryType, dataSourceViews, limit, }: {
        query?: string;
        queryType?: string;
        dataSourceViews: DataSourceViewType[];
        limit?: number;
    }): Promise<CoreAPIResponse<CoreAPISearchTagsResponse>>;
    getDataSourceFolder({ projectId, dataSourceId, folderId, }: {
        projectId: string;
        dataSourceId: string;
        folderId: string;
        viewFilter?: CoreAPISearchFilter | null;
    }): Promise<CoreAPIResponse<{
        folder: CoreAPIFolder;
    }>>;
    upsertDataSourceFolder({ projectId, dataSourceId, folderId, timestamp, parentId, parents, title, mimeType, sourceUrl, providerVisibility, }: {
        projectId: string;
        dataSourceId: string;
        folderId: string;
        timestamp: number | null;
        parentId: string | null;
        parents: string[];
        title: string;
        mimeType: string;
        sourceUrl?: string | null;
        providerVisibility: ProviderVisibility | null | undefined;
    }): Promise<CoreAPIResponse<{
        folder: CoreAPIFolder;
    }>>;
    deleteDataSourceFolder({ projectId, dataSourceId, folderId, }: {
        projectId: string;
        dataSourceId: string;
        folderId: string;
    }): Promise<CoreAPIResponse<{
        data_source: CoreAPIDataSource;
    }>>;
    private _fetchWithError;
    private _resultFromResponse;
}
export {};
//# sourceMappingURL=core_api.d.ts.map