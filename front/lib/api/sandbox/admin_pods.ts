import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { listNonArchivedProjectSpacesAsAdmin } from "@app/lib/api/projects/list";
import {
  addOwnerPolicyDomain,
  addWorkspacePolicyDomain,
  listPodIdsWithEgressPolicy,
  removeOwnerPolicyDomain,
  removeWorkspacePolicyDomain,
} from "@app/lib/api/sandbox/egress_policy";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SANDBOX_WORKSPACE_SCOPE_ID } from "@app/types/api/sandbox/egress_policy";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

// Pod selection for the central Computer admin page's multi-pod reads.
// "all-pods" resolves server-side to every configured Pod so the client never
// has to expand the full Pod id list into a query string.
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

// The live, non-archived Pods that have their own egress policy, sorted by
// name — the only Pods the central Computer admin page surfaces. Reads scale
// with configured Pods (a prefix list of policy files) rather than the total
// Pod count, so "select all" stays cheap. Admin-only via the parent route gate.
export async function listPodsWithEgressPolicy(
  auth: Authenticator
): Promise<Result<SpaceResource[], Error>> {
  const [livePods, configuredPodIds] = await Promise.all([
    listNonArchivedProjectSpacesAsAdmin(auth),
    listPodIdsWithEgressPolicy(auth),
  ]);
  if (livePods.isErr()) {
    return livePods;
  }
  if (configuredPodIds.isErr()) {
    return configuredPodIds;
  }

  const configured = new Set(configuredPodIds.value);
  return new Ok(
    livePods.value
      .filter((pod) => configured.has(pod.sId))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
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
