export const SIDE_PANEL_HASH_PARAM = "spid";
export const SIDE_PANEL_TYPE_HASH_PARAM = "spt";
export const FULL_SCREEN_HASH_PARAM = "fullScreen";

export const AGENT_ACTIONS_SIDE_PANEL_TYPE = "actions";
export const INTERACTIVE_CONTENT_SIDE_PANEL_TYPE = "interactive_content";

const SIDE_PANEL_TYPES = [
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  INTERACTIVE_CONTENT_SIDE_PANEL_TYPE,
] as const;

export type ConversationSidePanelType =
  | (typeof SIDE_PANEL_TYPES)[number]
  | undefined;
