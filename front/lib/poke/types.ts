export const STATIC_KILL_SWITCH_TYPES = [
  "save_agent_configurations",
  "save_data_source_views",
  "global_disable_firecrawl",
  "pause_upsert_queue",
  "use_legacy_acls",
  // TODO(provider_outage): clean those deprecated flags
  "global_dust_agents_fallback",
  "global_blacklist_anthropic",
  "global_blacklist_openai",
] as const;
export type StaticKillSwitchType = (typeof STATIC_KILL_SWITCH_TYPES)[number];

export const MODEL_KILL_SWITCH_PREFIX = "global_blacklist_model:";

export type ModelKillSwitchType = `${typeof MODEL_KILL_SWITCH_PREFIX}${string}`;

export type KillSwitchType = StaticKillSwitchType | ModelKillSwitchType;

export function modelKillSwitchType(modelId: string): ModelKillSwitchType {
  return `${MODEL_KILL_SWITCH_PREFIX}${modelId}`;
}

export function modelIdFromKillSwitchType(type: string): string | null {
  if (!type.startsWith(MODEL_KILL_SWITCH_PREFIX)) {
    return null;
  }

  const modelId = type.slice(MODEL_KILL_SWITCH_PREFIX.length);

  return modelId.length > 0 ? modelId : null;
}

export function killedModelIdsFromKillSwitches(
  killSwitches: KillSwitchType[]
): string[] {
  return killSwitches
    .map(modelIdFromKillSwitchType)
    .filter((modelId): modelId is string => modelId !== null);
}

export function isStaticKillSwitchType(
  type: string
): type is StaticKillSwitchType {
  return STATIC_KILL_SWITCH_TYPES.includes(type as StaticKillSwitchType);
}

export function isKillSwitchType(type: string): type is KillSwitchType {
  return (
    isStaticKillSwitchType(type) || modelIdFromKillSwitchType(type) !== null
  );
}
