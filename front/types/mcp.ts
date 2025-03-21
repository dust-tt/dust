export type MCPFormState = {
  url: string;
  name: string;
  description: string;
  tools: string[];
  errors?: {
    url?: string;
    name?: string;
    description?: string;
  };
};

export type MCPFormAction =
  | {
      [K in keyof Omit<MCPFormState, "errors">]: {
        type: "SET_FIELD";
        field: K;
        value: MCPFormState[K];
      };
    }[keyof Omit<MCPFormState, "errors">]
  | {
      type: "SET_ERROR";
      field: keyof MCPFormState["errors"];
      value: string | undefined;
    }
  | {
      type: "RESET";
      config?: null;
      name?: string;
    }
  | { type: "VALIDATE" };

export type MCPTool = string;

export interface MCPResponse {
  id?: string;
  workspaceId?: string;
  name: string;
  description: string;
  tools: string[];
  url?: string;
  version?: string;
  sharedSecret?: string;
}

export interface MCPError {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

export interface MCPApiResponse {
  success: boolean;
  data?: MCPResponse;
  error?: MCPError;
}
