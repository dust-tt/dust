import type { MCPOAuthUseCase, OAuthProvider } from "@app/types/oauth/lib";

export type AuthorizationInfo = {
  provider: OAuthProvider;
  supported_use_cases: MCPOAuthUseCase[];
  scope?: string;
  // API-layer only: injected in responses to signal whether a prerequisite
  // workspace-level connection exists for personal OAuth flows.
  workspace_connection?: {
    required: boolean;
    satisfied: boolean;
  };
};
