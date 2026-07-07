import {
  SANDBOX_POLICY_MAX_DOMAINS,
  writePodSpacePolicy,
} from "@app/lib/api/sandbox/egress_policy";
import type { Authenticator } from "@app/lib/auth";
import { PodEgressPolicyResource } from "@app/lib/resources/pod_egress_policy_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import { normalizeEgressPolicyDomains } from "@app/types/sandbox/egress_policy";
import { Err, Ok, type Result } from "@app/types/shared/result";

// The admin record of truth for a Pod's egress allowlist is
// `PodEgressPolicyResource` (DB). The space policy file `pods/{spaceSId}.json`
// that the egress proxy reads is a render of it, rewritten on every admin
// change. Because the file is keyed by the pod's stable space sId (not the
// ephemeral sandbox providerId), it survives sandbox destroy/recreate cycles
// and nothing needs re-projecting at wake.

export async function getPodEgressDomains(
  auth: Authenticator,
  pod: SpaceResource
): Promise<string[]> {
  const policy = await PodEgressPolicyResource.fetchBySpace(auth, pod);
  return policy?.allowedDomains ?? [];
}

// Validates and normalizes the requested domains, persists them to the pod's
// policy record (record of truth), then renders them to the pod's space
// policy file. Returns the normalized policy.
//
// A failed render returns an error even though the DB row was updated: the
// proxy reads the file, so silently succeeding would leave enforcement stale
// with no signal. Retrying the request re-renders idempotently, and the next
// pod sandbox activation self-heals the file as well.
export async function setPodEgressDomains(
  auth: Authenticator,
  pod: SpaceResource,
  requestedDomains: string[]
): Promise<Result<EgressPolicy, Error>> {
  const normalizedDomains = normalizeEgressPolicyDomains(requestedDomains);
  if (normalizedDomains.isErr()) {
    return new Err(normalizedDomains.error);
  }

  if (normalizedDomains.value.length > SANDBOX_POLICY_MAX_DOMAINS) {
    return new Err(
      new Error(
        `Pod egress policy cannot exceed ${SANDBOX_POLICY_MAX_DOMAINS} domains.`
      )
    );
  }

  const domains = normalizedDomains.value;

  const policy = await PodEgressPolicyResource.fetchBySpace(auth, pod);
  if (policy) {
    await policy.updateAllowedDomains(domains);
  } else {
    await PodEgressPolicyResource.makeNew(auth, pod, {
      allowedDomains: domains,
    });
  }

  const writeResult = await writePodSpacePolicy(pod.sId, domains);
  if (writeResult.isErr()) {
    return new Err(
      new Error(
        `Saved, but failed to sync the policy to the egress proxy: ${writeResult.error.message}. Retry to re-sync.`
      )
    );
  }

  return new Ok({ allowedDomains: domains });
}

// Idempotent single-domain append for the manifest-declared-domain approve
// path: reads the current allowlist, normalizes the incoming domain, no-ops
// if already present, then delegates to setPodEgressDomains. Unlike the
// projection approach (pod policy stored in `sandboxes/{providerId}.json`),
// there is no shared-file collision with the `add_egress_domain` agent tool
// here: the pod policy lives in its own `pods/{spaceSId}.json` file.
export async function addPodEgressDomain(
  auth: Authenticator,
  pod: SpaceResource,
  domain: string
): Promise<Result<{ allowedDomains: string[] }, Error>> {
  const normalized = normalizeEgressPolicyDomains([domain]);
  if (normalized.isErr()) {
    return new Err(normalized.error);
  }

  if (normalized.value.length === 0) {
    return new Err(new Error(`Invalid domain: ${domain}`));
  }

  const current = await getPodEgressDomains(auth, pod);
  const normalizedDomain = normalized.value[0];

  if (current.includes(normalizedDomain)) {
    return new Ok({ allowedDomains: current });
  }

  return setPodEgressDomains(auth, pod, [...current, normalizedDomain]);
}

// Best-effort render of the pod's space policy file from the DB record.
// Called at pod sandbox creation as a self-heal: the file normally already
// exists (rewritten on every admin change), but this covers a lost bucket
// object or a workspace relocation, where the DB row moves with the
// workspace and the file must be re-rendered in the new region. Failing to
// render only falls back to the (stricter) workspace-level allowlist.
export async function ensurePodSpacePolicyFile(
  auth: Authenticator,
  pod: SpaceResource
): Promise<void> {
  const policy = await PodEgressPolicyResource.fetchBySpace(auth, pod);
  if (!policy || policy.allowedDomains.length === 0) {
    return;
  }

  const writeResult = await writePodSpacePolicy(pod.sId, policy.allowedDomains);
  if (writeResult.isErr()) {
    logger.warn(
      {
        err: writeResult.error,
        spaceId: pod.sId,
      },
      "Failed to render pod egress policy file at sandbox creation — DB record is authoritative and admins can re-sync by saving."
    );
  }
}
