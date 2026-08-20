import { listNonArchivedProjectSpacesAsAdmin } from "@app/lib/api/projects/list";
import { listPodSIdsWithEgressPolicy } from "@app/lib/api/sandbox/egress_policy";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
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

// The live, non-archived Pods that have their own egress policy — the only
// Pods the central Computer admin page surfaces. Reads scale with configured
// Pods (a prefix list of policy files) rather than the total Pod count, so
// "select all" stays cheap. Admin-only via the parent route gate.
export async function listPodsWithEgressPolicy(
  auth: Authenticator
): Promise<SpaceResource[]> {
  const [livePods, configuredSIds] = await Promise.all([
    listNonArchivedProjectSpacesAsAdmin(auth),
    listPodSIdsWithEgressPolicy(auth),
  ]);
  if (livePods.isErr()) {
    // Unreachable behind ensureIsAdmin(); throwing surfaces a plumbing bug as
    // a 500 rather than silently returning no Pods.
    throw livePods.error;
  }

  const configured = new Set(configuredSIds);
  return livePods.value.filter((pod) => configured.has(pod.sId));
}
