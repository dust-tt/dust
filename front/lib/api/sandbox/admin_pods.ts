import { listNonArchivedProjectSpacesAsAdmin } from "@app/lib/api/projects/list";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { PodSandboxEnvVarBulkResult } from "@app/types/api/sandbox/env_vars";
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
