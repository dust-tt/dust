import {
  CommandIcon,
  FolderTableIcon,
  GithubIcon,
  ImageIcon,
  RobotIcon,
  RocketIcon,
} from "@dust-tt/sparkle";

export const MCP_SERVER_ICONS: Record<AllowedIconType, React.ComponentType> = {
  command: CommandIcon,
  github: GithubIcon,
  image: ImageIcon,
  robot: RobotIcon,
  rocket: RocketIcon,
  table: FolderTableIcon,
} as const;

export const DEFAULT_MCP_SERVER_ICON = "rocket" as const;

export const ALLOWED_ICONS = [
  "command",
  "github",
  "image",
  "robot",
  "rocket",
  "table",
] as const;
export type AllowedIconType = (typeof ALLOWED_ICONS)[number];

export const isAllowedIconType = (icon: string): icon is AllowedIconType =>
  ALLOWED_ICONS.includes(icon as AllowedIconType);
