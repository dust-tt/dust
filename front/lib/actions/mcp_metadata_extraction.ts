import type { MCPOAuthUseCase, OAuthProvider } from "@app/types/oauth/lib";

export type OAuthScopeDefinition = {
  value: string;
  label: string;
  description?: string;
  // If true, the scope cannot be unchecked by the admin. Defaults to false.
  required?: boolean;
  // When this scope is deselected, this fallback scope value is automatically
  // added to the effective scope string. Pair with an entry that has `impliedBy`
  // pointing back at this scope for a clean UI (e.g. Files.ReadWrite.All →
  // fallbackScope: "Files.Read.All", and Files.Read.All → impliedBy: "Files.ReadWrite.All").
  fallbackScope?: string;
  // When the scope named here is selected, this scope is shown as checked and
  // disabled with an "implied" badge — it is covered by the other scope and
  // does not need to be requested separately.
  impliedBy?: string;
};

export type AuthorizationInfo = {
  provider: OAuthProvider;
  supported_use_cases: MCPOAuthUseCase[];
  scope?: string;
  // Optional structured list of available scopes with labels and descriptions.
  // When present, the admin can restrict which scopes are requested.
  availableScopes?: OAuthScopeDefinition[];
  // API-layer only: injected in responses to signal whether a prerequisite
  // workspace-level connection exists for personal OAuth flows.
  workspace_connection?: {
    required: boolean;
    satisfied: boolean;
  };
};
