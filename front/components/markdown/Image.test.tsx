import { ConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FilePreviewProvider } from "@app/components/assistant/conversation/FilePreviewContext";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { act, render, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getImgPlugin } from "./Image";

const mockOwner = LightWorkspaceFactory.build({ sId: "w_test_ws" });

const mockClientFetch = vi.fn();
vi.mock("@app/lib/egress/client", () => ({
  clientFetch: (...args: unknown[]) => mockClientFetch(...args),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Img", () => {
  it("shows a path image as loading until the image itself loads", async () => {
    const preloads: HTMLImageElement[] = [];
    vi.stubGlobal("Image", function TrackedImage() {
      const image = document.createElement("img");
      preloads.push(image);
      return image;
    });
    mockClientFetch.mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { "Content-Type": "image/png" },
      })
    );
    const ImagePlugin = getImgPlugin(mockOwner);

    const { container } = render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <FetcherProvider fetcher={vi.fn()} fetcherWithBody={vi.fn()}>
          <ConversationSidePanelContext.Provider
            value={{
              currentPanel: undefined,
              hasConversation: true,
              isPanelClosing: false,
              removeFromPanelHistory: vi.fn(),
              openPanel: vi.fn(),
              togglePanel: vi.fn(),
              closePanel: vi.fn(),
              onPanelClosed: vi.fn(),
              setPanelRef: vi.fn(),
              panelRef: { current: null },
              layoutBeforeFullScreenRef: { current: null },
              setVirtuosoMsg: vi.fn(),
              virtuosoMsg: null,
              data: undefined,
            }}
          >
            <FilePreviewProvider owner={mockOwner}>
              <ImagePlugin src="pod-p1/charts/revenue.png" alt="Revenue" />
            </FilePreviewProvider>
          </ConversationSidePanelContext.Provider>
        </FetcherProvider>
      </SWRConfig>
    );

    await waitFor(() => expect(mockClientFetch).toHaveBeenCalled());
    await waitFor(() =>
      expect(preloads.some((image) => image.src.includes("revenue.png"))).toBe(
        true
      )
    );
    expect(container.querySelector("img")).toBeNull();

    act(() => {
      for (const image of preloads) {
        image.dispatchEvent(new Event("load"));
      }
    });

    await waitFor(() =>
      expect(container.querySelector("img")?.src).toContain("revenue.png")
    );
  });
});
