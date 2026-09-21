import type { Where, WorkspaceConfig } from "@app/lib/llms/types/filter";

/**
 * @cc [owner:pmilliotte,label:product] eu-agent-platform-endpoints-share-one-filter
 * Every `*_eu_agent_platform` endpoint — Dust-managed regional hosting, whatever
 * the lab — declares exactly this filter and nothing else. The client mirrors it
 * in `useRunsOnRegionalHosting` to decide whether to show a workspace its
 * hosting region, so an endpoint opting out of it silently makes that indicator
 * lie. Provider-hosted EU endpoints (`*_eu_openai_responses`, `*_eu_mistral`)
 * are a different path and are not covered here.
 */
export const EU_AGENT_PLATFORM_ENDPOINT_FILTER = {
  or: [
    { featureFlags: { contains: "use_vertex_for_supported_models" as const } },
    { isCreditPriced: { eq: true } },
  ],
} as const satisfies Where<WorkspaceConfig>;
