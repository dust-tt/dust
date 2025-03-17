import * as t from "io-ts";
import { CoreAPIDataSourceDocumentSection } from "../../../core/data_source";
export declare const UpsertContextSchema: t.TypeC<{
    sync_type: t.UnionC<[t.LiteralC<"batch">, t.LiteralC<"incremental">, t.UndefinedC]>;
}>;
export type UpsertContext = t.TypeOf<typeof UpsertContextSchema>;
export declare const FrontDataSourceDocumentSection: t.RecursiveType<t.Type<CoreAPIDataSourceDocumentSection>, CoreAPIDataSourceDocumentSection>;
export type FrontDataSourceDocumentSectionType = t.TypeOf<typeof FrontDataSourceDocumentSection>;
export declare const PostDataSourceDocumentRequestBodySchema: t.TypeC<{
    timestamp: t.UnionC<[t.BrandC<t.NumberC, t.IntBrand>, t.UndefinedC, t.NullC]>;
    tags: t.UnionC<[t.ArrayC<t.StringC>, t.UndefinedC, t.NullC]>;
    parent_id: t.UnionC<[t.StringC, t.UndefinedC, t.NullC]>;
    parents: t.UnionC<[t.ArrayC<t.StringC>, t.UndefinedC, t.NullC]>;
    source_url: t.UnionC<[t.StringC, t.UndefinedC, t.NullC]>;
    upsert_context: t.UnionC<[t.TypeC<{
        sync_type: t.UnionC<[t.LiteralC<"batch">, t.LiteralC<"incremental">, t.UndefinedC]>;
    }>, t.UndefinedC, t.NullC]>;
    text: t.UnionC<[t.StringC, t.UndefinedC, t.NullC]>;
    section: t.UnionC<[t.RecursiveType<t.Type<CoreAPIDataSourceDocumentSection, CoreAPIDataSourceDocumentSection, unknown>, CoreAPIDataSourceDocumentSection, CoreAPIDataSourceDocumentSection, unknown>, t.UndefinedC, t.NullC]>;
    light_document_output: t.UnionC<[t.BooleanC, t.UndefinedC]>;
    async: t.UnionC<[t.BooleanC, t.UndefinedC, t.NullC]>;
    title: t.StringC;
    mime_type: t.StringC;
}>;
export type PostDataSourceDocumentRequestBody = t.TypeOf<typeof PostDataSourceDocumentRequestBodySchema>;
export declare const PostDataSourceWithNameDocumentRequestBodySchema: t.IntersectionC<[t.TypeC<{
    name: t.StringC;
}>, t.TypeC<{
    timestamp: t.UnionC<[t.BrandC<t.NumberC, t.IntBrand>, t.UndefinedC, t.NullC]>;
    tags: t.UnionC<[t.ArrayC<t.StringC>, t.UndefinedC, t.NullC]>;
    parent_id: t.UnionC<[t.StringC, t.UndefinedC, t.NullC]>;
    parents: t.UnionC<[t.ArrayC<t.StringC>, t.UndefinedC, t.NullC]>;
    source_url: t.UnionC<[t.StringC, t.UndefinedC, t.NullC]>;
    upsert_context: t.UnionC<[t.TypeC<{
        sync_type: t.UnionC<[t.LiteralC<"batch">, t.LiteralC<"incremental">, t.UndefinedC]>;
    }>, t.UndefinedC, t.NullC]>;
    text: t.UnionC<[t.StringC, t.UndefinedC, t.NullC]>;
    section: t.UnionC<[t.RecursiveType<t.Type<CoreAPIDataSourceDocumentSection, CoreAPIDataSourceDocumentSection, unknown>, CoreAPIDataSourceDocumentSection, CoreAPIDataSourceDocumentSection, unknown>, t.UndefinedC, t.NullC]>;
    light_document_output: t.UnionC<[t.BooleanC, t.UndefinedC]>;
    async: t.UnionC<[t.BooleanC, t.UndefinedC, t.NullC]>;
    title: t.StringC;
    mime_type: t.StringC;
}>]>;
export type PostDataSourceWithNameDocumentRequestBody = t.TypeOf<typeof PostDataSourceWithNameDocumentRequestBodySchema>;
export type PatchDataSourceWithNameDocumentRequestBody = t.TypeOf<typeof PostDataSourceWithNameDocumentRequestBodySchema>;
export declare const PatchDataSourceTableRequestBodySchema: t.TypeC<{
    name: t.StringC;
    description: t.StringC;
    timestamp: t.UnionC<[t.NumberC, t.UndefinedC, t.NullC]>;
    tags: t.UnionC<[t.ArrayC<t.StringC>, t.UndefinedC, t.NullC]>;
    parentId: t.UnionC<[t.StringC, t.UndefinedC, t.NullC]>;
    parents: t.UnionC<[t.ArrayC<t.StringC>, t.UndefinedC, t.NullC]>;
    truncate: t.BooleanC;
    async: t.UnionC<[t.BooleanC, t.UndefinedC]>;
    fileId: t.UnionC<[t.StringC, t.UndefinedC]>;
    title: t.StringC;
    mimeType: t.StringC;
    sourceUrl: t.UnionC<[t.StringC, t.UndefinedC, t.NullC]>;
}>;
export type PatchDataSourceTableRequestBody = t.TypeOf<typeof PatchDataSourceTableRequestBodySchema>;
//# sourceMappingURL=data_sources.d.ts.map