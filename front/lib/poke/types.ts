export const KILL_SWITCH_TYPES = [
  "save_agent_configurations",
  "save_data_source_views",
  "global_blacklist_anthropic",
  "global_blacklist_openai",
  "global_disable_firecrawl",
] as const;
export type KillSwitchType = (typeof KILL_SWITCH_TYPES)[number];
export function isKillSwitchType(type: string): type is KillSwitchType {
  return KILL_SWITCH_TYPES.includes(type as KillSwitchType);
}
