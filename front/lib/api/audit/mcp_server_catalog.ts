import type { Authenticator } from "@app/lib/auth";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import { assertNever } from "@app/types/shared/utils/assert_never";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "./workos_audit";

/**
 * Stored display name for a catalog server.
 *
 * `displayName` is the system view name when that override is non-blank,
 * otherwise the server's own name. UI suffixes from `getMcpServerDisplayName`
 * are not part of this value.
 *
 * `sId` is the MCP server id used in `/api/w/:wId/mcp/:serverId`.
 * `internalName` is the code-registry key and exists only for internal servers.
 */
export type McpServerCatalogIdentity =
  | {
      readonly serverType: "remote";
      readonly sId: string;
      readonly displayName: string;
    }
  | {
      readonly serverType: "internal";
      readonly sId: string;
      readonly displayName: string;
      readonly internalName: string;
    };

export type McpServerSecretChange = "set" | "cleared";

/**
 * Secret values, header maps, meta maps, remote URLs, and OAuth scope strings
 * are not members of a catalog edit.
 */
export type McpServerCatalogChange =
  | {
      readonly kind: "display";
      readonly fields: readonly ["icon"];
    }
  | {
      readonly kind: "display";
      readonly fields: readonly ["name", "description"];
      readonly previousName: string;
    }
  | McpServerCredentialsChange
  | {
      readonly kind: "oauth";
      readonly oauthUseCase: MCPOAuthUseCase;
      readonly scopeChanged: boolean;
    }
  | {
      readonly kind: "restriction";
      readonly isRestrictedToSkills: boolean;
    }
  | {
      readonly kind: "meta";
      readonly cleared: boolean;
    };

type McpServerCredentialsChange = {
  readonly kind: "credentials";
  readonly sharedSecretChange?: McpServerSecretChange;
  readonly customHeadersChange?: McpServerSecretChange;
} & (
  | { readonly sharedSecretChange: McpServerSecretChange }
  | { readonly customHeadersChange: McpServerSecretChange }
);

type McpServerCatalogNameInput =
  | {
      readonly serverType: "remote";
      readonly sId: string;
      readonly serverName: string;
      readonly viewName: string | null;
    }
  | {
      readonly serverType: "internal";
      readonly sId: string;
      readonly serverName: string;
      readonly viewName: string | null;
      readonly internalName: string;
    };

/**
 * A blank view name means there is no override.
 * Create, update, and delete share this rule.
 */
export function mcpServerCatalogIdentity(
  input: McpServerCatalogNameInput
): McpServerCatalogIdentity {
  const trimmed = input.viewName?.trim() ?? "";
  const displayName = trimmed.length > 0 ? trimmed : input.serverName;
  if (input.serverType === "internal") {
    return {
      serverType: "internal",
      sId: input.sId,
      displayName,
      internalName: input.internalName,
    };
  }
  return {
    serverType: "remote",
    sId: input.sId,
    displayName,
  };
}

/**
 * Returns null when neither credential field was in the request, so the caller
 * skips the emit. Absent fields were not written. "cleared" is an empty secret,
 * a null header list, or an empty header list.
 */
export function credentialsChange(input: {
  readonly sharedSecret?: McpServerSecretChange;
  readonly customHeaders?: McpServerSecretChange;
}): McpServerCredentialsChange | null {
  if (input.sharedSecret !== undefined && input.customHeaders !== undefined) {
    return {
      kind: "credentials",
      sharedSecretChange: input.sharedSecret,
      customHeadersChange: input.customHeaders,
    };
  }
  if (input.sharedSecret !== undefined) {
    return {
      kind: "credentials",
      sharedSecretChange: input.sharedSecret,
    };
  }
  if (input.customHeaders !== undefined) {
    return {
      kind: "credentials",
      customHeadersChange: input.customHeaders,
    };
  }
  return null;
}

function projectCreatedMetadata(
  identity: McpServerCatalogIdentity
): Record<string, string> {
  const metadata: Record<string, string> = {
    server_type: identity.serverType,
    server_name: identity.displayName,
  };
  if (identity.serverType === "internal") {
    metadata.internal_name = identity.internalName;
  }
  return metadata;
}

function projectUpdatedMetadata(
  identity: McpServerCatalogIdentity,
  change: McpServerCatalogChange
): Record<string, string> {
  const metadata: Record<string, string> = {
    ...projectCreatedMetadata(identity),
    change_kind: change.kind,
  };

  switch (change.kind) {
    case "display":
      if ("previousName" in change) {
        metadata.changed_fields = "description,name";
        metadata.previous_name = change.previousName;
        return metadata;
      }
      metadata.changed_fields = "icon";
      return metadata;
    case "credentials": {
      const fields: string[] = [];
      if (change.customHeadersChange !== undefined) {
        fields.push("custom_headers");
        metadata.custom_headers_change = change.customHeadersChange;
      }
      if (change.sharedSecretChange !== undefined) {
        fields.push("shared_secret");
        metadata.shared_secret_change = change.sharedSecretChange;
      }
      metadata.changed_fields = fields.sort().join(",");
      return metadata;
    }
    case "oauth":
      metadata.changed_fields = change.scopeChanged
        ? "oauth_scope,oauth_use_case"
        : "oauth_use_case";
      metadata.oauth_use_case = change.oauthUseCase;
      return metadata;
    case "restriction":
      metadata.changed_fields = "is_restricted_to_skills";
      metadata.is_restricted_to_skills = change.isRestrictedToSkills
        ? "true"
        : "false";
      return metadata;
    case "meta":
      metadata.changed_fields = "meta";
      metadata.meta_cleared = change.cleared ? "true" : "false";
      return metadata;
    default:
      return assertNever(change);
  }
}

export function recordMcpServerCreated(
  auth: Authenticator,
  identity: McpServerCatalogIdentity
): void {
  void emitAuditLogEvent({
    auth,
    action: "mcp_server.created",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("mcp_server", {
        sId: identity.sId,
        name: identity.displayName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: projectCreatedMetadata(identity),
  });
}

export function recordMcpServerUpdated(
  auth: Authenticator,
  identity: McpServerCatalogIdentity,
  change: McpServerCatalogChange
): void {
  void emitAuditLogEvent({
    auth,
    action: "mcp_server.updated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("mcp_server", {
        sId: identity.sId,
        name: identity.displayName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: projectUpdatedMetadata(identity, change),
  });
}

/** `spaceCount` is the number of non-system spaces the server was in. */
export function recordMcpServerDeleted(
  auth: Authenticator,
  identity: McpServerCatalogIdentity,
  spaceCount: number
): void {
  void emitAuditLogEvent({
    auth,
    action: "mcp_server.deleted",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("mcp_server", {
        sId: identity.sId,
        name: identity.displayName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      ...projectCreatedMetadata(identity),
      space_count: String(spaceCount),
    },
  });
}

export function recordMcpServerToolSettingsUpdated(
  auth: Authenticator,
  input: { readonly serverId: string; readonly toolCount: number }
): void {
  void emitAuditLogEvent({
    auth,
    action: "mcp_server.tool_settings_updated",
    targets: [buildAuditLogTarget("workspace", auth.getNonNullableWorkspace())],
    context: getAuditLogContext(auth),
    metadata: {
      server_id: input.serverId,
      tool_count: String(input.toolCount),
    },
  });
}
