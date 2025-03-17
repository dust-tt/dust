import * as t from "io-ts";
export declare const ConnectorCreateRequestBodySchema: t.TypeC<{
    workspaceAPIKey: t.StringC;
    dataSourceId: t.StringC;
    workspaceId: t.StringC;
    connectionId: t.StringC;
    configuration: t.UnionC<[t.TypeC<{
        url: t.StringC;
        depth: t.UnionC<[t.LiteralC<0>, t.LiteralC<1>, t.LiteralC<2>, t.LiteralC<3>, t.LiteralC<4>, t.LiteralC<5>]>;
        maxPageToCrawl: t.NumberC;
        crawlMode: t.UnionC<[t.LiteralC<"child">, t.LiteralC<"website">]>;
        crawlFrequency: t.UnionC<[t.LiteralC<"never">, t.LiteralC<"daily">, t.LiteralC<"weekly">, t.LiteralC<"monthly">]>;
        headers: t.RecordC<t.StringC, t.StringC>;
    }>, t.TypeC<{
        botEnabled: t.BooleanC;
        whitelistedDomains: t.UnionC<[t.ArrayC<t.StringC>, t.UndefinedC]>;
        autoReadChannelPatterns: t.ArrayC<t.TypeC<{
            pattern: t.StringC;
            spaceId: t.StringC;
        }>>;
    }>, t.NullC]>;
}>;
export type ConnectorCreateRequestBody = t.TypeOf<typeof ConnectorCreateRequestBodySchema>;
//# sourceMappingURL=create_connector.d.ts.map