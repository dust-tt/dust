import * as t from "io-ts";
export declare const ContentNodesViewTypeCodec: t.UnionC<[t.LiteralC<"table">, t.LiteralC<"document">, t.LiteralC<"all">]>;
export type ContentNodesViewType = t.TypeOf<typeof ContentNodesViewTypeCodec>;
export declare function isValidContentNodesViewType(value: unknown): value is ContentNodesViewType;
//# sourceMappingURL=content_nodes.d.ts.map