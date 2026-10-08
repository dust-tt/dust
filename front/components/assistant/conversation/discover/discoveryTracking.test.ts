import {
  trackHomepageUseCaseClick,
  trackHomepageUseCaseView,
} from "@app/components/assistant/conversation/discover/discoveryTracking";
import { trackEvent } from "@app/lib/tracking";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/tracking")>();
  return { ...actual, trackEvent: vi.fn() };
});

const trackEventMock = vi.mocked(trackEvent);

beforeEach(() => {
  trackEventMock.mockClear();
});

describe("discoveryTracking", () => {
  it("names the homepage use case on click and view", () => {
    trackHomepageUseCaseView({ useCaseId: "meeting-prep" });
    trackHomepageUseCaseClick({ useCaseId: "meeting-prep" });

    expect(trackEventMock).toHaveBeenNthCalledWith(1, {
      area: "discover",
      object: "homepage_use_case",
      action: "view",
      extra: { use_case_id: "meeting-prep" },
    });
    expect(trackEventMock).toHaveBeenNthCalledWith(2, {
      area: "discover",
      object: "homepage_use_case",
      action: "click",
      extra: { use_case_id: "meeting-prep" },
    });
  });
});
