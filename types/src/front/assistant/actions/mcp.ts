import { ModelId } from "../../../shared/model_id";
import { BaseAction } from ".";

// The host type of the MCP server exposing this tool.
//
// - client: the MCP tool is running inside a Dust client (webapp, extension, mobile app, custom integration) and uses the relay
// - system: the MCP tool is running inside the Dust system
// - isolated: the MCP tool is running inside a isolated environment (e.g. in a container)
// - remote: the MCP tool is running outside the Dust system (e.g. on another machine)
export type MCPHostType = "client" | "system" | "isolated" | "remote";

export type MCPHostConfig = {
  hostType: MCPHostType;
  hostUrl: string | null;
};

export type MCPConfigurationType = {
  id: ModelId;
  sId: string;

  type: "mcp_configuration";
  hostConfig: MCPHostConfig;
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
  tokensCount: number | null;
  output: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "mcp_action";
  hostConfig: MCPHostConfig;
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
