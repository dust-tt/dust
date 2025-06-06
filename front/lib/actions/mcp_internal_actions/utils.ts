import type { InternalToolInputMimeType } from "@dust-tt/client";
import { assertNever, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { ZodError } from "zod";

import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ConfigurableToolInputType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  ConfigurableToolInputJSONSchemas,
  JsonSchemaSchema,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolResult } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import {
  areSchemasEqual,
  findSchemaAtPath,
  followInternalRef,
  isJSONSchemaObject,
  setValueAtPath,
} from "@app/lib/utils/json_schemas";
import type { WorkspaceType } from "@app/types";

/**
 * Error tool result. This won't fail in the agent loop but will be logged.
 * The text will be shown to the model.
 *
 * Do not use if the intent is to show an issue to the agent as part of a normal tool execution,
 * only use if the error should be logged and tracked.
 */
export function makeMCPToolTextError(text: string): MCPToolResult {
  return {
    isError: true,
    content: [{ type: "text", text }],
  };
}

/**
 * Success tool result.
 *
 * Use this if the intent is to show an issue to the agent that does not need logging
 * and is part of a normal tool execution.
 */
export function makeMCPToolRecoverableErrorSuccess(
  errorText: string
): MCPToolResult {
  return {
    isError: false,
    content: [{ type: "text", text: errorText }],
  };
}

export const makeMCPToolTextSuccess = ({
  message,
  result,
}: {
  message: string;
  result?: string;
}): CallToolResult => {
  if (!result) {
    return {
      isError: false,
      content: [{ type: "text", text: message }],
    };
  }
  return {
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: result },
    ],
  };
};

export const makeMCPToolJSONSuccess = ({
  message,
  result,
}: {
  message: string;
  result: object | string;
}): CallToolResult => {
  return {
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: JSON.stringify(result, null, 2) },
    ],
  };
};
