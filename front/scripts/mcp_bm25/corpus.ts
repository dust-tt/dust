// Builds the BM25 document corpus from live MCP server metadata, so the test
// always reflects the descriptions actually shipped (no hand-maintained copy
// that can drift). Each tool becomes one document whose text is the tool name,
// its description, and every description / property key / enum value found in
// its input schema (this mirrors what a tool-search index would index).

import type { Document } from "@app/scripts/mcp_bm25/bm25";
import type { JSONSchema7, JSONSchema7Definition } from "json-schema";

export interface ServerEntry {
  name: string;
  tools: ReadonlyArray<{
    name: string;
    description: string;
    inputSchema: JSONSchema7;
  }>;
}

function collectSchemaText(def: JSONSchema7Definition | undefined): string[] {
  if (def === undefined || typeof def === "boolean") {
    return [];
  }

  const parts: string[] = [];

  if (typeof def.description === "string") {
    parts.push(def.description);
  }
  if (def.enum) {
    parts.push(
      def.enum.filter((e): e is string => typeof e === "string").join(" ")
    );
  }
  if (def.properties) {
    for (const [key, child] of Object.entries(def.properties)) {
      parts.push(key);
      parts.push(...collectSchemaText(child));
    }
  }
  if (def.items) {
    const items = Array.isArray(def.items) ? def.items : [def.items];
    for (const item of items) {
      parts.push(...collectSchemaText(item));
    }
  }
  for (const branch of [def.anyOf, def.oneOf, def.allOf]) {
    if (branch) {
      for (const sub of branch) {
        parts.push(...collectSchemaText(sub));
      }
    }
  }

  return parts;
}

export function buildDocs(servers: ServerEntry[]): Document[] {
  const docs: Document[] = [];
  for (const server of servers) {
    for (const tool of server.tools) {
      const parts = [
        tool.name,
        tool.description,
        ...collectSchemaText(tool.inputSchema),
      ];
      docs.push({
        name: `${server.name}.${tool.name}`,
        text: parts.join(" "),
      });
    }
  }
  return docs;
}
