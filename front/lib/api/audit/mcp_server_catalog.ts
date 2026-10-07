import type { Authenticator } from "@app/lib/auth";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import { assertNever } from "@app/types/shared/utils/assert_never";

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "./workos_audit";

export type McpServerCatalogIdentity =
  | {
      readonly serverType: "remote";
      readonly sId: string;
      readonly catalogName: string;
    }
  | {
      readonly serverType: "internal";
      readonly sId: string;
      readonly catalogName: string;
      readonly internalName: string;
    };

export type McpServerSecretChange = "set" | "cleared";

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

export function mcpServerCatalogIdentity(
  input: McpServerCatalogNameInput
): McpServerCatalogIdentity {
  const trimmed = input.viewName?.trim() ?? "";
  const catalogName = trimmed.length > 0 ? trimmed : input.serverName;
  if (input.serverType === "internal") {
    return {
      serverType: "internal",
      sId: input.sId,
      catalogName,
      internalName: input.internalName,
    };
  }
  return {
    serverType: "remote",
    sId: input.sId,
    catalogName,
  };
}

function secretWriteKind(
  value: string | null | undefined
): McpServerSecretChange | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value.length === 0) {
    return "cleared";
  }
  return "set";
}

function headersWriteKind(
  headers: readonly { key: string; value: string }[] | null | undefined
): McpServerSecretChange | undefined {
  if (headers === undefined) {
    return undefined;
  }
  if (headers === null || headers.length === 0) {
    return "cleared";
  }
  return "set";
}

export function credentialsChange(input: {
  readonly sharedSecret?: string | null;
  readonly customHeaders?: readonly { key: string; value: string }[] | null;
}): McpServerCredentialsChange | null {
  const sharedSecretChange = secretWriteKind(input.sharedSecret);
  const customHeadersChange = headersWriteKind(input.customHeaders);
  if (sharedSecretChange !== undefined && customHeadersChange !== undefined) {
    return {
      kind: "credentials",
      sharedSecretChange,
      customHeadersChange,
    };
  }
  if (sharedSecretChange !== undefined) {
    return {
      kind: "credentials",
      sharedSecretChange,
    };
  }
  if (customHeadersChange !== undefined) {
    return {
      kind: "credentials",
      customHeadersChange,
    };
  }
  return null;
}

function projectCreatedMetadata(
  identity: McpServerCatalogIdentity
): Record<string, string> {
  const metadata: Record<string, string> = {
    server_type: identity.serverType,
    server_name: identity.catalogName,
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
        name: identity.catalogName,
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
        name: identity.catalogName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: projectUpdatedMetadata(identity, change),
  });
}

export function recordMcpServerDeleted(
  auth: Authenticator,
  identity: McpServerCatalogIdentity,
  nonSystemSpaceCount: number
): void {
  void emitAuditLogEvent({
    auth,
    action: "mcp_server.deleted",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("mcp_server", {
        sId: identity.sId,
        name: identity.catalogName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      ...projectCreatedMetadata(identity),
      space_count: String(nonSystemSpaceCount),
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
