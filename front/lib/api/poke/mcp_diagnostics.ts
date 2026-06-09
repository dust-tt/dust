import {
  getMCPServerAdminAuthenticationReason,
  MCPServerPersonalAuthenticationRequiredError,
  MCPServerRequiresAdminAuthenticationError,
} from "@app/lib/actions/mcp_authentication";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import {
  getInternalMCPServerInfo,
  getInternalMCPServerNameFromSId,
  type InternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  connectToMCPServer,
  fetchRemoteServerMetaDataByServerId,
} from "@app/lib/actions/mcp_metadata";
import { getMCPConnectionAccessToken } from "@app/lib/actions/mcp_oauth_access_token";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import {
  MCP_DIAGNOSTIC_CHECK_NAMES,
  type MCPDiagnosticCheckName,
  type MCPDiagnosticSummary,
} from "@app/lib/api/poke/mcp_diagnostics_types";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import logger from "@app/logger/logger";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";
import type { OAuthAPIError } from "@app/types/oauth/oauth_api";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

const MCPDiagnosticCheckNameSchema = z.enum(MCP_DIAGNOSTIC_CHECK_NAMES);

const DEFAULT_CHECKS: MCPDiagnosticCheckName[] = [
  "connection_inventory",
  "oauth_metadata",
  "oauth_token_fetch",
  "connect_list_tools",
  "sync_simulation",
];

const NO_OAUTH_USE_CASE_SKIP_MESSAGE =
  "Skipped: this server view has no oAuthUseCase configured. OAuth is not expected for this server (it may use API key auth instead).";

type CheckStatus = "ok" | "warn" | "error" | "skipped";

type DiagnosticCheckResult = {
  check: MCPDiagnosticCheckName;
  status: CheckStatus;
  duration_ms?: number;
  connection_type?: MCPServerConnectionConnectionType;
  oAuthUseCase?: MCPOAuthUseCase | null;
  message?: string;
  error?: Record<string, unknown>;
  details?: Record<string, unknown>;
};

type OAuthDiagnosticCheckName = "oauth_metadata" | "oauth_token_fetch";

export function createOAuthCheckSkippedNoUseCase(
  check: OAuthDiagnosticCheckName
): DiagnosticCheckResult {
  return {
    check,
    status: "skipped",
    oAuthUseCase: null,
    message: NO_OAUTH_USE_CASE_SKIP_MESSAGE,
    details: {
      reason: "no_oauth_use_case",
    },
  };
}

export type { MCPDiagnosticSummary };

function isRemoteMCPServer(mcpServerId: string): boolean {
  return getServerTypeAndIdFromSId(mcpServerId).serverType === "remote";
}

function formatExpiryIso(expiryMs: number | null | undefined): string | null {
  if (expiryMs == null) {
    return null;
  }
  return new Date(expiryMs).toISOString();
}

function expiryDiagnostics(expiryMs: number | null | undefined): {
  access_token_expiry: string | null;
  expires_in_seconds: number | null;
  within_refresh_buffer: boolean;
} {
  if (expiryMs == null) {
    return {
      access_token_expiry: null,
      expires_in_seconds: null,
      within_refresh_buffer: false,
    };
  }

  const expiresInSeconds = Math.round((expiryMs - Date.now()) / 1000);
  const refreshBufferSeconds = 5 * 60;

  return {
    access_token_expiry: formatExpiryIso(expiryMs),
    expires_in_seconds: expiresInSeconds,
    within_refresh_buffer: expiresInSeconds <= refreshBufferSeconds,
  };
}

function hasRefreshTokenHint(scrubbedRawJson: unknown): boolean | null {
  if (scrubbedRawJson == null || typeof scrubbedRawJson !== "object") {
    return null;
  }

  return "refresh_token" in (scrubbedRawJson as Record<string, unknown>);
}

function serializeConnectError(error: unknown): Record<string, unknown> {
  if (MCPServerRequiresAdminAuthenticationError.is(error)) {
    return {
      layer: "mcp_connect",
      type: error.name,
      reason: error.reason,
      message: error.message,
    };
  }

  if (MCPServerPersonalAuthenticationRequiredError.is(error)) {
    return {
      layer: "mcp_connect",
      type: error.name,
      provider: error.provider,
      scope: error.scope,
      message: error.message,
    };
  }

  if (error instanceof DustError) {
    return {
      layer: "dust",
      code: error.code,
      message: error.message,
    };
  }

  const normalized = normalizeError(error);
  return {
    layer: "unknown",
    message: normalized.message,
    name: normalized.name,
  };
}

