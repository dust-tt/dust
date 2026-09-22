import { PodFrameSheet } from "@app/components/pod/files/PodFrameSheet";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const frameV2Metadata = {
  contentType: "application/vnd.dust.frame.v2+json",
  fileName: "manifest.json",
  useCaseMetadata: { spaceId: "vlt_project" },
};

interface Mocks {
  fileMetadata: Record<string, unknown>;
  hasFrameFunctions: boolean;
  iframeProps: { frameId?: string } | null;
  metadataCalls: { disabled?: boolean; fileId: string | null }[];
  permissionsCalls: { disabled?: boolean; frameId: string }[];
}

const mocks = vi.hoisted<Mocks>(() => ({
  fileMetadata: {},
  hasFrameFunctions: false,
  iframeProps: null,
  metadataCalls: [],
  permissionsCalls: [],
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
  "@app/components/assistant/conversation/interactive_content/frame/ShareFramePopover",
  () => ({ ShareFramePopover: () => null })
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
      fileMetadata: mocks.fileMetadata,
      isFileMetadataError: null,
      isFileMetadataLoading: false,
    };
  },
}));

vi.mock("@app/lib/swr/frames", () => ({
  useFramePermissions: (args: { disabled?: boolean; frameId: string }) => {
    mocks.permissionsCalls.push(args);
    return { hasFrameFunctions: mocks.hasFrameFunctions };
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
    Chip: ({ label }: { label?: string }) => createElement("div", null, label),
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

beforeEach(() => {
  mocks.fileMetadata = { ...frameV2Metadata };
  mocks.hasFrameFunctions = false;
});

afterEach(() => {
  cleanup();
  mocks.iframeProps = null;
  mocks.metadataCalls = [];
  mocks.permissionsCalls = [];
});

const openSheetProps = {
  fileId: "fil_frame",
  fileName: "App",
  framePath: "pod-vlt_project/App/manifest.json",
  fileTabs: [],
  isArchived: false,
  isEditor: true,
  isMember: true,
  isOpen: true,
  onClose: vi.fn(),
  owner,
  pinnedFramePath: null,
  podId: "vlt_project",
};

describe("PodFrameSheet", () => {
  it("names a Frame v2 after the folder holding its manifest", () => {
    render(createElement(PodFrameSheet, openSheetProps));

    expect(screen.getByText("App")).toBeInTheDocument();
  });

  it("names a legacy Frame, which has no manifest, after its file", () => {
    mocks.fileMetadata = {
      contentType: "text/vnd.dust.attachment.slack.thread",
      fileName: "Legacy.tsx",
      useCaseMetadata: { spaceId: "vlt_project" },
    };

    render(
      createElement(PodFrameSheet, {
        ...openSheetProps,
        framePath: "pod-vlt_project/Legacy.tsx",
      })
    );

    expect(screen.getByText("Legacy.tsx")).toBeInTheDocument();
  });

  it("marks a Frame declaring functions as beta", () => {
    mocks.hasFrameFunctions = true;

    render(createElement(PodFrameSheet, openSheetProps));

    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("does not mark a Frame without functions as beta", () => {
    render(createElement(PodFrameSheet, openSheetProps));

    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("asks for Frame permissions only for an open Frames v2 sheet", () => {
    const { rerender } = render(
      createElement(PodFrameSheet, { ...openSheetProps, isOpen: false })
    );

    expect(mocks.permissionsCalls.at(-1)).toMatchObject({ disabled: true });

    rerender(createElement(PodFrameSheet, openSheetProps));

    expect(mocks.permissionsCalls.at(-1)).toMatchObject({
      disabled: false,
      frameId: "fil_frame",
    });

    mocks.fileMetadata = {
      contentType: "text/vnd.dust.attachment.slack.thread",
      fileName: "Legacy.tsx",
      useCaseMetadata: { spaceId: "vlt_project" },
    };
    rerender(
      createElement(PodFrameSheet, {
        ...openSheetProps,
        framePath: "pod-vlt_project/Legacy.tsx",
      })
    );

    expect(mocks.permissionsCalls.at(-1)).toMatchObject({ disabled: true });
  });

  it("loads metadata only while open and forwards the Frames v2 identity", () => {
    const props = { ...openSheetProps, isOpen: false };
    const { rerender } = render(createElement(PodFrameSheet, props));

    expect(mocks.metadataCalls.at(-1)).toMatchObject({ disabled: true });
    expect(mocks.iframeProps).toBeNull();

    rerender(createElement(PodFrameSheet, { ...props, isOpen: true }));

    expect(mocks.metadataCalls.at(-1)).toMatchObject({ disabled: false });
    expect(mocks.iframeProps?.frameId).toBe("fil_frame");
  });
});
