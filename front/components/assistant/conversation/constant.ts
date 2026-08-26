import type { ConversationSidePanelType } from "@app/types/conversation_side_panel";
import { INTERACTIVE_CONTENT_SIDE_PANEL_TYPE } from "@app/types/conversation_side_panel";

export const DEFAULT_RIGHT_PANEL_SIZE = 40;
export const DEFAULT_FRAME_PANEL_SIZE = (2 / 3) * 100;

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