function serializeOAuthError(error: OAuthAPIError): Record<string, unknown> {
  return {
    layer: "oauth_api",
    code: error.code,
    message: error.message,
  };
}

export function resolveConnectionTypesToTest({
  oAuthUseCase,
  connectionType,
  userId,
}: {
  oAuthUseCase: MCPOAuthUseCase | null;
  connectionType?: "workspace" | "personal" | "both";
  userId?: string;
}): MCPServerConnectionConnectionType[] {
  if (connectionType === "workspace") {
    return ["workspace"];
  }
  if (connectionType === "personal") {
    return ["personal"];
  }
  if (connectionType === "both") {
    return ["workspace", "personal"];
  }

  if (oAuthUseCase === "platform_actions") {
    return ["workspace"];
  }

  if (oAuthUseCase === "personal_actions" && userId) {
    return ["workspace", "personal"];
  }

  return ["workspace"];
}

async function getAuthForConnectionType(
  adminAuth: Authenticator,
  workspaceId: string,
  connectionType: MCPServerConnectionConnectionType,
  userId?: string
): Promise<Authenticator> {
  if (connectionType === "workspace") {
    return adminAuth;
  }

  if (!userId) {
    return adminAuth;
  }

  return Authenticator.fromUserIdAndWorkspaceId(userId, workspaceId);
}

function connectionRowSummary(
  connection: MCPServerConnectionResource | undefined
): Record<string, unknown> | null {
  if (!connection) {
    return null;
  }

  return {
    sId: connection.sId,
    connectionId: connection.connectionId ?? null,
    credentialId: connection.credentialId ?? null,
    connectionType: connection.connectionType,
    authType: connection.connectionId ? "oauth" : "keypair",
    userId: connection.user?.sId ?? null,
    createdAt: connection.createdAt.toISOString(),
  };
}

async function runConnectionInventoryCheck(
  auth: Authenticator,
  mcpServerId: string
): Promise<DiagnosticCheckResult> {
  const connectionsRes = await MCPServerConnectionResource.listByMCPServer(
    auth,
    { mcpServerId }
  );

  if (connectionsRes.isErr()) {
    return {
      check: "connection_inventory",
      status: "error",
      error: {
        layer: "dust",
        code: connectionsRes.error.code,
        message: connectionsRes.error.message,
      },
    };
  }

  const connections = connectionsRes.value;
  const workspaceConnections = connections.filter(
    (c) => c.connectionType === "workspace"
  );
  const personalConnections = connections.filter(
    (c) => c.connectionType === "personal"
  );

  const latestWorkspace = workspaceConnections[0];
  const workspaceHasOAuthConnectionId = !!latestWorkspace?.connectionId;

  const personalOnlySetup =
    personalConnections.some((c) => !!c.connectionId) &&
    !workspaceHasOAuthConnectionId;

  let setupVsReconnectHint: "setup" | "reconnect" | null = null;
  if (!latestWorkspace) {
    setupVsReconnectHint = "setup";
  } else if (!workspaceHasOAuthConnectionId && !latestWorkspace.credentialId) {
    setupVsReconnectHint = "setup";
  }

  return {
    check: "connection_inventory",
    status: personalOnlySetup ? "warn" : "ok",
    details: {
      workspace: connectionRowSummary(latestWorkspace),
      personal: personalConnections.map((c) => connectionRowSummary(c)),
      counts: {
        workspace: workspaceConnections.length,
        personal: personalConnections.length,
      },
    },
    message: personalOnlySetup
      ? "Personal OAuth connection(s) exist but no workspace OAuth connectionId — sync and shared mode will fail."
      : undefined,
    error: personalOnlySetup
      ? {
          diagnosis: {
            sync_will_use: "workspace",
            personal_only_setup: true,
            setup_vs_reconnect_hint: setupVsReconnectHint ?? "setup",
          },
        }
      : {
          diagnosis: {
            sync_will_use: "workspace",
            personal_only_setup: false,
            setup_vs_reconnect_hint: setupVsReconnectHint,
          },
        },
  };
}

async function runOAuthMetadataCheck(
  auth: Authenticator,
  connectionId: string,
  connectionType: MCPServerConnectionConnectionType
): Promise<DiagnosticCheckResult> {
  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const metadataRes = await oauthApi.getConnectionMetadata({ connectionId });

  if (metadataRes.isErr()) {
    return {
      check: "oauth_metadata",
      status: "error",
      connection_type: connectionType,
      error: serializeOAuthError(metadataRes.error),
    };
  }

  const connection = metadataRes.value.connection;

  return {
    check: "oauth_metadata",
    status: "ok",
    connection_type: connectionType,
    details: {
      connectionId: connection.connection_id,
      provider: connection.provider,
      status: connection.status,
      metadata: connection.metadata,
    },
  };
}

