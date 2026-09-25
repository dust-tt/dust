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
import type { ScopeMutationResult } from "@app/types/api/sandbox/egress_policy";
import { SANDBOX_WORKSPACE_SCOPE_ID } from "@app/types/api/sandbox/egress_policy";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

// Pod selection for the central Computer admin page's multi-pod reads.
// "all-pods" resolves server-side to every configured Pod.
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
// name — the only Pods the central Computer admin page surfaces. Intersects
// the configured policy files (GCS) with the project-space listing (DB).
// Admin-only via the parent route gate.
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

// One egress-domain add/remove applied across the workspace policy and/or a
// set of pod policies for the central Computer admin page. scopeId is
// "workspace" for the workspace scope or a pod sId.
export type BulkEgressOperation =
  | { operation: "add"; domain: string }
  | { operation: "remove"; domain: string };

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

// Applies one egress-domain add/remove to each selected scope, reusing the
// per-scope helpers and audit event the single-scope routes use. Sequential;
// the route schema caps podIds at 100.
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
  // { policy, changed } outcome.
  async function applyWorkspace(): Promise<
    Result<{ policy: EgressPolicy; changed: boolean }, Error>
  > {
    switch (operation.operation) {
      case "add": {
        const r = await addWorkspacePolicyDomain(auth, { domain });
        if (r.isErr()) {
          return r;
        }
        return new Ok({
          policy: r.value.policy,
          changed: r.value.addedDomain !== null,
        });
      }
      case "remove": {
        const r = await removeWorkspacePolicyDomain(auth, { domain });
        if (r.isErr()) {
          return r;
        }
        return new Ok({
          policy: r.value.policy,
          changed: r.value.removedDomain !== null,
        });
      }
      default:
        return assertNever(operation);
    }
  }

  async function applyPod(
    ownerId: string
  ): Promise<Result<{ policy: EgressPolicy; changed: boolean }, Error>> {
    switch (operation.operation) {
      case "add": {
        const r = await addOwnerPolicyDomain(auth, { ownerId, domain });
        if (r.isErr()) {
          return r;
        }
        return new Ok({
          policy: r.value.policy,
          changed: r.value.addedDomain !== null,
        });
      }
      case "remove": {
        const r = await removeOwnerPolicyDomain(auth, { ownerId, domain });
        if (r.isErr()) {
          return r;
        }
        return new Ok({
          policy: r.value.policy,
          changed: r.value.removedDomain !== null,
        });
      }
      default:
        return assertNever(operation);
    }
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

  // A workspace add already covers every Pod, so writing to the selected Pods
  // is redundant. Remove still targets each Pod below (a Pod can hold its own
  // copy a workspace remove would not clear).
  if (operation.operation === "add" && includeWorkspace) {
    return results;
  }

  // Validate against the same live, non-archived project Pods the read path
  // surfaces, so an archived Pod's id can't be used to mutate its policy.
  const livePods = await listNonArchivedProjectSpacesAsAdmin(auth);
  if (livePods.isErr()) {
    // Admin-gated by the route; a failure here is a should-never-happen.
    throw livePods.error;
  }
  const livePodIds = new Set(livePods.value.map((pod) => pod.sId));

  for (const podId of podIds) {
    if (!livePodIds.has(podId)) {
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
