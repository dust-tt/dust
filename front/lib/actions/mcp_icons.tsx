import {
  CommandIcon,
  FolderTableIcon,
  GithubIcon,
  RocketIcon,
} from "@dust-tt/sparkle";

export const MCP_SERVER_ICONS: Record<AllowedIconType, React.ComponentType> = {
  command: CommandIcon,
  rocket: RocketIcon,
  table: FolderTableIcon,
  github: GithubIcon,
} as const;

export const DEFAULT_MCP_SERVER_ICON = "rocket" as const;

export const ALLOWED_ICONS = ["command", "rocket", "table", "github"] as const;
export type AllowedIconType = (typeof ALLOWED_ICONS)[number];

export const isAllowedIconType = (icon: string): icon is AllowedIconType =>
  ALLOWED_ICONS.includes(icon as AllowedIconType);
