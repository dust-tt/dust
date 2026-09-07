import { PodFrameSheet } from "@app/components/pod/files/PodFrameSheet";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { cleanup, render } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

interface Mocks {
  iframeProps: { frameId?: string } | null;
  metadataCalls: { disabled?: boolean; fileId: string | null }[];
}

const mocks = vi.hoisted<Mocks>(() => ({
  iframeProps: null,
  metadataCalls: [],
}));

vi.mock(
  "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe",
  async () => {
    const { forwardRef } = await import("react");
    return {
      AuthenticatedVisualizationActionIframe: forwardRef<
        HTMLIFrameElement,
        { frameId?: string }
      >(function AuthenticatedVisualizationActionIframe(props, _ref) {
        mocks.iframeProps = props;
        return "frame-iframe";
      }),
    };
  }
);

vi.mock(
  "@app/components/assistant/conversation/interactive_content/ExportContentDropdown",
  () => ({ ExportContentDropdown: () => null })
);

vi.mock(
  "@app/components/assistant/conversation/interactive_content/frame/ShareFrameSheet",
  () => ({ ShareFrameSheet: () => null })
);

vi.mock("@app/components/pod/files/PinPodBannerButton", () => ({
  PinPodBannerButton: () => null,
}));

vi.mock("@app/components/pod/files/PodFileTabButton", () => ({
  PodFileTabButton: () => null,
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ vizUrl: "https://viz.dust.tt" }),
  useFeatureFlags: () => ({ hasFeature: () => false }),
}));

vi.mock("@app/lib/swr/files", () => ({
  useFileContent: () => ({ fileContent: "frame bundle" }),
  useFileMetadata: (args: { disabled?: boolean; fileId: string | null }) => {
    mocks.metadataCalls.push(args);
    return {
      fileMetadata: {
        contentType: "application/vnd.dust.frame.v2+json",
        fileName: "app.frame.json",
        useCaseMetadata: { spaceId: "vlt_project" },
      },
      isFileMetadataError: null,
      isFileMetadataLoading: false,
    };
  },
}));

vi.mock("@dust-tt/sparkle", async () => {
  const { createElement } = await import("react");
  const Container = ({ children }: PropsWithChildren) =>
    createElement("div", null, children);
  const Sheet = ({ children, open }: PropsWithChildren<{ open?: boolean }>) =>
    open ? createElement("div", null, children) : null;
  const Empty = () => null;

  return {
    Button: Empty,
    Maximize01: Empty,
    Minimize01: Empty,
    Sheet,
    SheetClose: Container,
    SheetContent: Container,
    SheetHeader: Container,
    SheetTitle: Container,
    Spinner: Empty,
    XClose: Empty,
    cn: (...classes: Array<string | false | null | undefined>) =>
      classes.filter(Boolean).join(" "),
  };
});

const owner = LightWorkspaceFactory.build();

afterEach(() => {
  cleanup();
  mocks.iframeProps = null;
  mocks.metadataCalls = [];
});

describe("PodFrameSheet", () => {
  it("loads metadata only while open and forwards the Frames v2 identity", () => {
    const props = {
      fileId: "fil_frame",
      fileName: "app.frame.json",
      framePath: "pod-vlt_project/App/app.frame.json",
      fileTabs: [],
      isArchived: false,
      isEditor: true,
      isMember: true,
      isOpen: false,
      onClose: vi.fn(),
      owner,
      pinnedFramePath: null,
      podId: "vlt_project",
    };
    const { rerender } = render(createElement(PodFrameSheet, props));

    expect(mocks.metadataCalls.at(-1)).toMatchObject({ disabled: true });
    expect(mocks.iframeProps).toBeNull();

    rerender(createElement(PodFrameSheet, { ...props, isOpen: true }));

    expect(mocks.metadataCalls.at(-1)).toMatchObject({ disabled: false });
    expect(mocks.iframeProps?.frameId).toBe("fil_frame");
  });
});
