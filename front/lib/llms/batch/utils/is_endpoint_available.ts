import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
import type { Where, WorkspaceFilter } from "@app/lib/llms/types/filter";
import { matchesWhere } from "@app/lib/llms/utils/matches_where";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export function isEndpointAvailable(
  endpointConstructor: DustBatchEndpointConstructor,
  workspaceConfiguration: {
    featureFlags: WhitelistableFeature[];
    enterprise: boolean;
  },
  inputCondition: Where<WorkspaceFilter>
) {
  // Availability is decided by matching a `where` condition from both sides:
  //
  // - The input condition (`inputCondition`): the filter the caller wants to retrieve, evaluated
  //   against the endpoint's own properties. It expresses what the call site is looking for — e.g.
  //   a workspace-level constraint, whitelisting some provider ids, or simply the code base
  //   requiring a specific modelId.
  //
  // - The endpoint condition (`endpoint.constructor.endpointFilter`): the filter the endpoint
  //   declares about which workspaces it is available to, evaluated against the workspace
  //   configuration we receive. This side is fixed by the endpoint and is not tweakable at runtime.
  //
  // The endpoint is available only when both conditions match.
  return (
    matchesWhere(endpointConstructor, inputCondition) &&
    matchesWhere(workspaceConfiguration, endpointConstructor.endpointFilter)
  );
}
