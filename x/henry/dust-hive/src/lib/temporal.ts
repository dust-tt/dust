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
  return TEMPORAL_NAMESPACE_CONFIG.map((config) => `dust-hive-${envName}${config.suffix}`);
}

export function getTemporalEnvExports(envName: string): string {
  return TEMPORAL_NAMESPACE_CONFIG.map(
    (config) => `export ${config.envVar}=dust-hive-${envName}${config.suffix}`
  ).join("\n");
}