async function runOAuthTokenFetchCheck(
  auth: Authenticator,
  connectionId: string,
  connectionType: MCPServerConnectionConnectionType
): Promise<DiagnosticCheckResult> {
  const startedAt = Date.now();

  const tokenRes = await getMCPConnectionAccessToken(auth, {
    connectionId,
    localLogger: logger,
  });
  const duration_ms = Date.now() - startedAt;

  if (tokenRes.isErr()) {
    return {
      check: "oauth_token_fetch",
      status: "error",
      duration_ms,
      connection_type: connectionType,
      error: serializeOAuthError(tokenRes.error),
    };
  }

  const { access_token_expiry, scrubbed_raw_json } = tokenRes.value;

  return {
    check: "oauth_token_fetch",
    status: "ok",
    duration_ms,
    connection_type: connectionType,
    details: {
      token_length: tokenRes.value.access_token.length,
      expiry: expiryDiagnostics(access_token_expiry),
      has_scrubbed_refresh_token_hint: hasRefreshTokenHint(scrubbed_raw_json),
      scrubbed_raw_json,
    },
  };
}

async function runConnectListToolsCheck(
  auth: Authenticator,
  {
    mcpServerId,
    oAuthUseCase,
    connectionType,
  }: {
    mcpServerId: string;
    oAuthUseCase: MCPOAuthUseCase | null;
    connectionType: MCPServerConnectionConnectionType;
  }
): Promise<DiagnosticCheckResult> {
  const startedAt = Date.now();

  const agentLoopContext =
    connectionType === "personal"
      ? { runContext: {} as AgentLoopRunContextType }
      : undefined;

  const connectRes = await connectToMCPServer(auth, {
    params: {
      type: "mcpServerId",
      mcpServerId,
      oAuthUseCase,
    },
    agentLoopContext,
  });

  if (connectRes.isErr()) {
    return {
      check: "connect_list_tools",
      status: "error",
      duration_ms: Date.now() - startedAt,
      connection_type: connectionType,
      oAuthUseCase,
      error: serializeConnectError(connectRes.error),
    };
  }

  const client = connectRes.value;

  try {
    const toolsResult = await client.listTools();
    const serverVersion = client.getServerVersion();

    return {
      check: "connect_list_tools",
      status: "ok",
      duration_ms: Date.now() - startedAt,
      connection_type: connectionType,
      oAuthUseCase,
      details: {
        tools_count: toolsResult.tools.length,
        server_version: serverVersion ?? null,
        tool_names: toolsResult.tools.map((t) => t.name).slice(0, 20),
      },
    };
  } catch (error) {
    return {
      check: "connect_list_tools",
      status: "error",
      duration_ms: Date.now() - startedAt,
      connection_type: connectionType,
      oAuthUseCase,
      error: serializeConnectError(error),
    };
  } finally {
    await client.close();
  }
}

async function runSyncSimulationCheck(
  auth: Authenticator,
  {
    mcpServerId,
    serverViewOAuthUseCase,
  }: {
    mcpServerId: string;
    serverViewOAuthUseCase: MCPOAuthUseCase | null;
  }
): Promise<DiagnosticCheckResult> {
  if (!isRemoteMCPServer(mcpServerId)) {
    return {
      check: "sync_simulation",
      status: "skipped",
      message: "Weekly/manual sync only applies to remote MCP servers.",
      details: {
        server_type: "internal",
      },
    };
  }

  const startedAt = Date.now();
  const syncRes = await fetchRemoteServerMetaDataByServerId(auth, mcpServerId);
  const duration_ms = Date.now() - startedAt;

  const mismatch =
    serverViewOAuthUseCase === "personal_actions" &&
    syncRes.isErr() &&
    syncRes.error.message.includes("set up the workspace connection");

  if (syncRes.isErr()) {
    return {
      check: "sync_simulation",
      status: "error",
      duration_ms,
      oAuthUseCase: "platform_actions",
      error: serializeConnectError(syncRes.error),
      details: {
        uses_oauth_use_case: "platform_actions",
        server_view_oauth_use_case: serverViewOAuthUseCase,
        mismatch,
      },
    };
  }

  return {
    check: "sync_simulation",
    status: "ok",
    duration_ms,
    oAuthUseCase: "platform_actions",
    details: {
      uses_oauth_use_case: "platform_actions",
      server_view_oauth_use_case: serverViewOAuthUseCase,
      mismatch: false,
      cached_name: syncRes.value.name,
      tools_count: syncRes.value.tools.length,
    },
  };
}

