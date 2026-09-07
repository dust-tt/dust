export const KILL_SWITCH_TYPES = [
  "save_agent_configurations",
  "save_data_source_views",
  "global_blacklist_anthropic",
  "global_blacklist_openai",
  "global_disable_firecrawl",
  "pause_upsert_queue",
  "use_legacy_acls",
] as const;
export type KillSwitchType = (typeof KILL_SWITCH_TYPES)[number];

// The provider-outage switches the degraded models section supersedes. They
// still work and the Kill page still offers them, marked as legacy so an
// operator reaches for the per-endpoint switches first.
export const LEGACY_KILL_SWITCH_TYPES = [
  "global_blacklist_anthropic",
  "global_blacklist_openai",
] as const satisfies readonly KillSwitchType[];

const LEGACY_KILL_SWITCH_TYPE_SET: ReadonlySet<KillSwitchType> = new Set(
  LEGACY_KILL_SWITCH_TYPES
);

export function isLegacyKillSwitchType(type: KillSwitchType): boolean {
  return LEGACY_KILL_SWITCH_TYPE_SET.has(type);
}

export function isKillSwitchType(type: string): type is KillSwitchType {
  return KILL_SWITCH_TYPES.includes(type as KillSwitchType);
}
