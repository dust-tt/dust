import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const FILES_SERVER_NAME = "files" as const;
export const FILES_LIST_ACTION_NAME = "list" as const;

export const FILES_TOOLS_METADATA = createToolsRecord({
  [FILES_LIST_ACTION_NAME]: {
    description:
      "List all files in the conversation file system. " +
      "Returns one entry per file with its scoped path (e.g. `conversation/chart.png`), " +
      "content type, and size in KB. " +
      "Scoped paths can be used to reference or display a file in a response, " +
      "or passed to other tools that accept a file path.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing available files",
      done: "Listed available files",
    },
  },
});

export const FILES_SERVER = {
  serverInfo: {
    name: FILES_SERVER_NAME,
    version: "1.0.0",
    description:
      "File system interface scoped to the current conversation. " +
      "Gives the agent visibility into all files present in the conversation: " +
      "files uploaded by the user, files generated during execution (e.g. charts, " +
      "exports, processed data produced by code run in the sandbox), and files produced " +
      "as results of tool use. " +
      "Files are identified by scoped paths such as `conversation/chart.png` that can " +
      "be used to reference, display, or link files in agent responses.",
    authorization: null,
    icon: "ActionDocumentTextIcon" as const,
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(FILES_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(FILES_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
