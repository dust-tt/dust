import { z } from "zod";

import type { OAuthCredentials } from "@app/types";
import { isSupportedOAuthCredential } from "@app/types";

// OAuth use cases
export const MCP_SERVER_OAUTH_USE_CASES = [
  "platform_actions",
  "personal_actions",
] as const;

export type MCPServerOAuthUseCase = (typeof MCP_SERVER_OAUTH_USE_CASES)[number];

// Connection auth methods for MCP servers that support both OAuth and key pair.
export const MCP_SERVER_CONNECTION_AUTH_METHODS = ["oauth", "keypair"] as const;

export type MCPServerConnectionAuthMethod =
  (typeof MCP_SERVER_CONNECTION_AUTH_METHODS)[number];

// Auth methods for creating remote MCP servers
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

// Zod schema for SnowflakeCredentials (key pair auth).
const snowflakeKeyPairCredentialsSchema = z
  .object({
    auth_type: z.literal("keypair"),
    account: z.string(),
    username: z.string(),
    role: z.string(),
    warehouse: z.string(),
    private_key: z.string(),
    private_key_passphrase: z.string().optional(),
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
  // For providers that support both OAuth and key pair (e.g., Snowflake).
  connectionAuthMethod: z
    .enum(MCP_SERVER_CONNECTION_AUTH_METHODS)
    .default("oauth"),
  // Key pair credentials (only used when connectionAuthMethod is "keypair").
  keyPairCredentials: snowflakeKeyPairCredentialsSchema,
});

export type MCPServerOAuthFormValues = z.infer<typeof mcpServerOAuthFormSchema>;

// Extended form schema for CreateMCPServerDialog.
// Inherits OAuth fields and adds remote server configuration fields.
// Note: Workflow state (authorization, remoteMCPServerOAuthDiscoveryDone) is managed
// via useState in the dialog component, not in form state, to maintain separation
// between user input (form) and server-derived state (useState).
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
});

export type CreateMCPServerDialogFormValues = z.infer<
  typeof createMCPServerDialogFormSchema
>;
