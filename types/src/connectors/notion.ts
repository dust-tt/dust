import type {
  BlockObjectResponse,
  PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import * as t from "io-ts";

import { ModelId } from "../shared/model_id";

// notion SDK types
export type PageObjectProperties = PageObjectResponse["properties"];
export type PropertyKeys = keyof PageObjectProperties;
export type PropertyTypes = PageObjectProperties[PropertyKeys]["type"];

export function getNotionWorkflowId(
  connectorId: ModelId,
  isGarbageCollectionRun: boolean
) {
  let wfName = `workflow-notion-${connectorId}`;
  if (isGarbageCollectionRun) {
    wfName += "-garbage-collector";
  }
  return wfName;
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
  archived: t.boolean,
});

export type ParsedNotionDatabase = t.TypeOf<typeof ParsedNotionDatabaseSchema>;

// Returns the Table ID for a Notion database from the Notion-provided database ID.
export function getNotionDatabaseTableId(notionDatabaseId: string): string {
  return `notion-${notionDatabaseId}`;
}

// Returns the Table ID for a Notion database from the Content Node ID.
export function getNotionDatabaseTableIdFromContentNodeInternalId(
  internalId: string
): string {
  // The internalId is also the notion-provided database ID
  // so we can just use the same function.
  return getNotionDatabaseTableId(internalId);
}

// Recover the Content Node ID for a Notion database (which is also the notion-provided database ID)
// from the Table ID.
export function getNotionDatabaseContentNodeInternalIdFromTableId(
  tableId: string
): string {
  if (!tableId.startsWith("notion-")) {
    throw new Error(
      `Invalid tableId format. Expected a tableId in the format notion-<databaseId>`
    );
  }
  return tableId.replace("notion-", "");
}
