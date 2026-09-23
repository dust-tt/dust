import type { Where, WorkspaceConfig } from "@app/lib/llms/types/filter";

/**
 * @cc [owner:pmilliotte,label:product] eu-agent-platform-endpoints-share-one-filter
 * Every `*_eu_agent_platform` endpoint — Dust-managed regional hosting, whatever
 * the lab — declares this filter as its hosting term. The client mirrors it in
 * `useRunsOnRegionalHosting` to decide whether to show a workspace its hosting
 * region, so an endpoint opting out of it silently makes that indicator lie. An
 * endpoint for a gated model `and`-composes this with the model's entitlement
 * filter rather than replacing it; the indicator stays truthful because it
 * answers "does this workspace get regional hosting", not "for which models".
 * Provider-hosted EU endpoints (`*_eu_openai_responses`, `*_eu_mistral`) are a
 * different path and are not covered here.
 */
export const EU_AGENT_PLATFORM_ENDPOINT_FILTER = {
  or: [
    { featureFlags: { contains: "use_vertex_for_supported_models" as const } },
    { isCreditPriced: { eq: true } },
  ],
} as const satisfies Where<WorkspaceConfig>;

/**
 * @cc [owner:pmilliotte,label:product] premium-model-filter-mirrors-availability
 * Endpoints for a premium model declare exactly this filter, and their model
 * config declares the matching `availableIfOneOf: { creditPricedPlan: true,
 * plansWithAdvancedModels: true }`, which `isModelAvailable` also grants on
 * the `premium_model_access` flag mirrored here. The two sides gate different
 * things — the config gates the picker via `isModelAvailable`, routing via
 * `isEndpointAvailable` — and they are consulted at different moments, so
 * drift does not degrade gracefully: model resolution picks on availability
 * and only then fails endpoint selection with `AgentLoopDataModelNotFoundError`
 * rather than falling back.
 */
export const PREMIUM_MODEL_ENDPOINT_FILTER = {
  or: [
    { isCreditPriced: { eq: true } },
    { isAdvancedModels: { eq: true } },
    { featureFlags: { contains: "premium_model_access" as const } },
  ],
} as const satisfies Where<WorkspaceConfig>;
