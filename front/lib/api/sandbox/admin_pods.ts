import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { listNonArchivedProjectSpacesAsAdmin } from "@app/lib/api/projects/list";
import {
  addOwnerPolicyDomain,
  addWorkspacePolicyDomain,
  removeOwnerPolicyDomain,
  removeWorkspacePolicyDomain,
} from "@app/lib/api/sandbox/egress_policy";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SANDBOX_WORKSPACE_SCOPE_ID } from "@app/types/api/sandbox/egress_policy";
import type { PodSandboxEnvVarBulkResult } from "@app/types/api/sandbox/env_vars";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import type { SandboxEnvVarKind } from "@app/types/sandbox/env_var";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

// Pod selection for the central Computer admin page's multi-pod reads.
// "all-pods" resolves server-side to every live Pod so the client never has
// to expand the full Pod id list into a query string.
export type SandboxAdminPodSelection =
  | { kind: "all-pods" }
  | { kind: "pods"; podIds: string[] };

// Query shape shared by the bulk sandbox read routes: either scope=all-pods
// or podIds (comma-separated and/or repeated), never both.
export const SandboxAdminPodSelectionQuerySchema = z.object({
  scope: z.literal("all-pods").optional(),
  podIds: z.union([z.string(), z.array(z.string())]).optional(),
});

export function parseSandboxAdminPodSelection(
  query: z.infer<typeof SandboxAdminPodSelectionQuerySchema>
): Result<SandboxAdminPodSelection, Error> {
  if (query.scope === "all-pods") {
    if (query.podIds !== undefined) {
      return new Err(
        new Error("Provide either scope=all-pods or podIds, not both.")
      );
    }
    return new Ok({ kind: "all-pods" });
  }

  const rawPodIds = query.podIds ?? [];
  const podIds = [
    ...new Set(
      (Array.isArray(rawPodIds) ? rawPodIds : [rawPodIds])
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    ),
  ];
  if (podIds.length === 0) {
    return new Err(new Error("Provide either scope=all-pods or podIds."));
  }

  return new Ok({ kind: "pods", podIds });
}

// Resolves a pod selection to project spaces, admin surfaces only (the
// caller must have verified the admin role). Ids that do not resolve to a
// project space in this workspace are silently dropped: these reads back a
// live comparison view, and a Pod deleted between listing and query should
// vanish from the comparison, not fail it.
export async function resolveSandboxAdminPods(
  auth: Authenticator,
  selection: SandboxAdminPodSelection
): Promise<SpaceResource[]> {
  if (selection.kind === "all-pods") {
    const projectSpaces = await listNonArchivedProjectSpacesAsAdmin(auth);
    if (projectSpaces.isErr()) {
      // Unreachable behind ensureIsAdmin(); throwing surfaces a plumbing bug
      // as a 500 rather than silently returning no pods.
      throw projectSpaces.error;
    }
    return projectSpaces.value;
  }

  const spaces = await SpaceResource.fetchByIds(auth, selection.podIds);
  return spaces.filter((space) => space.isProject());
}

// Applies one validated env var independently to each pod: one pod-scoped
// row per pod, each encrypted under its own pod key (existing upsert path,
// which also emits the per-row audit events). Sequential on purpose — the
// route schema bounds podIds at 100 and parallel upserts would only pressure
// the connection pool.
export async function upsertSandboxEnvVarForPods(
  auth: Authenticator,
  {
    podIds,
    name,
    value,
    kind,
    allowedDomains,
    context,
  }: {
    podIds: string[];
    name: string;
    value: string;
    kind: SandboxEnvVarKind;
    allowedDomains?: string[] | null;
    context?: AuditLogContext;
  }
): Promise<PodSandboxEnvVarBulkResult[]> {
  const spaces = await SpaceResource.fetchByIds(auth, podIds);
  const spacesById = new Map(spaces.map((space) => [space.sId, space]));

  const results: PodSandboxEnvVarBulkResult[] = [];
  for (const podId of podIds) {
    const pod = spacesById.get(podId);
    if (!pod || !pod.isProject()) {
      results.push({
        podId,
        success: false,
        errorMessage: "Pod not found.",
      });
      continue;
    }

    const result = await SandboxEnvVarResource.upsert(
      auth,
      { kind: "pod", pod },
      { name, value, kind, allowedDomains, context }
    );
    if (result.isErr()) {
      results.push({
        podId,
        success: false,
        errorMessage: result.error.message,
      });
      continue;
    }

    results.push({ podId, success: true, created: result.value.created });
  }

  return results;
}

