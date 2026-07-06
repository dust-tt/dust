import {
  SANDBOX_POLICY_MAX_DOMAINS,
  writePodPolicy,
} from "@app/lib/api/sandbox/egress_policy";
import type { Authenticator } from "@app/lib/auth";
import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import type { EgressPolicy } from "@app/types/sandbox/egress_policy";
import { normalizeEgressPolicyDomains } from "@app/types/sandbox/egress_policy";
import { Err, Ok, type Result } from "@app/types/shared/result";

// The source of truth for a Pod's egress allowlist is
// `ProjectMetadata.podNetworkAllowedDomains` (DB). The GCS sandbox policy file
// is a projection of it: written lazily on the pod sandbox's next activation
// (see `PodSandboxAdapter`), and kept in sync eagerly on updates when a pod
// sandbox already exists.

export async function getPodEgressDomains(
  auth: Authenticator,
  pod: SpaceResource
): Promise<string[]> {
  const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  return metadata?.podNetworkAllowedDomains ?? [];
}

// Validates and normalizes the requested domains, persists them to the pod's
// metadata (source of truth), then projects them onto the pod sandbox's policy
// file if a sandbox currently exists. Returns the normalized policy.
//
// The GCS projection is best-effort: if it fails we log and still succeed,
// because the DB value is authoritative and the next sandbox activation
// re-syncs the file. When no sandbox exists yet there is nothing to sync (and
// nothing cached to invalidate) — the domains are written at first activation.
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

  // Upsert the pod metadata: the allowlist lives on the pod even before a
  // sandbox has ever been created.
  const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  if (metadata) {
    await metadata.updatePodNetworkAllowedDomains(domains);
  } else {
    await ProjectMetadataResource.makeNew(auth, pod, {
      podNetworkAllowedDomains: domains,
    });
  }

  // Project onto the sandbox policy file if a pod sandbox exists. A deleted
  // record has no live policy file (it is removed on destroy) and gets the
  // domains at next activation.
  const sandbox = await PodSandboxAdapter.fetchSandbox(auth, pod);
  if (sandbox && sandbox.status !== "deleted") {
    const writeResult = await writePodPolicy(sandbox.providerId, domains);
    if (writeResult.isErr()) {
      logger.warn(
        {
          err: writeResult.error,
          spaceId: pod.sId,
          sandboxProviderId: sandbox.providerId,
        },
        "Failed to sync pod egress policy to sandbox — DB value is authoritative and will re-sync at next activation."
      );
    }
  }

  return new Ok({ allowedDomains: domains });
}

// Idempotent single-domain append. Reads the current allowlist from the pod's
// metadata, normalizes the incoming domain, no-ops if already present, then
// delegates to setPodEgressDomains. Used by the Category G (manifest-declared
// domain) approve path so callers don't have to re-implement the
// read-normalize-merge-write sequence.
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
