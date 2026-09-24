import { FrameRenderer } from "@app/components/assistant/conversation/interactive_content/FrameRenderer";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { EditTextFn } from "@app/types/assistant/visualization";
import type { LightWorkspaceType } from "@app/types/user";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  editFrameText: vi.fn(),
  iframe: vi.fn((_props: { onEditText?: EditTextFn }) => null),
  hasFrameFunctions: false,
  isFrameAuthor: true,
  mutateFileContent: vi.fn(),
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
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  () => ({
    useConversationSidePanelContext: () => ({
      closePanel: vi.fn(),
      panelRef: null,
    }),
  })
);

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelHeader",
  async () => {
    const { createElement } =
      await vi.importActual<typeof import("react")>("react");
    return {
      ConversationSidePanelHeader: ({ children }: { children?: ReactNode }) =>
        createElement("div", null, children),
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
vi.mock("@app/components/navigation/DesktopNavigationContext", () => ({
  useDesktopNavigation: () => ({
    isNavigationBarOpen: true,
    setIsNavigationBarOpen: vi.fn(),
  }),
}));
vi.mock("@app/hooks/conversations", () => ({
  useVisualizationRevert: () => ({ handleVisualizationRevert: vi.fn() }),
}));
vi.mock("@app/hooks/useHashParams", () => ({
  useHashParam: () => [undefined, vi.fn()],
}));
vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => vi.fn(),
}));
vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ vizUrl: "https://viz.dust.tt" }),
  useFeatureFlags: () => ({ hasFeature: () => false }),
}));
vi.mock("@app/lib/context/clientType", () => ({
  useClientType: () => "web",
}));
vi.mock("@app/lib/swr/files", () => ({
  useFileContent: () => ({
    fileContent: "export default function Frame() {}",
    error: null,
    isFileContentLoading: false,
    mutateFileContent: mocks.mutateFileContent,
  }),
  useFileContentByUrl: () => ({
    fileContent: "export default function FrameV2() {}",
    isNotFound: false,
    isFileContentLoading: false,
    fileContentError: null,
  }),
  useFileMetadata: () => ({
    fileMetadata: {
      fileName: "manifest.json",
      useCaseMetadata: {},
      version: 1,
    },
    mutateFileMetadata: vi.fn(),
  }),
  useShareInteractiveContentFile: () => ({
    fileShare: { shareUrl: "https://dust.tt/share/frame/share-token" },
  }),
}));
vi.mock("@app/lib/swr/frames", () => ({
  useEditFrameText: () => mocks.editFrameText,
  useFramePermissions: () => ({
    isFrameAuthor: mocks.isFrameAuthor,
    packageRoot: null,
    hasFrameFunctions: mocks.hasFrameFunctions,
    isFramePermissionsLoading: false,
    isFramePermissionsError: null,
  }),
}));
vi.mock("@app/lib/swr/pods", () => ({
  usePodFiles: () => ({ files: [] }),
}));
vi.mock("@app/lib/swr/spaces", () => ({
  useSpaceInfo: () => ({ spaceInfo: null, isSpaceInfoLoading: false }),
}));
vi.mock("@app/lib/swr/useIsMobile", () => ({
  useIsMobile: () => false,
}));

const owner: LightWorkspaceType = {
  id: 1,
  sId: "workspace_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

const conversation: ConversationWithoutContentType = {
  id: 1,
  sId: "conversation_1",
  title: "Conversation",
  depth: 0,
  actionRequired: false,
  created: 1,
  hasError: false,
  isRunningAgentLoop: false,
  isParticipant: true,
  lastReadMs: null,
  metadata: {},
  requestedSpaceIds: [],
  spaceId: null,
  triggerId: null,
  unread: false,
  updated: 1,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.hasFrameFunctions = false;
  mocks.isFrameAuthor = true;
});

describe("FrameRenderer", () => {
  it("shows the Frame v2 source when switching to code", async () => {
    const { container } = render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="v2"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch to Code" }));

    await waitFor(() => {
      expect(container).toHaveTextContent(
        "export default function FrameV2() {}"
      );
    });
    expect(
      screen.getByRole("button", { name: "Switch to Rendering" })
    ).toBeInTheDocument();
  });

  it("enables inline editing for a Frame v2 author", () => {
    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="v2"
      />
    );

    expect(mocks.iframe).toHaveBeenCalledWith(
      expect.objectContaining({
        frameId: "frame_1",
        isEditable: true,
        onEditText: expect.any(Function),
      })
    );
  });

  it("keeps Frame v2 read-only when the viewer cannot edit its source", () => {
    mocks.isFrameAuthor = false;

    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="v2"
      />
    );

    expect(mocks.iframe).toHaveBeenCalledWith(
      expect.objectContaining({
        frameId: "frame_1",
        isEditable: false,
        onEditText: undefined,
      })
    );
  });

  it("marks a Frame declaring functions as beta", () => {
    mocks.hasFrameFunctions = true;

    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="v2"
      />
    );

    const betaLink = screen.getByRole("link", { name: "Beta" });
    expect(betaLink).toHaveAttribute(
      "href",
      "https://app.dust.tt/share/frame/c5d83f0e-4825-4c6f-b33a-6841b1490d19"
    );
    expect(betaLink).toHaveAttribute("target", "_blank");
  });

  it("does not mark a Frame without functions as beta", () => {
    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="v2"
      />
    );

    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("opens the frame's share URL in a new tab", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        contentHash="frame_1@42"
        renderMode="v2"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open in a new tab" }));

    expect(open).toHaveBeenCalledWith(
      "https://dust.tt/share/frame/share-token",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("remounts the viz iframe when contentHash changes", () => {
    const { rerender } = render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        contentHash="frame_1@42"
        renderMode="v2"
      />
    );

    expect(mocks.iframe.mock.calls.at(-1)?.[0].visualization.identifier).toBe(
      "viz-frame_1@42"
    );

    rerender(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        contentHash="frame_1@99"
        renderMode="v2"
      />
    );

    expect(mocks.iframe.mock.calls.at(-1)?.[0].visualization.identifier).toBe(
      "viz-frame_1@99"
    );
  });

  it("keeps a successful edit successful when the content refresh fails", async () => {
    mocks.editFrameText.mockResolvedValue({ success: true });
    mocks.mutateFileContent.mockRejectedValue(new Error("refresh failed"));

    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="v2"
      />
    );

    const onEditText = mocks.iframe.mock.calls.at(-1)?.[0].onEditText;
    if (!onEditText) {
      throw new Error("Expected Frame v2 to be editable.");
    }

    await act(async () => {
      await expect(
        onEditText({
          newText: "Done",
          oldText: "Ready",
          source: "index.tsx:1:42",
        })
      ).resolves.toEqual({ success: true });
    });
  });
});
