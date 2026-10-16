import { PodHoverFrameViewer } from "@app/components/pod/PodHoverFrameViewer";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canWriteFrameSource: true,
  iframe: vi.fn((_props: unknown) => null),
}));

vi.mock(
  "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe",
  async () => {
    const { forwardRef } =
      await vi.importActual<typeof import("react")>("react");
    return {
      AuthenticatedVisualizationActionIframe: forwardRef((props, _ref) => {
        mocks.iframe(props);
        return null;
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
    FrameEditControls: () => <div>edit-controls</div>,
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
vi.mock("@app/lib/swr/files", () => ({
  useFileContent: () => ({ mutateFileContent: vi.fn() }),
  useFileContentByUrl: () => ({
    fileContent: "source",
    isNotFound: false,
    isFileContentLoading: false,
    fileContentError: null,
  }),
}));
vi.mock("@app/lib/swr/frames", () => ({
  useFramePermissions: () => ({
    canWriteFrameSource: mocks.canWriteFrameSource,
    hasFrameFunctions: false,
    requiredTools: [],
    isLastPublisher: false,
    hasAuthorizedRequiredTools: true,
    isFramePermissionsLoading: false,
    packageRoot: null,
    mutateFramePermissions: vi.fn(),
  }),
}));
vi.mock("@app/lib/swr/useIsMobile", () => ({
  useIsMobile: () => false,
}));

const owner = LightWorkspaceFactory.build();

beforeEach(() => {
  mocks.canWriteFrameSource = true;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PodHoverFrameViewer", () => {
  it("shows edit controls for a source writer", () => {
    render(
      <PodHoverFrameViewer
        owner={owner}
        spaceId="vlt_project"
        fileId="fil_frame"
        fileContent="bundle"
        vizUrl="https://viz.dust.tt"
        identifier="viz-test"
        isPodEditor={true}
        isPodMember={true}
        frameId="fil_frame"
        framePath="pod-vlt_project/App/manifest.json"
        pinnedFramePath={null}
        fileTabs={[]}
      />
    );

    expect(screen.getByText("edit-controls")).toBeInTheDocument();
    expect(mocks.iframe).toHaveBeenCalledWith(
      expect.objectContaining({
        frameId: "fil_frame",
        isEditable: true,
        stagedEditMode: "preview",
      })
    );
  });

  it("hides edit and code for viewers without source write access", () => {
    mocks.canWriteFrameSource = false;

    render(
      <PodHoverFrameViewer
        owner={owner}
        spaceId="vlt_project"
        fileId="fil_frame"
        fileContent="bundle"
        vizUrl="https://viz.dust.tt"
        identifier="viz-test"
        isPodEditor={false}
        isPodMember={true}
        frameId="fil_frame"
        framePath="pod-vlt_project/App/manifest.json"
        pinnedFramePath={null}
        fileTabs={[]}
      />
    );

    expect(screen.queryByText("edit-controls")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch to code" })
    ).not.toBeInTheDocument();
    expect(mocks.iframe).toHaveBeenCalledWith(
      expect.objectContaining({
        isEditable: false,
      })
    );
  });

  it("renders banner-specific overlay leading actions", () => {
    render(
      <PodHoverFrameViewer
        owner={owner}
        spaceId="vlt_project"
        fileId="fil_frame"
        fileContent="bundle"
        vizUrl="https://viz.dust.tt"
        identifier="viz-test"
        isPodEditor={true}
        isPodMember={true}
        frameId="fil_frame"
        framePath="pod-vlt_project/App/manifest.json"
        pinnedFramePath={null}
        fileTabs={[]}
        overlayLeading={<button type="button">Hide banner</button>}
      />
    );

    expect(
      screen.getByRole("button", { name: "Hide banner" })
    ).toBeInTheDocument();
  });
});
