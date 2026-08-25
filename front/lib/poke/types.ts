export const KILL_SWITCH_TYPES = [
  "save_agent_configurations",
  "save_data_source_views",
  "global_blacklist_anthropic",
  "global_blacklist_openai",
  "global_disable_firecrawl",
  "global_dust_agents_fallback",
  "pause_upsert_queue",
  "use_legacy_acls",
] as const;
export type KillSwitchType = (typeof KILL_SWITCH_TYPES)[number];

// The switches the Kill page still offers. The provider-outage ones
// (`global_blacklist_*`, `global_dust_agents_fallback`) are superseded by the
// degraded models section and are deliberately not rendered anymore.
export const TOGGLABLE_KILL_SWITCH_TYPES = [
  "save_agent_configurations",
  "save_data_source_views",
  "global_disable_firecrawl",
  "pause_upsert_queue",
  "use_legacy_acls",
] as const satisfies readonly KillSwitchType[];

export function isKillSwitchType(type: string): type is KillSwitchType {
  return KILL_SWITCH_TYPES.includes(type as KillSwitchType);
}
