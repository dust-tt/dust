import type { OpenPanelParams } from "@app/components/assistant/conversation/side_panel_params";
import {
  panelDataKey,
  panelParamsFromHash,
} from "@app/components/assistant/conversation/side_panel_params";
import { describe, expect, it } from "vitest";

const PANELS: OpenPanelParams[] = [
  { type: "actions", messageId: "msg_1" },
  { type: "actions", messageId: "msg_1", actionId: "act_2" },
  { type: "interactive_content", fileId: "fil_1" },
  { type: "interactive_content", fileId: "fil_1", timestamp: "123" },
  { type: "file_preview", filePath: "conversation-abc/plan.md" },
  { type: "files" },
  { type: "credits" },
  { type: "plan" },
  { type: "skill", skillId: "skl_1" },
];

describe("panelDataKey / panelParamsFromHash", () => {
  it.each(PANELS)("round-trips %j through the hash", (params) => {
    const restored = panelParamsFromHash(params.type, panelDataKey(params));
    expect(restored).toEqual(params);
  });

  it("returns null without a type or data", () => {
    expect(panelParamsFromHash(undefined, "files")).toBeNull();
    expect(panelParamsFromHash("files", undefined)).toBeNull();
  });
});
