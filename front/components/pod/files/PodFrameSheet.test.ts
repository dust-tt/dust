import { PodFrameSheet } from "@app/components/pod/files/PodFrameSheet";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren, ReactNode } from "react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const frameV2Metadata = {
  contentType: "application/vnd.dust.frame.v2+json",
  fileName: "manifest.json",
  useCaseMetadata: { spaceId: "vlt_project" },
};

interface Mocks {
  canWriteFrameSource: boolean;
  contentCalls: Record<string, unknown>[];
  fileMetadata: Record<string, unknown>;
  hasFrameFunctions: boolean;
  iframeProps: {
    frameId?: string;
    functionTarget?: string;
    isEditable?: boolean;
    stagedEditMode?: string;
  } | null;
  metadataCalls: { disabled?: boolean; fileId: string | null }[];
  permissionsCalls: { disabled?: boolean; frameId: string }[];
}

const mocks = vi.hoisted<Mocks>(() => ({
  canWriteFrameSource: true,
  contentCalls: [],
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
        {
          frameId?: string;
          isEditable?: boolean;
          stagedEditMode?: string;
        }
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

vi.mock(
  "@app/components/assistant/conversation/interactive_content/frame/FrameEditControls",
  () => ({
    FrameEditControls: () => createElement("div", null, "edit-controls"),
  })
);

vi.mock("@app/components/pod/files/PinPodBannerButton", () => ({
  PinPodBannerButton: () => null,
}));

vi.mock("@app/components/pod/files/PodFileTabButton", () => ({
  PodFileTabButton: () => null,
}));

vi.mock(
  "@app/components/assistant/conversation/interactive_content/frame/useFrameEditSession",
  () => ({
    useFrameEditSession: () => ({
      contentRevision: 0,
      hasPendingEdits: false,
      isSaving: false,
      mode: "preview",
      remount: vi.fn(),
      save: vi.fn(),
      setMode: vi.fn(),
      stageEdit: vi.fn(),
    }),
  })
);

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ vizUrl: "https://viz.dust.tt" }),
  useFeatureFlags: () => ({ hasFeature: () => false }),
}));

vi.mock("@app/lib/swr/files", () => ({
  useFileContent: (args: Record<string, unknown>) => {
    mocks.contentCalls.push(args);
    return { fileContent: "frame bundle", mutateFileContent: vi.fn() };
  },
  useFileContentByUrl: () => ({
    fileContent: "export default function Frame() {}",
    isNotFound: false,
    isFileContentLoading: false,
    fileContentError: null,
  }),
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
    return {
      canWriteFrameSource: mocks.canWriteFrameSource,
      hasFrameFunctions: mocks.hasFrameFunctions,
      isFramePermissionsLoading: false,
      packageRoot: null,
    };
  },
}));

vi.mock("@app/lib/swr/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@dust-tt/sparkle", async () => {
  const { createElement } = await import("react");
  const Container = ({ children }: PropsWithChildren) =>
    createElement("div", null, children);
  const Sheet = ({ children, open }: PropsWithChildren<{ open?: boolean }>) =>
    open ? createElement("div", null, children) : null;
  const Empty = () => null;

  return {
    Button: ({
      children,
      "aria-label": ariaLabel,
      tooltip,
      onClick,
    }: {
      children?: ReactNode;
      "aria-label"?: string;
      tooltip?: string;
      onClick?: () => void;
    }) =>
      createElement(
        "button",
        { "aria-label": ariaLabel ?? tooltip, onClick },
        children
      ),
    Chip: ({ label }: { label?: string }) => createElement("div", null, label),
    CodeBlock: ({ children }: PropsWithChildren) =>
      createElement("pre", null, children),
    Eye: Empty,
    Maximize01: Empty,
    Minimize01: Empty,
    Sheet,
    SheetClose: Container,
    SheetContent: Container,
    SheetHeader: Container,
    SheetTitle: Container,
    Spinner: Empty,
    Terminal: Empty,
    Tooltip: ({ trigger }: { trigger: ReactNode }) =>
      createElement("div", null, trigger),
    XClose: Empty,
    cn: (...classes: Array<string | false | null | undefined>) =>
      classes.filter(Boolean).join(" "),
  };
});

const owner = LightWorkspaceFactory.build();

beforeEach(() => {
  mocks.fileMetadata = { ...frameV2Metadata };
  mocks.hasFrameFunctions = false;
  mocks.canWriteFrameSource = true;
});

afterEach(() => {
  cleanup();
  mocks.iframeProps = null;
  mocks.contentCalls = [];
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

  it("loads metadata only while open and forwards the Frames v2 identity and package root", () => {
    const props = { ...openSheetProps, isOpen: false };
    const { rerender } = render(createElement(PodFrameSheet, props));

    expect(mocks.metadataCalls.at(-1)).toMatchObject({ disabled: true });
    expect(mocks.iframeProps).toBeNull();

    rerender(createElement(PodFrameSheet, { ...props, isOpen: true }));

    expect(mocks.metadataCalls.at(-1)).toMatchObject({ disabled: false });
    expect(mocks.iframeProps).toMatchObject({
      frameId: "fil_frame",
      framePackageRoot: "pod-vlt_project/App",
      isEditable: true,
      stagedEditMode: "preview",
    });
  });

  it("shows edit controls for a source writer and hides them for other viewers", () => {
    const { rerender } = render(createElement(PodFrameSheet, openSheetProps));

    expect(screen.getByText("edit-controls")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch to code" })
    ).toBeInTheDocument();

    mocks.canWriteFrameSource = false;
    rerender(createElement(PodFrameSheet, openSheetProps));

    expect(screen.queryByText("edit-controls")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch to code" })
    ).not.toBeInTheDocument();
    expect(mocks.iframeProps).toMatchObject({
      isEditable: false,
    });
  });

  it("serves the live publication: no latest bundle, functions or function target", () => {
    render(createElement(PodFrameSheet, openSheetProps));

    expect(mocks.contentCalls.at(-1)).not.toHaveProperty("publication");
    expect(mocks.permissionsCalls.at(-1)).not.toHaveProperty("publication");
    expect(mocks.iframeProps).not.toHaveProperty("functionTarget");
  });
});