// One egress-domain add/remove applied across the workspace policy and/or a
// set of pod policies for the central Computer admin page. scopeId is
// "workspace" for the workspace scope or a pod sId.
export type BulkEgressOperation =
  | { operation: "add"; domain: string }
  | { operation: "remove"; domain: string };

export type ScopeMutationResult = {
  scopeId: string;
  success: boolean;
  errorMessage?: string;
};

// Emits the same sandbox_egress_policy.updated event as the single-pod PUT
// route. space_id carries the pod sId for pods and is omitted for the
// workspace scope (same convention as sandbox_env_var.* events).
function emitEgressPolicyAudit(
  auth: Authenticator,
  {
    podId,
    policy,
    context,
  }: { podId: string | null; policy: EgressPolicy; context?: AuditLogContext }
): void {
  const workspace = auth.getNonNullableWorkspace();
  void emitAuditLogEvent({
    auth,
    action: "sandbox_egress_policy.updated",
    targets: [
      buildAuditLogTarget("workspace", workspace),
      {
        type: "sandbox_egress_policy",
        id: podId ?? workspace.sId,
        name: podId ? "Pod sandbox egress policy" : "Sandbox egress policy",
      },
    ],
    context,
    metadata: {
      allowed_domain_count: String(policy.allowedDomains.length),
      allowed_domains: policy.allowedDomains.join(","),
      ...(podId ? { space_id: podId } : {}),
    },
  });
}

// Applies one egress-domain add/remove to each selected scope independently,
// reusing the same per-scope helpers (and audit event) the single-scope routes
// use. Sequential on purpose — the route schema bounds podIds at 100 and
// parallel writes would only pressure the connection pool and GCS.
export async function bulkUpdateEgressDomain(
  auth: Authenticator,
  {
    includeWorkspace,
    podIds,
    operation,
    context,
  }: {
    includeWorkspace: boolean;
    podIds: string[];
    operation: BulkEgressOperation;
    context?: AuditLogContext;
  }
): Promise<ScopeMutationResult[]> {
  const { domain } = operation;

  // Normalize both scopes' distinct add/remove return shapes into a single
  // { policy, changed } outcome so callers audit uniformly.
  async function applyWorkspace(): Promise<
    Result<{ policy: EgressPolicy; changed: boolean }, Error>
  > {
    if (operation.operation === "add") {
      const r = await addWorkspacePolicyDomain(auth, { domain });
      if (r.isErr()) {
        return r;
      }
      return new Ok({
        policy: r.value.policy,
        changed: r.value.addedDomain !== null,
      });
    }
    const r = await removeWorkspacePolicyDomain(auth, { domain });
    if (r.isErr()) {
      return r;
    }
    return new Ok({
      policy: r.value.policy,
      changed: r.value.removedDomain !== null,
    });
  }

  async function applyPod(
    ownerId: string
  ): Promise<Result<{ policy: EgressPolicy; changed: boolean }, Error>> {
    if (operation.operation === "add") {
      const r = await addOwnerPolicyDomain(auth, { ownerId, domain });
      if (r.isErr()) {
        return r;
      }
      return new Ok({
        policy: r.value.policy,
        changed: r.value.addedDomain !== null,
      });
    }
    const r = await removeOwnerPolicyDomain(auth, { ownerId, domain });
    if (r.isErr()) {
      return r;
    }
    return new Ok({
      policy: r.value.policy,
      changed: r.value.removedDomain !== null,
    });
  }

  const results: ScopeMutationResult[] = [];

  if (includeWorkspace) {
    const result = await applyWorkspace();
    if (result.isErr()) {
      results.push({
        scopeId: SANDBOX_WORKSPACE_SCOPE_ID,
        success: false,
        errorMessage: result.error.message,
      });
    } else {
      results.push({ scopeId: SANDBOX_WORKSPACE_SCOPE_ID, success: true });
      if (result.value.changed) {
        emitEgressPolicyAudit(auth, {
          podId: null,
          policy: result.value.policy,
          context,
        });
      }
    }
  }

  const spaces = await SpaceResource.fetchByIds(auth, podIds);
  const spacesById = new Map(spaces.map((space) => [space.sId, space]));

  for (const podId of podIds) {
    const pod = spacesById.get(podId);
    if (!pod || !pod.isProject()) {
      results.push({
        scopeId: podId,
        success: false,
        errorMessage: "Pod not found.",
      });
      continue;
    }

    const result = await applyPod(podId);
    if (result.isErr()) {
      results.push({
        scopeId: podId,
        success: false,
        errorMessage: result.error.message,
      });
      continue;
    }

    results.push({ scopeId: podId, success: true });
    if (result.value.changed) {
      emitEgressPolicyAudit(auth, {
        podId,
        policy: result.value.policy,
        context,
      });
    }
  }

  return results;
}

