export const SIDE_PANEL_HASH_PARAM = "spid";
export const SIDE_PANEL_TYPE_HASH_PARAM = "spt";

export const CONTENT_CREATION_SIDE_PANEL_TYPE = "content_creation";
export const AGENT_ACTIONS_SIDE_PANEL_TYPE = "actions";

const SIDE_PANEL_TYPES = [
  CONTENT_CREATION_SIDE_PANEL_TYPE,
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
] as const;

export type ConversationSidePanelType =
  | (typeof SIDE_PANEL_TYPES)[number]
  | undefined;
