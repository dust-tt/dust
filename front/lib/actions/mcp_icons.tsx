import { CommandIcon, RocketIcon } from "@dust-tt/sparkle";

export const MCP_SERVER_ICONS: Record<AllowedIconType, React.ComponentType> = {
  command: CommandIcon,
  rocket: RocketIcon,
} as const;

export const DEFAULT_MCP_SERVER_ICON = "rocket" as const;

const ALLOWED_ICONS = ["command", "rocket"] as const;
export type AllowedIconType = (typeof ALLOWED_ICONS)[number];

export const isAllowedIconType = (icon: string): icon is AllowedIconType =>
  ALLOWED_ICONS.includes(icon as AllowedIconType);
