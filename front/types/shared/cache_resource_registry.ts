/**
 * Shared cache resource registry — importable by both API routes and UI.
 *
 * Each entry describes one logical "resource type" that is cached via
 * `cacheWithRedis`. The registry is a parallel source of truth: we do NOT
 * refactor the actual `cacheWithRedis` call sites. Instead, each definition
 * mirrors the function name and resolver key format used at the call site.
 */

export interface CacheResourceParam {
  key: string;
  label: string;
  type: "string" | "number";
  placeholder: string;
}

export interface CacheResourceDefinition {
  id: string;
  label: string;
  fnName: string;
  params: CacheResourceParam[];
  buildResolverKey: (params: Record<string, string>) => string;
}

export function buildCacheKey(
  resource: CacheResourceDefinition,
  params: Record<string, string>
): string {
  return `cacheWithRedis-${resource.fnName}-${resource.buildResolverKey(params)}`;
}

export const CACHE_RESOURCE_REGISTRY: CacheResourceDefinition[] = [
  {
    id: "workspace_by_sid",
    label: "Workspace (by sId)",
    fnName: "_fetchByIdUncached",
    params: [
      {
        key: "wId",
        label: "Workspace sId",
        type: "string",
        placeholder: "e.g. abc123",
      },
    ],
    buildResolverKey: (p) => `workspace:sid:${p.wId}`,
  },
  {
    id: "user_by_workos_id",
    label: "User (by WorkOS ID)",
    fnName: "_fetchByWorkOSUserIdUncached",
    params: [
      {
        key: "workOSUserId",
        label: "WorkOS User ID",
        type: "string",
        placeholder: "e.g. user_01ABC...",
      },
    ],
    buildResolverKey: (p) => `user:workos:${p.workOSUserId}`,
  },
  {
    id: "subscription_by_workspace",
    label: "Subscription (by workspace ModelId)",
    fnName: "_fetchActiveByWorkspaceModelIdUncached",
    params: [
      {
        key: "workspaceModelId",
        label: "Workspace ModelId",
        type: "number",
        placeholder: "e.g. 42",
      },
    ],
    buildResolverKey: (p) =>
      `subscription:active:workspaceId:${p.workspaceModelId}`,
  },
  {
    id: "membership_role",
    label: "Membership role",
    fnName: "_getActiveRoleForUserInWorkspaceUncached",
    params: [
      {
        key: "userModelId",
        label: "User ModelId",
        type: "number",
        placeholder: "e.g. 1",
      },
      {
        key: "workspaceModelId",
        label: "Workspace ModelId",
        type: "number",
        placeholder: "e.g. 42",
      },
    ],
    buildResolverKey: (p) =>
      `role:user:${p.userModelId}:workspace:${p.workspaceModelId}`,
  },
  {
    id: "membership_seats",
    label: "Membership seats (active count)",
    fnName: "_countActiveSeatsInWorkspaceUncached",
    params: [
      {
        key: "workspaceId",
        label: "Workspace sId",
        type: "string",
        placeholder: "e.g. DevWkSpace",
      },
    ],
    buildResolverKey: (p) => `count-active-seats-in-workspace:${p.workspaceId}`,
  },
  {
    id: "workos_orgs_for_user",
    label: "WorkOS organizations (for user)",
    fnName: "findWorkOSOrganizationsForUserIdUncached",
    params: [
      {
        key: "userId",
        label: "User ModelId",
        type: "string",
        placeholder: "e.g. 123",
      },
    ],
    buildResolverKey: (p) => `workos-orgs-${p.userId}`,
  },
  {
    id: "workspace_region",
    label: "Workspace region",
    fnName: "_lookupWorkspaceUncached",
    params: [
      {
        key: "wId",
        label: "Workspace sId",
        type: "string",
        placeholder: "e.g. abc123",
      },
    ],
    buildResolverKey: (p) => `workspace-region:${p.wId}`,
  },
  {
    id: "provider_status",
    label: "Provider status",
    fnName: "getProvidersStatus",
    params: [
      {
        key: "region",
        label: "Region",
        type: "string",
        placeholder: "e.g. us-east-1",
      },
    ],
    buildResolverKey: (p) => `provider-status-${p.region}`,
  },
  {
    id: "dust_status",
    label: "Dust status",
    fnName: "getDustStatus",
    params: [
      {
        key: "region",
        label: "Region",
        type: "string",
        placeholder: "e.g. us-east-1",
      },
    ],
    buildResolverKey: (p) => `dust-status-${p.region}`,
  },
  {
    id: "key_monthly_cap",
    label: "Key monthly cap",
    fnName: "fetchKeyMonthlyCap",
    params: [
      {
        key: "keyId",
        label: "Key ModelId",
        type: "number",
        placeholder: "e.g. 7",
      },
    ],
    buildResolverKey: (p) => `key-cap:${p.keyId}`,
  },
  {
    id: "slack_channels",
    label: "Slack channels",
    fnName: "anonymous",
    params: [
      {
        key: "mcpServerId",
        label: "MCP Server ModelId",
        type: "number",
        placeholder: "e.g. 123",
      },
    ],
    buildResolverKey: (p) => `${p.mcpServerId}`,
  },
  {
    id: "slack_users",
    label: "Slack users",
    fnName: "anonymous",
    params: [
      {
        key: "mcpServerId",
        label: "MCP Server ModelId",
        type: "number",
        placeholder: "e.g. 123",
      },
    ],
    buildResolverKey: (p) => `slack_users_${p.mcpServerId}`,
  },
];

export function getCacheResourceById(
  id: string
): CacheResourceDefinition | undefined {
  return CACHE_RESOURCE_REGISTRY.find((r) => r.id === id);
}
