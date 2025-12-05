const KILL_SWITCH_TYPES = [
  "save_agent_configurations",
  "save_data_source_views",
] as const;
export type KillSwitchType = (typeof KILL_SWITCH_TYPES)[number];
export function isKillSwitchType(type: string): type is KillSwitchType {
  return KILL_SWITCH_TYPES.includes(type as KillSwitchType);
}
