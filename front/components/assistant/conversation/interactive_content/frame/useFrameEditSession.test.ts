// @vitest-environment jsdom

import {
  appendStagedEdit,
  flushEditables,
} from "@app/components/assistant/conversation/interactive_content/frame/useFrameEditSession";
import { afterEach, describe, expect, it, vi } from "vitest";

const source = "index.tsx:1:1";

describe("appendStagedEdit", () => {
  it("keeps sibling text nodes of one element as separate entries", () => {
    const edits = appendStagedEdit(
      [{ source, oldText: "Hello", newText: "Hi" }],
      { source, oldText: "world", newText: "there" }
    );

    expect(edits).toEqual([
      { source, oldText: "Hello", newText: "Hi" },
      { source, oldText: "world", newText: "there" },
    ]);
  });

  it("collapses a re-edit of the span just edited", () => {
    const edits = appendStagedEdit([{ source, oldText: "A", newText: "B" }], {
      source,
      oldText: "B",
      newText: "C",
    });

    expect(edits).toEqual([{ source, oldText: "A", newText: "C" }]);
  });

  it("drops the entry when a re-edit restores the original text", () => {
    expect(
      appendStagedEdit([{ source, oldText: "A", newText: "B" }], {
        source,
        oldText: "B",
        newText: "A",
      })
    ).toEqual([]);
  });
});

describe("flushEditables", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeIframe() {
    const contentWindow = { postMessage: vi.fn() };
    return {
      contentWindow,
      iframe: { contentWindow } as unknown as HTMLIFrameElement,
    };
  }

  it("resolves true once the viz confirms the flush", async () => {
    const { contentWindow, iframe } = fakeIframe();
    const flushed = flushEditables(iframe);

    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "FLUSH_EDITABLES_DONE" },
        source: contentWindow as unknown as Window,
      })
    );

    await expect(flushed).resolves.toBe(true);
    expect(contentWindow.postMessage).toHaveBeenCalledWith(
      { type: "FLUSH_EDITABLES" },
      "*"
    );
  });

  it("resolves false when the viz does not answer", async () => {
    vi.useFakeTimers();
    const { iframe } = fakeIframe();
    const flushed = flushEditables(iframe);

    await vi.advanceTimersByTimeAsync(2000);

    await expect(flushed).resolves.toBe(false);
  });

  it("ignores confirmations from other windows", async () => {
    vi.useFakeTimers();
    const { iframe } = fakeIframe();
    const flushed = flushEditables(iframe);

    window.dispatchEvent(
      new MessageEvent("message", { data: { type: "FLUSH_EDITABLES_DONE" } })
    );
    await vi.advanceTimersByTimeAsync(2000);

    await expect(flushed).resolves.toBe(false);
  });
});
