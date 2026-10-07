import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";

// Callers may pass a full server JSON, which carries redacted credentials.
// Only sId and name are read, so a spread of that object cannot reach WorkOS.
type MCPServerAuditTarget = { sId: string; name: string };

export type MCPServerCredentialsChange = {
  sharedSecret: boolean;
  customHeaders: boolean;
};

export type MCPServerOAuthSettings = {
  useCase: MCPOAuthUseCase | null;
  scope: string | null;
};

export function getMCPServerOAuthSettings(
  view: Pick<MCPServerViewResource, "oAuthUseCase" | "oauthScope">
): MCPServerOAuthSettings {
  return { useCase: view.oAuthUseCase, scope: view.oauthScope };
}

export function emitMCPServerCredentialsUpdatedAuditLog(
  auth: Authenticator,
  server: MCPServerAuditTarget,
  change: MCPServerCredentialsChange
): void {
  if (!change.sharedSecret && !change.customHeaders) {
    return;
  }

  const { sId, name } = server;
  void emitAuditLogEvent({
    auth,
    action: "mcp_server.credentials_updated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("mcp_server", { sId, name }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      server_type: getServerTypeAndIdFromSId(sId).serverType,
      shared_secret_updated: String(change.sharedSecret),
      custom_headers_updated: String(change.customHeaders),
    },
  });
}

export function emitMCPServerOAuthSettingsUpdatedAuditLog(
  auth: Authenticator,
  server: MCPServerAuditTarget,
  {
    before,
    after,
  }: { before: MCPServerOAuthSettings; after: MCPServerOAuthSettings }
): void {
  if (before.useCase === after.useCase && before.scope === after.scope) {
    return;
  }

  const { sId, name } = server;
  void emitAuditLogEvent({
    auth,
    action: "mcp_server.oauth_settings_updated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("mcp_server", { sId, name }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      server_type: getServerTypeAndIdFromSId(sId).serverType,
      previous_oauth_use_case: before.useCase ?? "none",
      new_oauth_use_case: after.useCase ?? "none",
      oauth_scope_changed: String(before.scope !== after.scope),
    },
  });
}
