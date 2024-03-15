import type {
  BlockObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import * as t from "io-ts";

// notion SDK types
export type PageObjectProperties = PageObjectResponse["properties"];
export type PropertyKeys = keyof PageObjectProperties;
export type PropertyTypes = PageObjectProperties[PropertyKeys]["type"];
export type NotionGarbageCollectionMode = "always" | "auto" | "never";

export function getNotionWorkflowId(
  dataSourceInfo: { workspaceId: string; dataSourceName: string },
  gargbageCollectionMode: NotionGarbageCollectionMode = "auto"
) {
  let wfName = "workflow-notion";
  if (gargbageCollectionMode === "always") {
    wfName += "-garbage-collector";
  }
  return `${wfName}-${dataSourceInfo.workspaceId}-${dataSourceInfo.dataSourceName}`;
}

// Extractor types
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

export const ParsedNotionDatabaseSchema = t.type({
  id: t.string,
  url: t.string,
  title: t.union([t.string, t.undefined]),
  parentType: t.union([
    t.literal("database"),
    t.literal("page"),
    t.literal("block"),
    t.literal("workspace"),
  ]),
  parentId: t.string,
});

export type ParsedNotionDatabase = t.TypeOf<typeof ParsedNotionDatabaseSchema>;
