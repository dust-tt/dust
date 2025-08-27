export const SIDE_PANEL_HASH_PARAM = "spid";
export const SIDE_PANEL_TYPE_HASH_PARAM = "spt";

export const CANVAS_SIDE_PANEL_TYPE = "canvas";
export const AGENT_ACTIONS_SIDE_PANEL_TYPE = "actions";

const SIDE_PANEL_TYPES = [
  CANVAS_SIDE_PANEL_TYPE,
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
] as const;

export type ConversationSidePanelType =
  | (typeof SIDE_PANEL_TYPES)[number]
  | undefined;
