import * as t from "io-ts";
export declare const PostSpaceRequestBodySchema: t.IntersectionC<[t.TypeC<{
    name: t.StringC;
}>, t.UnionC<[t.TypeC<{
    memberIds: t.ArrayC<t.StringC>;
    isRestricted: t.LiteralC<true>;
}>, t.TypeC<{
    memberIds: t.NullC;
    isRestricted: t.LiteralC<false>;
}>]>]>;
export declare const PatchSpaceMembersRequestBodySchema: t.UnionC<[t.TypeC<{
    memberIds: t.ArrayC<t.StringC>;
    isRestricted: t.LiteralC<true>;
}>, t.TypeC<{
    memberIds: t.NullC;
    isRestricted: t.LiteralC<false>;
}>]>;
export declare const ContentSchema: t.TypeC<{
    dataSourceId: t.StringC;
    parentsIn: t.ArrayC<t.StringC>;
}>;
export declare const PatchSpaceRequestBodySchema: t.TypeC<{
    name: t.UnionC<[t.StringC, t.UndefinedC]>;
    content: t.UnionC<[t.ArrayC<t.TypeC<{
        dataSourceId: t.StringC;
        parentsIn: t.ArrayC<t.StringC>;
    }>>, t.UndefinedC]>;
}>;
export declare const PostDataSourceViewSchema: t.TypeC<{
    dataSourceId: t.StringC;
    parentsIn: t.ArrayC<t.StringC>;
}>;
export declare const PostNotionSyncPayloadSchema: t.TypeC<{
    urls: t.ArrayC<t.StringC>;
    method: t.UnionC<[t.LiteralC<"sync">, t.LiteralC<"delete">]>;
}>;
export declare const GetPostNotionSyncResponseBodySchema: t.TypeC<{
    syncResults: t.ArrayC<t.IntersectionC<[t.TypeC<{
        url: t.StringC;
        method: t.UnionC<[t.LiteralC<"sync">, t.LiteralC<"delete">]>;
        timestamp: t.NumberC;
        success: t.BooleanC;
    }>, t.PartialC<{
        error_message: t.StringC;
    }>]>>;
}>;
export type GetPostNotionSyncResponseBody = t.TypeOf<typeof GetPostNotionSyncResponseBodySchema>;
//# sourceMappingURL=spaces.d.ts.map