export function deriveDiagnosticSummary(
  checks: DiagnosticCheckResult[],
  oAuthUseCase: MCPOAuthUseCase | null
): MCPDiagnosticSummary {
  const errors = checks.filter((c) => c.status === "error");
  const warnings = checks.filter((c) => c.status === "warn");

  if (errors.length === 0 && warnings.length === 0) {
    return {
      overall: "ok",
      primary_issue: null,
      recommended_action: null,
    };
  }

  const inventory = checks.find((c) => c.check === "connection_inventory");
  const sync = checks.find((c) => c.check === "sync_simulation");
  const tokenFetch = checks.find((c) => c.check === "oauth_token_fetch");

  if (
    inventory?.status === "warn" ||
    (sync?.details?.mismatch === true && oAuthUseCase === "personal_actions")
  ) {
    return {
      overall: "failed",
      primary_issue: "personal_vs_workspace_mismatch",
      recommended_action:
        "Configure a workspace-level OAuth connection (shared credentials). Personal user OAuth alone is insufficient for sync and platform_actions paths.",
    };
  }

  if (tokenFetch?.status === "error") {
    const code =
      typeof tokenFetch.error?.code === "string"
        ? tokenFetch.error.code
        : "unknown";
    return {
      overall: "failed",
      primary_issue: "oauth_token_refresh_failure",
      recommended_action:
        code === "token_revoked"
          ? "Reconnect the OAuth connection — the refresh token is revoked or expired."
          : "Inspect OAuth refresh logs in core for this connectionId (provider error, timeout, or missing refresh_token in provider response).",
    };
  }

  if (sync?.status === "error") {
    return {
      overall: "failed",
      primary_issue: "sync_path_failure",
      recommended_action:
        "Fix the workspace OAuth connection used by sync (platform_actions). See connect_list_tools and oauth_token_fetch results for the same connection.",
    };
  }

  if (errors.some((c) => c.check === "connect_list_tools")) {
    return {
      overall: "failed",
      primary_issue: "mcp_connect_failure",
      recommended_action:
        "Review the connect_list_tools error — distinguish admin setup vs reconnect vs personal auth required.",
    };
  }

  return {
    overall: warnings.length > 0 ? "warn" : "failed",
    primary_issue: "mcp_diagnostic_issues",
    recommended_action:
      "Review individual check results for details on each failing step.",
  };
}

async function resolveServerContext(
  auth: Authenticator,
  {
    mcpServerId,
    serverViewId,
  }: {
    mcpServerId: string;
    serverViewId?: string;
  }
): Promise<
  | {
      mcpServerId: string;
      serverView: {
        sId: string;
        oAuthUseCase: MCPOAuthUseCase | null;
        serverType: "internal" | "remote";
        url: string | null;
        name: string | null;
      } | null;
    }
  | { error: string }
> {
  const { serverType } = getServerTypeAndIdFromSId(mcpServerId);

  let serverViewResource: MCPServerViewResource | null = null;
  if (serverViewId) {
    serverViewResource = await MCPServerViewResource.fetchById(
      auth,
      serverViewId
    );
    if (!serverViewResource) {
      return {
        error: `MCP server view "${serverViewId}" not found in workspace.`,
      };
    }
    if (serverViewResource.mcpServerId !== mcpServerId) {
      return {
        error: `MCP server view "${serverViewId}" belongs to ${serverViewResource.mcpServerId}, not ${mcpServerId}.`,
      };
    }
  } else {
    const views = await MCPServerViewResource.listByMCPServer(
      auth,
      mcpServerId
    );
    serverViewResource = views[0] ?? null;
  }

  let url: string | null = null;
  let name: string | null = null;

  if (serverType === "remote") {
    const remoteServer = await RemoteMCPServerResource.fetchById(
      auth,
      mcpServerId
    );
    url = remoteServer?.url ?? null;
    name = remoteServer?.cachedName ?? null;
  } else {
    const internalServerName = getInternalMCPServerNameFromSId(mcpServerId);
    if (internalServerName) {
      try {
        const info = getInternalMCPServerInfo(
          internalServerName as InternalMCPServerNameType
        );
        name = info.name;
      } catch {
        name = null;
      }
    }
  }

  return {
    mcpServerId,
    serverView: serverViewResource
      ? {
          sId: serverViewResource.sId,
          oAuthUseCase: serverViewResource.oAuthUseCase,
          serverType,
          url,
          name,
        }
      : null,
  };
}

