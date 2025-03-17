import type { BlockObjectResponse, PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import * as t from "io-ts";
import { ModelId } from "../shared/model_id";
export type PageObjectProperties = PageObjectResponse["properties"];
export type PropertyKeys = keyof PageObjectProperties;
export type PropertyTypes = PageObjectProperties[PropertyKeys]["type"];
export declare function getNotionWorkflowId(connectorId: ModelId, isGarbageCollectionRun: boolean): string;
export type ParsedNotionPage = {
    id: string;
    url: string;
    title?: string;
    properties: ParsedNotionPageProperty[];
    blocks: ParsedNotionBlock[];
    rendered: string;
    createdTime: number;
    updatedTime: number;
    author: string;
    lastEditor: string;
    hasBody: boolean;
    parentType: "database" | "page" | "block" | "workspace";
    parentId: string;
};
export type ParsedNotionPageProperty = {
    key: string;
    id: string;
    type: PropertyTypes;
    text: string | null;
};
export type NotionBlockType = BlockObjectResponse["type"];
export type ParsedNotionBlock = {
    id: string;
    type: NotionBlockType;
    text: string | null;
    hasChildren: boolean;
    childDatabaseTitle: string | null;
};
export declare const ParsedNotionDatabaseSchema: t.TypeC<{
    id: t.StringC;
    url: t.StringC;
    title: t.UnionC<[t.StringC, t.UndefinedC]>;
    parentType: t.UnionC<[t.LiteralC<"database">, t.LiteralC<"page">, t.LiteralC<"block">, t.LiteralC<"workspace">]>;
    parentId: t.StringC;
    archived: t.BooleanC;
}>;
export type ParsedNotionDatabase = t.TypeOf<typeof ParsedNotionDatabaseSchema>;
export declare function getNotionDatabaseTableId(notionDatabaseId: string): string;
export declare function getNotionDatabaseTableIdFromContentNodeInternalId(internalId: string): string;
//# sourceMappingURL=notion.d.ts.map