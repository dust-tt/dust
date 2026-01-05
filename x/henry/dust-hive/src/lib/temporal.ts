export const TEMPORAL_NAMESPACE_CONFIG = [
  { suffix: "", envVar: "TEMPORAL_NAMESPACE" },
  { suffix: "-agent", envVar: "TEMPORAL_AGENT_NAMESPACE" },
  { suffix: "-connectors", envVar: "TEMPORAL_CONNECTORS_NAMESPACE" },
  { suffix: "-relocation", envVar: "TEMPORAL_RELOCATION_NAMESPACE" },
] as const;

export function getTemporalNamespaces(envName: string): string[] {
  return TEMPORAL_NAMESPACE_CONFIG.map((config) => `dust-hive-${envName}${config.suffix}`);
}

export function getTemporalEnvExports(envName: string): string {
  return TEMPORAL_NAMESPACE_CONFIG.map(
    (config) => `export ${config.envVar}=dust-hive-${envName}${config.suffix}`
  ).join("\n");
}
