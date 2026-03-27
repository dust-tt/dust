import type { OAuthProvider } from "@app/types/oauth/lib";
import { isOAuthProvider, isValidScope } from "@app/types/oauth/lib";

export type MCPServerPersonalAuthenticationRequiredMetadata = {
  mcp_server_id: string;
  provider: OAuthProvider;
  scope?: string;
  conversationId: string;
  messageId: string;
};

function isMCPServerPersonalAuthenticationRequiredMetadata(
  metadata: unknown
): metadata is MCPServerPersonalAuthenticationRequiredMetadata {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "mcp_server_id" in metadata &&
    typeof metadata.mcp_server_id === "string" &&
    "provider" in metadata &&
    isOAuthProvider(metadata?.provider) &&
    (!("scope" in metadata) || isValidScope(metadata.scope)) &&
    "conversationId" in metadata &&
    typeof metadata.conversationId === "string" &&
    "messageId" in metadata &&
    typeof metadata.messageId === "string"
  );
}

export type PersonalAuthenticationRequiredErrorContent = {
  code: "mcp_server_personal_authentication_required";
  message: string;
  metadata: MCPServerPersonalAuthenticationRequiredMetadata;
};

export function isPersonalAuthenticationRequiredErrorContent(
  error: unknown
): error is PersonalAuthenticationRequiredErrorContent {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "mcp_server_personal_authentication_required" &&
    "metadata" in error &&
    isMCPServerPersonalAuthenticationRequiredMetadata(error.metadata)
  );
}