export async function runMCPDiagnostics(
  auth: Authenticator,
  {
    workspaceId,
    mcpServerId,
    serverViewId,
    userId,
    checks,
    connectionType,
  }: {
    workspaceId: string;
    mcpServerId: string;
    serverViewId?: string;
    userId?: string;
    checks?: MCPDiagnosticCheckName[];
    connectionType?: "workspace" | "personal" | "both";
  }
): Promise<Record<string, unknown>> {
  const selectedChecks = checks ?? DEFAULT_CHECKS;
  const invalidChecks = selectedChecks.filter(
    (c) => !MCPDiagnosticCheckNameSchema.safeParse(c).success
  );
  if (invalidChecks.length > 0) {
    throw new Error(`Unknown diagnostic checks: ${invalidChecks.join(", ")}`);
  }

  const serverContext = await resolveServerContext(auth, {
    mcpServerId,
    serverViewId,
  });

  if ("error" in serverContext) {
    throw new Error(serverContext.error);
  }

  const oAuthUseCase = serverContext.serverView?.oAuthUseCase ?? null;
  const connectionTypes = resolveConnectionTypesToTest({
    oAuthUseCase,
    connectionType,
    userId,
  });

  const results: DiagnosticCheckResult[] = [];

  for (const checkName of selectedChecks) {
    if (checkName === "connection_inventory") {
      results.push(await runConnectionInventoryCheck(auth, mcpServerId));
      continue;
    }

    if (checkName === "sync_simulation") {
      results.push(
        await runSyncSimulationCheck(auth, {
          mcpServerId,
          serverViewOAuthUseCase: oAuthUseCase,
        })
      );
      continue;
    }

    if (
      (checkName === "oauth_metadata" || checkName === "oauth_token_fetch") &&
      oAuthUseCase === null
    ) {
      results.push(createOAuthCheckSkippedNoUseCase(checkName));
      continue;
    }

    for (const connType of connectionTypes) {
      if (connType === "personal" && !userId) {
        if (
          checkName === "oauth_metadata" ||
          checkName === "oauth_token_fetch" ||
          checkName === "connect_list_tools"
        ) {
          results.push({
            check: checkName,
            status: "skipped",
            connection_type: connType,
            message:
              "Provide user_id to run personal connection checks (personal OAuth is user-scoped).",
          });
        }
        continue;
      }

      const checkAuth = await getAuthForConnectionType(
        auth,
        workspaceId,
        connType,
        userId
      );

      if (checkName === "oauth_metadata" || checkName === "oauth_token_fetch") {
        const connectionRes = await MCPServerConnectionResource.findByMCPServer(
          checkAuth,
          {
            mcpServerId,
            connectionType: connType,
          }
        );

        if (connectionRes.isErr()) {
          results.push({
            check: checkName,
            status: "error",
            connection_type: connType,
            error: {
              layer: "dust",
              code: connectionRes.error.code,
              message: connectionRes.error.message,
              admin_reason:
                connType === "workspace"
                  ? getMCPServerAdminAuthenticationReason(
                      new DustError(
                        connectionRes.error.code === "connection_not_found"
                          ? "connection_not_found"
                          : "mcp_access_token_error",
                        connectionRes.error.message
                      )
                    )
                  : undefined,
            },
          });
          continue;
        }

        const connectionId = connectionRes.value.connectionId;
        if (!connectionId) {
          results.push({
            check: checkName,
            status: "error",
            connection_type: connType,
            error: {
              layer: "dust",
              message: "Connection row missing connectionId.",
            },
          });
          continue;
        }

        if (checkName === "oauth_metadata") {
          results.push(
            await runOAuthMetadataCheck(checkAuth, connectionId, connType)
          );
        } else {
          results.push(
            await runOAuthTokenFetchCheck(checkAuth, connectionId, connType)
          );
        }
        continue;
      }

      if (checkName === "connect_list_tools") {
        const effectiveOAuthUseCase: MCPOAuthUseCase | null =
          oAuthUseCase === null
            ? null
            : connType === "personal"
              ? "personal_actions"
              : "platform_actions";

        results.push(
          await runConnectListToolsCheck(checkAuth, {
            mcpServerId,
            oAuthUseCase: effectiveOAuthUseCase,
            connectionType: connType,
          })
        );
      }
    }
  }

  const summary = deriveDiagnosticSummary(results, oAuthUseCase);

  return {
    workspace_id: workspaceId,
    mcp_server_id: mcpServerId,
    server_view: serverContext.serverView,
    checks_requested: selectedChecks,
    connection_types_tested: connectionTypes,
    summary,
    checks: results,
    poke_url: `${config.getPokeAppUrl()}/${workspaceId}`,
  };
}
