import { getEffectiveWhiteListedProviders } from "@app/lib/api/assistant/models";
import { getWorkspaceFilter, legacyModelIdToModel } from "@app/lib/api/llm";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getBatchEndpoints } from "@app/lib/llms/batch";
import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
import { getStreamEndpoints } from "@app/lib/llms/stream";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import type {
  EndpointConfig,
  Where,
  WorkspaceConfig,
} from "@app/lib/llms/types/filter";
import { REGION_MAPPING } from "@app/lib/llms/types/region_mapping";
import { sortEndpointsByPreferredRegion } from "@app/lib/llms/utils/sort_endpoints";
import type { Region } from "@app/lib/model_constructors/types/regions";
import {
  isCreditPricedPlanPrefix,
  isEnterpriseOrDust,
} from "@app/lib/plans/plan_codes";
import type { ModelIdType } from "@app/types/assistant/models/types";

// Selects the endpoint best matching the current region for the workspace,
// shared by the stream and batch resolvers. The only thing that varies between
// the two surfaces is which registry of endpoints we filter over (`getEndpoints`)
// and the extra `filter` (e.g. `{ model: { eq: model } }`).
export async function selectPreferredEndpointForWorkspace<
  T extends { region: Region },
>(
  auth: Authenticator,
  getEndpoints: (
    workspaceConfiguration: WorkspaceConfig,
    inputCondition: Where<EndpointConfig>
  ) => T[],
  filter: Where<EndpointConfig>
): Promise<T | null> {
  const plan = auth.getNonNullablePlan();
  const featureFlags = await getFeatureFlags(auth);
  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);

  const endpoints = getEndpoints(
    {
      featureFlags,
      isEnterprise: isEnterpriseOrDust(plan),
      isCreditPriced: isCreditPricedPlanPrefix(plan.code),
    },
    {
      and: [getWorkspaceFilter(auth, whiteListedProviders), filter],
    }
  );

  const preferredRegion = REGION_MAPPING[multiRegionsConfig.getCurrentRegion()];

  return sortEndpointsByPreferredRegion(endpoints, preferredRegion)[0] ?? null;
}

export async function selectPreferredStreamEndpointForWorkspace(
  auth: Authenticator,
  filter: Where<EndpointConfig>
) {
  const streamEndpoint =
    await selectPreferredEndpointForWorkspace<DustStreamEndpointConstructor>(
      auth,
      getStreamEndpoints,
      filter
    );

  return streamEndpoint;
}

export async function selectPreferredBatchEndpointForWorkspace(
  auth: Authenticator,
  filter: Where<EndpointConfig>
) {
  const batchEndpoint =
    await selectPreferredEndpointForWorkspace<DustBatchEndpointConstructor>(
      auth,
      getBatchEndpoints,
      filter
    );

  return batchEndpoint;
}

// Resolves a legacy model id to its preferred stream endpoint for the
// workspace, or null if the model id is unknown or no endpoint is available.
export async function getStreamEndpointFromLegacyModelId(
  auth: Authenticator,
  modelId: ModelIdType
) {
  const model = legacyModelIdToModel(modelId);
  if (!model) {
    return null;
  }

  const endpoint = await selectPreferredStreamEndpointForWorkspace(auth, {
    model: { eq: model },
  });

  return endpoint;
}

// Resolves a legacy model id to its preferred batch endpoint for the
// workspace, or null if the model id is unknown or no endpoint is available.
export async function getBatchEndpointFromLegacyModelId(
  auth: Authenticator,
  modelId: ModelIdType
) {
  const model = legacyModelIdToModel(modelId);
  if (!model) {
    return null;
  }

  const endpoint = await selectPreferredBatchEndpointForWorkspace(auth, {
    model: { eq: model },
  });

  return endpoint;
}
