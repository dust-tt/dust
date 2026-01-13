import { z } from "zod";

import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import type { OAuthCredentials } from "@app/types";
import { isSupportedOAuthCredential, isOAuthProvider } from "@app/types";

// OAuth use cases
export const MCP_SERVER_OAUTH_USE_CASES = [
  "platform_actions",
  "personal_actions",
] as const;

export type MCPServerOAuthUseCase = (typeof MCP_SERVER_OAUTH_USE_CASES)[number];

// Auth methods
export const CREATE_MCP_SERVER_AUTH_METHODS = [
  "oauth-dynamic",
  "oauth-static",
  "bearer",
] as const;

export type CreateMCPServerAuthMethod =
  (typeof CREATE_MCP_SERVER_AUTH_METHODS)[number];

export const DEFAULT_CREATE_MCP_SERVER_AUTH_METHOD: CreateMCPServerAuthMethod =
  "oauth-dynamic";

// Runtime validator for OAuthCredentials.
// Validates that the value is an object with string values for supported credential keys.
function isOAuthCredentials(value: unknown): value is OAuthCredentials {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value !== "object") {
    return false;
  }
  for (const [key, val] of Object.entries(value)) {
    if (!isSupportedOAuthCredential(key)) {
      return false;
    }
    if (typeof val !== "string") {
      return false;
    }
  }
  return true;
}

// Zod schema for OAuthCredentials with runtime validation.
const oAuthCredentialsSchema = z
  .custom<OAuthCredentials>(isOAuthCredentials, {
    message: "Invalid OAuth credentials format",
  })
  .nullable()
  .default(null);

// Runtime validator for AuthorizationInfo.
function isAuthorizationInfo(value: unknown): value is AuthorizationInfo {
  if (value === null) {
    return true;
  }
  return (
    typeof value === "object" &&
    value !== null &&
    "provider" in value &&
    isOAuthProvider((value as Record<string, unknown>).provider) &&
    "supported_use_cases" in value &&
    Array.isArray((value as Record<string, unknown>).supported_use_cases)
  );
}

// Zod schema for AuthorizationInfo with runtime validation.
const authorizationInfoSchema = z
  .custom<AuthorizationInfo>(isAuthorizationInfo, {
    message: "Invalid authorization info format",
  })
  .nullable()
  .default(null);

// Base OAuth form schema (used by ConnectMCPServerDialog)
// Uses dynamic authCredentials from provider.
// Validation is handled imperatively via setError/clearErrors since
// credential requirements are fetched dynamically per provider/useCase.
export const mcpServerOAuthFormSchema = z.object({
  useCase: z.enum(MCP_SERVER_OAUTH_USE_CASES).nullable().default(null),
  authCredentials: oAuthCredentialsSchema,
});

export type MCPServerOAuthFormValues = z.infer<typeof mcpServerOAuthFormSchema>;

// Extended form schema for CreateMCPServerDialog
// Inherits OAuth fields and adds remote server configuration fields.
// Also includes workflow state (authorization, remoteMCPServerOAuthDiscoveryDone)
// to centralize all form-related state.
export const createMCPServerDialogFormSchema = mcpServerOAuthFormSchema.extend({
  remoteServerUrl: z.string().default(""),
  authMethod: z
    .enum(CREATE_MCP_SERVER_AUTH_METHODS)
    .default(DEFAULT_CREATE_MCP_SERVER_AUTH_METHOD),
  sharedSecret: z.string().optional(),
  useCustomHeaders: z.boolean().default(false),
  customHeaders: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .default([]),
  // Workflow state - populated by OAuth metadata discovery, not user input.
  authorization: authorizationInfoSchema,
  remoteMCPServerOAuthDiscoveryDone: z.boolean().default(false),
});

export type CreateMCPServerDialogFormValues = z.infer<
  typeof createMCPServerDialogFormSchema
>;