// Deletes one env var (by suffix, the stored `name` column) from the selected
// scopes: the workspace row and/or each pod's row. A scope that does not
// define the name is a no-op success (idempotent removal). The resource's
// delete emits the per-row sandbox_env_var.deleted event. Sequential for the
// same reasons as the other bulk helpers.
export async function deleteSandboxEnvVarForScopes(
  auth: Authenticator,
  {
    name,
    includeWorkspace,
    podIds,
    context,
  }: {
    name: string;
    includeWorkspace: boolean;
    podIds: string[];
    context?: AuditLogContext;
  }
): Promise<ScopeMutationResult[]> {
  const results: ScopeMutationResult[] = [];

  if (includeWorkspace) {
    const envVar = await SandboxEnvVarResource.fetchByName(
      auth,
      { kind: "workspace", workspace: auth.getNonNullableWorkspace() },
      name
    );
    if (!envVar) {
      results.push({ scopeId: SANDBOX_WORKSPACE_SCOPE_ID, success: true });
    } else {
      const deleted = await envVar.delete(auth, { context });
      results.push(
        deleted.isErr()
          ? {
              scopeId: SANDBOX_WORKSPACE_SCOPE_ID,
              success: false,
              errorMessage: deleted.error.message,
            }
          : { scopeId: SANDBOX_WORKSPACE_SCOPE_ID, success: true }
      );
    }
  }

  const spaces = await SpaceResource.fetchByIds(auth, podIds);
  const spacesById = new Map(spaces.map((space) => [space.sId, space]));

  for (const podId of podIds) {
    const pod = spacesById.get(podId);
    if (!pod || !pod.isProject()) {
      results.push({
        scopeId: podId,
        success: false,
        errorMessage: "Pod not found.",
      });
      continue;
    }

    const envVar = await SandboxEnvVarResource.fetchByName(
      auth,
      { kind: "pod", pod },
      name
    );
    if (!envVar) {
      results.push({ scopeId: podId, success: true });
      continue;
    }

    const deleted = await envVar.delete(auth, { context });
    results.push(
      deleted.isErr()
        ? {
            scopeId: podId,
            success: false,
            errorMessage: deleted.error.message,
          }
        : { scopeId: podId, success: true }
    );
  }

  return results;
}
