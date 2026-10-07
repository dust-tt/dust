import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { GroupResource } from "@app/lib/resources/group_resource";
import { isCapEligibleGroupKind } from "@app/types/groups";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// What a consumption export may cover: the whole workspace, or only the members of `groupIds`
export type ConsumptionExportScope =
  | { kind: "workspace" }
  | { kind: "groups"; groupIds: ReadonlySet<string> };

/**
 * @cc [owner:fabiencelier,label:security;product] consumption-export-scope
 * A workspace admin MUST get the `workspace` scope. Any other caller MUST get `unauthorized` unless
 * `filter.groups` is non-empty, contains no empty value, and every value resolves in the workspace
 * to a group on which the caller holds `read_analytics`.
 */
export async function getConsumptionExportScope(
  auth: Authenticator,
  filter: ConsumptionScopeFilter | undefined
): Promise<Result<ConsumptionExportScope, DustError<"unauthorized">>> {
  if (auth.isAdmin()) {
    return new Ok({ kind: "workspace" });
  }

  const unauthorized = new Err(
    new DustError(
      "unauthorized",
      "Exporting consumption analytics requires an admin API key, or a filter on groups whose " +
        "analytics the API key can read."
    )
  );

  const requestedGroupIds = filter?.groups ?? [];
  // An empty value is dropped from the query, which would widen the export to the workspace.
  if (
    requestedGroupIds.length === 0 ||
    requestedGroupIds.some((groupId) => groupId.length === 0)
  ) {
    return unauthorized;
  }

  const groupIds = new Set(requestedGroupIds);
  const groupsRes = await GroupResource.fetchByIds(auth, [...groupIds]);
  if (groupsRes.isErr()) {
    return unauthorized;
  }
  const canReadAll = groupsRes.value.every(
    (group) =>
      isCapEligibleGroupKind(group.kind) && auth.can("read_analytics", group)
  );
  if (!canReadAll) {
    return unauthorized;
  }

  return new Ok({ kind: "groups", groupIds });
}
