export interface MCPResponse {
  id?: string;
  workspaceId?: string;
  name: string;
  description: string;
  tools: { name: string; description: string }[];
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
