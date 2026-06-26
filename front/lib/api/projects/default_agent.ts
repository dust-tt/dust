import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

// Resolves the agent a conversation started in this pod should kick off with
// when the caller didn't pick one explicitly: the pod's configured default
// agent, else @dust.
export async function resolvePodDefaultAgentId(
  auth: Authenticator,
  space: SpaceResource
): Promise<string> {
  const featureFlags = await getFeatureFlags(auth);
  if (!featureFlags.includes("pod_default_agent")) {
    return GLOBAL_AGENTS_SID.DUST;
  }

  const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
  const candidateId = metadata?.defaultAgentId ?? null;
  if (!candidateId || candidateId === GLOBAL_AGENTS_SID.DUST) {
    return GLOBAL_AGENTS_SID.DUST;
  }

  const agent = await getAgentConfiguration(auth, {
    agentId: candidateId,
    variant: "extra_light",
  });
  if (!agent || agent.status !== "active") {
    return GLOBAL_AGENTS_SID.DUST;
  }
  return candidateId;
}
