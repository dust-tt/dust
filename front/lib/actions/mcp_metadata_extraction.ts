import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

import { isInternalAllowedIcon } from "@app/components/resources/resources_icons";
import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_NAME,
  DEFAULT_MCP_ACTION_VERSION,
} from "@app/lib/actions/constants";
import { DEFAULT_MCP_SERVER_ICON } from "@app/lib/actions/mcp_icons";
import type {
  InternalMCPServerDefinitionType,
  MCPServerDefinitionType,
} from "@app/lib/api/mcp";
import type { MCPOAuthUseCase, OAuthProvider } from "@app/types";
import { isOAuthProvider } from "@app/types";

export type AuthorizationInfo = {
  provider: OAuthProvider;
  supported_use_cases: MCPOAuthUseCase[];
  scope?: string;
};

function isAuthorizationInfo(a: unknown): a is AuthorizationInfo {
  return (
    typeof a === "object" &&
    a !== null &&
    "provider" in a &&
    isOAuthProvider(a.provider) &&
    "supported_use_cases" in a
  );
}

function isInternalMCPServerDefinition(
  server: Implementation
): server is InternalMCPServerDefinitionType {
  return (
    "authorization" in server &&
    (isAuthorizationInfo(server.authorization) ||
      server.authorization === null) &&
    "description" in server &&
    typeof server.description === "string" &&
    "icon" in server &&
    typeof server.icon === "string" &&
    isInternalAllowedIcon(server.icon)
  );
}

export function extractMetadataFromServerVersion(
  r: Implementation | undefined
): MCPServerDefinitionType {
  if (r) {
    return {
      name: r.name ?? DEFAULT_MCP_ACTION_NAME,
      version: r.version ?? DEFAULT_MCP_ACTION_VERSION,
      authorization: isInternalMCPServerDefinition(r) ? r.authorization : null,
      description: isInternalMCPServerDefinition(r)
        ? r.description
        : DEFAULT_MCP_ACTION_DESCRIPTION,
      icon: isInternalMCPServerDefinition(r) ? r.icon : DEFAULT_MCP_SERVER_ICON,
      documentationUrl: isInternalMCPServerDefinition(r)
        ? r.documentationUrl
        : null,
      developerSecretSelection: isInternalMCPServerDefinition(r)
        ? r.developerSecretSelection
        : undefined,
      developerSecretSelectionDescription: isInternalMCPServerDefinition(r)
        ? r.developerSecretSelectionDescription
        : undefined,
    };
  }

  return {
    name: DEFAULT_MCP_ACTION_NAME,
    version: DEFAULT_MCP_ACTION_VERSION,
    description: DEFAULT_MCP_ACTION_DESCRIPTION,
    icon: DEFAULT_MCP_SERVER_ICON,
    authorization: null,
    documentationUrl: null,
  };
}
