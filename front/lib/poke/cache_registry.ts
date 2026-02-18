interface CacheParamDef {
  name: string;
  label: string;
  type: "string" | "number";
}

interface CacheRegistryEntry {
  label: string;
  description: string;
  fnName: string;
  params: CacheParamDef[];
  buildResolverKey: (params: Record<string, string>) => string;
}

export const CACHE_REGISTRY: Record<string, CacheRegistryEntry> = {
  workspace: {
    label: "Workspace",
    description: "Workspace fetched by sId",
    fnName: "_fetchByIdUncached",
    params: [{ name: "wId", label: "Workspace sId", type: "string" }],
    buildResolverKey: (p) => `workspace:sid:${p.wId}`,
  },
  subscription: {
    label: "Subscription",
    description: "Active subscription by workspace model ID",
    fnName: "_fetchActiveByWorkspaceModelIdUncached",
    params: [
      {
        name: "workspaceModelId",
        label: "Workspace Model ID",
        type: "number",
      },
    ],
    buildResolverKey: (p) =>
      `subscription:active:workspaceId:${p.workspaceModelId}`,
  },
  user_by_workos_id: {
    label: "User by WorkOS ID",
    description: "User fetched by WorkOS user ID",
    fnName: "_fetchByWorkOSUserIdUncached",
    params: [{ name: "workOSUserId", label: "WorkOS User ID", type: "string" }],
    buildResolverKey: (p) => `user:workos:${p.workOSUserId}`,
  },
  membership_role: {
    label: "Membership Role",
    description: "Active role for a user in a workspace",
    fnName: "_getActiveRoleForUserInWorkspaceUncached",
    params: [
      { name: "userId", label: "User ID", type: "number" },
      { name: "workspaceId", label: "Workspace ID", type: "number" },
    ],
    buildResolverKey: (p) => `role:user:${p.userId}:workspace:${p.workspaceId}`,
  },
  active_seats: {
    label: "Active Seats",
    description: "Count of active seats in a workspace",
    fnName: "_countActiveSeatsInWorkspaceUncached",
    params: [{ name: "wId", label: "Workspace sId", type: "string" }],
    buildResolverKey: (p) => `count-active-seats-in-workspace:${p.wId}`,
  },
  key_monthly_cap: {
    label: "Key Monthly Cap",
    description: "Monthly cap for an API key",
    fnName: "fetchKeyMonthlyCap",
    params: [{ name: "keyId", label: "Key ID", type: "number" }],
    buildResolverKey: (p) => `key-cap:${p.keyId}`,
  },
  workos_organizations: {
    label: "WorkOS Organizations",
    description: "WorkOS organizations for a user",
    fnName: "findWorkOSOrganizationsForUserIdUncached",
    params: [{ name: "userId", label: "User ID", type: "string" }],
    buildResolverKey: (p) => `workos-orgs-${p.userId}`,
  },
  workspace_region: {
    label: "Workspace Region",
    description: "Region lookup for a workspace",
    fnName: "_lookupWorkspaceUncached",
    params: [{ name: "wId", label: "Workspace sId", type: "string" }],
    buildResolverKey: (p) => `workspace-region:${p.wId}`,
  },
  provider_status: {
    label: "Provider Status",
    description: "Provider status for a region",
    fnName: "getProvidersStatus",
    params: [{ name: "region", label: "Region", type: "string" }],
    buildResolverKey: (p) => `provider-status-${p.region}`,
  },
  dust_status: {
    label: "Dust Status",
    description: "Dust status for a region",
    fnName: "getDustStatus",
    params: [{ name: "region", label: "Region", type: "string" }],
    buildResolverKey: (p) => `dust-status-${p.region}`,
  },
};

export function buildCacheRedisKey(
  entry: CacheRegistryEntry,
  params: Record<string, string>
): string {
  return `cacheWithRedis-${entry.fnName}-${entry.buildResolverKey(params)}`;
}
