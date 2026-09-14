import {
  DEFAULT_FRAME_PANEL_SIZE,
  DEFAULT_RIGHT_PANEL_SIZE,
  getDefaultRightPanelSize,
} from "@app/components/assistant/conversation/constant";
import {
  AGENT_ACTIONS_SIDE_PANEL_TYPE,
  INTERACTIVE_CONTENT_SIDE_PANEL_TYPE,
} from "@app/types/conversation_side_panel";
import { describe, expect, it } from "vitest";

describe("getDefaultRightPanelSize", () => {
  it("opens Frames at two-thirds width", () => {
    expect(DEFAULT_FRAME_PANEL_SIZE).toBeCloseTo((2 / 3) * 100);
    expect(getDefaultRightPanelSize(INTERACTIVE_CONTENT_SIDE_PANEL_TYPE)).toBe(
      DEFAULT_FRAME_PANEL_SIZE
    );
  });

  it("keeps other side panels at their existing width", () => {
    expect(getDefaultRightPanelSize(AGENT_ACTIONS_SIDE_PANEL_TYPE)).toBe(
      DEFAULT_RIGHT_PANEL_SIZE
    );
  });
});
