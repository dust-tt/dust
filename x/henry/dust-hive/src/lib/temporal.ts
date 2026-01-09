import { getEnvSlug } from "./environment";

// Search attribute definitions for Temporal namespaces
// These must be registered before workflows can use them
export const SEARCH_ATTRIBUTES = {
  conversationId: "Text",
  workspaceId: "Text",
  connectorId: "Int",
} as const;

export type SearchAttributeName = keyof typeof SEARCH_ATTRIBUTES;

export const TEMPORAL_NAMESPACE_CONFIG = [
  {
    suffix: "",
    envVar: "TEMPORAL_NAMESPACE",
    searchAttributes: ["conversationId", "workspaceId"] satisfies SearchAttributeName[],
  },
  {
    suffix: "-agent",
    envVar: "TEMPORAL_AGENT_NAMESPACE",
    searchAttributes: ["conversationId", "workspaceId"] satisfies SearchAttributeName[],
  },
  {
    suffix: "-connectors",
    envVar: "TEMPORAL_CONNECTORS_NAMESPACE",
    searchAttributes: ["connectorId"] satisfies SearchAttributeName[],
  },
  {
    suffix: "-relocation",
    envVar: "TEMPORAL_RELOCATION_NAMESPACE",
    searchAttributes: [] satisfies SearchAttributeName[],
  },
] as const;

export function getTemporalNamespaces(envName: string): string[] {
  const slug = getEnvSlug(envName);
  return TEMPORAL_NAMESPACE_CONFIG.map((config) => `dust-hive-${slug}${config.suffix}`);
}

export function getTemporalEnvExports(envName: string): string {
  const slug = getEnvSlug(envName);
  return TEMPORAL_NAMESPACE_CONFIG.map(
    (config) => `export ${config.envVar}=dust-hive-${slug}${config.suffix}`
  ).join("\n");
}
