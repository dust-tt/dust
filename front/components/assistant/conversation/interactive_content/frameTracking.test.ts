import {
  trackFrameExpand,
  trackFrameOpen,
} from "@app/components/assistant/conversation/interactive_content/frameTracking";
import { trackEvent } from "@app/lib/tracking";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/tracking")>();
  return { ...actual, trackEvent: vi.fn() };
});

beforeEach(() => {
  vi.mocked(trackEvent).mockClear();
});

describe("trackFrameOpen", () => {
  it("names the Frame, how it was opened and the conversation or Pod it was opened in", () => {
    trackFrameOpen({
      frameId: "fil_1",
      origin: { source: "auto", uiElement: "pod_pinned_banner" },
      location: { type: "pod", id: "vlt_1" },
    });

    expect(trackEvent).toHaveBeenCalledWith({
      area: "frames",
      object: "frame",
      action: "open",
      extra: {
        frame_id: "fil_1",
        source: "auto",
        ui_element: "pod_pinned_banner",
        location_resource_type: "pod",
        location_resource_id: "vlt_1",
      },
    });
  });

  it("has no location id on a public share", () => {
    trackFrameOpen({
      frameId: "fil_1",
      origin: { source: "user", uiElement: "shared_link" },
      location: { type: "public_share" },
      extra: { workspace_id: "w_1" },
    });

    expect(trackEvent).toHaveBeenCalledWith({
      area: "frames",
      object: "frame",
      action: "open",
      extra: {
        workspace_id: "w_1",
        frame_id: "fil_1",
        source: "user",
        ui_element: "shared_link",
        location_resource_type: "public_share",
      },
    });
  });

  it("names the Frame and where it was put in full screen", () => {
    trackFrameExpand({
      frameId: "fil_1",
      uiElement: "conversation_side_panel",
      location: { type: "conversation", id: "cnv_1" },
    });

    expect(trackEvent).toHaveBeenCalledWith({
      area: "frames",
      object: "frame",
      action: "expand",
      extra: {
        frame_id: "fil_1",
        ui_element: "conversation_side_panel",
        location_resource_type: "conversation",
        location_resource_id: "cnv_1",
      },
    });
  });
});
