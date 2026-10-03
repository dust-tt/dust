import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import { INTERACTIVE_CONTENT_SIDE_PANEL_TYPE } from "@app/types/conversation_side_panel";

export const DEFAULT_RIGHT_PANEL_SIZE = 40;
export const DEFAULT_FRAME_PANEL_SIZE = (2 / 3) * 100;
export const CONVERSATION_MIN_WIDTH_PX = 320;
// Below this width, docking a panel would squeeze the conversation under its minimum width, so
// the panel opens full screen as on mobile.
export const MIN_DOCKED_CONTAINER_WIDTH_PX = 2 * CONVERSATION_MIN_WIDTH_PX;

export function getDefaultRightPanelSize(
  panelType: ConversationSidePanelType
): number {
  switch (panelType) {
    case INTERACTIVE_CONTENT_SIDE_PANEL_TYPE:
      return DEFAULT_FRAME_PANEL_SIZE;
    default:
      return DEFAULT_RIGHT_PANEL_SIZE;
  }
}
