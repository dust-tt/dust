import { PublicInteractiveContentContainer } from "@app/components/assistant/conversation/interactive_content/PublicInteractiveContentContainer";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

interface Mocks {
  frameMetadata: {
    contentType: string;
    fileName: string;
    sId: string;
  };
  rendererProps: { fileId: string; frameId?: string } | null;
}

const mocks = vi.hoisted<Mocks>(() => ({
  frameMetadata: {
    contentType: "application/vnd.dust.frame.v2+json",
    fileName: "app.frame.json",
    sId: "fil_frame",
  },
  rendererProps: null,
}));

vi.mock(
  "@app/components/assistant/conversation/interactive_content/PublicFrameRenderer",
  () => ({
    PublicFrameRenderer: (props: { fileId: string; frameId?: string }) => {
      mocks.rendererProps = props;
      return "public-frame-renderer";
    },
  })
);

vi.mock("@app/lib/swr/frames", () => ({
  usePublicFrame: () => ({
    error: null,
    frameMetadata: mocks.frameMetadata,
    isFrameLoading: false,
  }),
}));

afterEach(() => {
  cleanup();
  mocks.frameMetadata = {
    contentType: frameV2ContentType,
    fileName: "app.frame.json",
    sId: "fil_frame",
  };
  mocks.rendererProps = null;
});

describe("PublicInteractiveContentContainer", () => {
  it("passes the stable identity only for Frames v2", () => {
    const props = {
      shareToken: "share-token",
      title: "App",
      workspaceId: "w_current",
      vizUrl: "https://viz.dust.tt",
    };
    const { rerender } = render(
      createElement(PublicInteractiveContentContainer, props)
    );

    expect(mocks.rendererProps).toMatchObject({
      fileId: "fil_frame",
      frameId: "fil_frame",
    });

    mocks.frameMetadata = {
      contentType: frameContentType,
      fileName: "legacy.tsx",
      sId: "fil_legacy",
    };
    rerender(createElement(PublicInteractiveContentContainer, props));

    expect(mocks.rendererProps).toEqual(
      expect.objectContaining({ fileId: "fil_legacy" })
    );
    expect(mocks.rendererProps?.frameId).toBeUndefined();
  });
});
