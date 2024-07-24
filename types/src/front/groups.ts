export const GROUP_TYPES = ["regular", "workspace", "system"] as const;
export type GroupType = (typeof GROUP_TYPES)[number];

export function isValidGroupType(value: unknown): value is GroupType {
  return GROUP_TYPES.includes(value as GroupType);
}
export function isSystemGroupType(value: GroupType): boolean {
  return value === "system";
}
