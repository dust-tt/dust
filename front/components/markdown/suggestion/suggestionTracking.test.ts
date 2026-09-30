import { useTrackSuggestionCardViews } from "@app/components/markdown/suggestion/suggestionTracking";
import { trackEvent } from "@app/lib/tracking";
import type { BatchSuggestionType } from "@app/types/suggestions/batch_suggestion";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/tracking")>();
  return { ...actual, trackEvent: vi.fn() };
});

const trackEventMock = vi.mocked(trackEvent);

function makeBatch(
  id: string,
  state: BatchSuggestionType["state"]
): BatchSuggestionType {
  return { id, state } as BatchSuggestionType;
}

beforeEach(() => {
  trackEventMock.mockClear();
});

describe("useTrackSuggestionCardViews", () => {
  it("tracks each pending batch once, however often it re-renders or changes state", () => {
    const { rerender } = renderHook(
      ({ batches }) => useTrackSuggestionCardViews(batches, { inPile: true }),
      {
        initialProps: {
          batches: [makeBatch("b1", "pending"), makeBatch("b2", "pending")],
        },
      }
    );
    rerender({
      batches: [makeBatch("b1", "approved"), makeBatch("b2", "pending")],
    });

    expect(trackEventMock).toHaveBeenCalledTimes(2);
    expect(trackEventMock).toHaveBeenNthCalledWith(1, {
      area: "conversation",
      object: "suggestion_card",
      action: "view",
      extra: { batch_id: "b1", in_pile: true },
    });
    expect(trackEventMock).toHaveBeenNthCalledWith(2, {
      area: "conversation",
      object: "suggestion_card",
      action: "view",
      extra: { batch_id: "b2", in_pile: true },
    });
  });

  it("never tracks a batch that was already reviewed when first seen", () => {
    const { rerender } = renderHook(
      ({ batches }) => useTrackSuggestionCardViews(batches, { inPile: false }),
      { initialProps: { batches: [] as BatchSuggestionType[] } }
    );
    rerender({ batches: [makeBatch("b1", "rejected")] });
    rerender({ batches: [makeBatch("b1", "rejected")] });

    expect(trackEventMock).not.toHaveBeenCalled();
  });
});
