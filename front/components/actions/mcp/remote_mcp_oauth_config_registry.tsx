import { BoxOAuthConfig } from "@app/components/actions/mcp/create/BoxOAuthConfig";
import type { DefaultRemoteMCPServerConfig } from "@app/lib/actions/mcp_internal_actions/remote_servers";
import type { ComponentType } from "react";

/**
 * Props for a custom OAuth config component used when adding a remote MCP server
 * with authMethod "oauth-static" and an oauthStaticPresetKey (e.g. Box).
 * The component renders provider-specific fields and syncs values to the form's
 * authCredentials via useFormContext. Hardcoded values (e.g. token URL, auth URL)
 * can be merged in when updating authCredentials so the backend receives a full
 * credential payload.
 */
export interface RemoteMCPServerOAuthConfigComponentProps {
  defaultServerConfig: DefaultRemoteMCPServerConfig;
  onValidityChange: (isValid: boolean) => void;
}

export type RemoteMCPServerOAuthConfigComponent =
  ComponentType<RemoteMCPServerOAuthConfigComponentProps>;

const REGISTRY: Record<string, RemoteMCPServerOAuthConfigComponent> = {};

/**
 * Register a custom OAuth config component for a remote MCP preset.
 * Key must match oauthStaticPresetKey in DefaultRemoteMCPServerConfig (e.g. "box").
 */
export function registerRemoteMCPServerOAuthConfig(
  presetKey: string,
  component: RemoteMCPServerOAuthConfigComponent
): void {
  REGISTRY[presetKey] = component;
}

/**
 * Get the custom OAuth config component for a preset, or null to use
 * the generic mcp_static credential fields from getProviderRequiredOAuthCredentialInputs.
 */
export function getRemoteMCPServerOAuthConfigComponent(
  presetKey: string
): RemoteMCPServerOAuthConfigComponent | null {
  return REGISTRY[presetKey] ?? null;
}

registerRemoteMCPServerOAuthConfig("box", BoxOAuthConfig);
