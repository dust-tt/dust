import type { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

import { ModelId } from "../../../shared/model_id";
import { BaseAction } from ".";

export type MCPToolResultContent = z.infer<
  typeof CallToolResultSchema
>["content"][number];

export type MCPConfigurationType = {
  id: ModelId;
  sId: string;
  serverType: "client" | "internal" | "hosted" | "remote";
  type: "mcp_configuration";
  name: string;
  description: string | null;
  inputs: {
    name: string;
    description: string;
    type: "string" | "number" | "boolean" | "array";
    items?: {
      type: "string" | "number" | "boolean";
    };
  }[];
};

export interface MCPActionType extends BaseAction {
  agentMessageId: ModelId;
  params: Record<string, unknown>;
  output: MCPToolResultContent[] | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "mcp_action";
  mcpServerConfigurationId: string;
  executionState:
    | "pending"
    | "allowed_explicitely"
    | "allowed_implicitely"
    | "denied";
  isError: boolean;
}

export type MCPParamsEvent = {
  type: "mcp_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
};

export type MCPSuccessEvent = {
  type: "mcp_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
};

export type MCPErrorEvent = {
  type: "mcp_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};
