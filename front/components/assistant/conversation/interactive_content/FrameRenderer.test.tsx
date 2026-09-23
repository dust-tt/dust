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
  batchEditFrameText: vi.fn(),
  confirm: vi.fn(),
  editFrameText: vi.fn(),
  iframe: vi.fn(
    (_props: {
      frameId?: string;
      isEditable?: boolean;
      onEditText?: EditTextFn;
      visualization?: { identifier: string };
    }) => null
  ),
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
vi.mock("@app/components/Confirm", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    ConfirmContext: React.createContext(mocks.confirm),
  };
});

vi.mock("@app/lib/swr/frames", () => ({
  useBatchEditFrameText: () => mocks.batchEditFrameText,
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

  it("keeps Frame v2 read-only until the author enters edit mode", () => {
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
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("tab", { name: "Edit" })).toBeInTheDocument();
  });

  it("enables inline editing after the author enters edit mode", () => {
    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="v2"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Edit" }));

    expect(mocks.iframe).toHaveBeenLastCalledWith(
      expect.objectContaining({
        frameId: "frame_1",
        isEditable: true,
        onEditText: expect.any(Function),
      })
    );
    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("hides the edit mode toggle when the viewer cannot edit the Frame source", () => {
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
    expect(screen.queryByRole("tab", { name: "Edit" })).not.toBeInTheDocument();
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

  it("remounts the iframe when switching between Preview and Edit", () => {
    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="v2"
      />
    );

    const previewIdentifier =
      mocks.iframe.mock.calls.at(-1)?.[0]?.visualization?.identifier;
    expect(previewIdentifier).toBe("viz-frame_1-0-preview");

    fireEvent.click(screen.getByRole("tab", { name: "Edit" }));

    const editIdentifier =
      mocks.iframe.mock.calls.at(-1)?.[0]?.visualization?.identifier;
    expect(editIdentifier).toBe("viz-frame_1-0-edit");
    expect(editIdentifier).not.toEqual(previewIdentifier);

    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));

    expect(mocks.iframe.mock.calls.at(-1)?.[0]?.visualization?.identifier).toBe(
      "viz-frame_1-0-preview"
    );
  });

  it("stages v2 edits without publishing until Save", async () => {
    mocks.batchEditFrameText.mockResolvedValue({ success: true });
    mocks.mutateFileContent.mockResolvedValue(
      "export default function Frame() { return <p>Done</p>; }"
    );

    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="v2"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Edit" }));

    const lastIframeProps = mocks.iframe.mock.calls.at(-1)?.[0];
    const identifierBefore = lastIframeProps?.visualization?.identifier;
    const onEditText = lastIframeProps?.onEditText;
    if (!onEditText) {
      throw new Error("Expected Frame v2 to be editable.");
    }

    await act(async () => {
      await onEditText({
        newText: "Done",
        oldText: "Ready",
        source: "index.tsx:1:42",
      });
      await onEditText({
        newText: "Two",
        oldText: "One",
        source: "index.tsx:2:1",
      });
    });

    expect(mocks.batchEditFrameText).not.toHaveBeenCalled();
    expect(mocks.editFrameText).not.toHaveBeenCalled();
    expect(mocks.iframe.mock.calls.at(-1)?.[0]?.visualization?.identifier).toBe(
      identifierBefore
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(saveButton);
    });

    await waitFor(() => {
      expect(mocks.batchEditFrameText).toHaveBeenCalledWith([
        {
          newText: "Done",
          oldText: "Ready",
          source: "index.tsx:1:42",
        },
        {
          newText: "Two",
          oldText: "One",
          source: "index.tsx:2:1",
        },
      ]);
    });

    await waitFor(() => {
      expect(
        mocks.iframe.mock.calls.at(-1)?.[0]?.visualization?.identifier
      ).toBe("viz-frame_1-1-edit");
    });
    expect(mocks.mutateFileContent).toHaveBeenCalled();
  });

  it("publishes legacy Frame edits immediately without a Save button", async () => {
    mocks.editFrameText.mockResolvedValue({ success: true });
    mocks.mutateFileContent.mockResolvedValue(
      "export default function Frame() { return <p>Done</p>; }"
    );

    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="legacy"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Edit" }));

    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();

    const onEditText = mocks.iframe.mock.calls.at(-1)?.[0].onEditText;
    if (!onEditText) {
      throw new Error("Expected legacy Frame to be editable.");
    }

    await act(async () => {
      await onEditText({
        newText: "Done",
        oldText: "Ready",
        source: "index.tsx:1:42",
      });
    });

    expect(mocks.editFrameText).toHaveBeenCalledWith({
      newText: "Done",
      oldText: "Ready",
      source: "index.tsx:1:42",
    });
    expect(mocks.batchEditFrameText).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        mocks.iframe.mock.calls.at(-1)?.[0]?.visualization?.identifier
      ).toBe("viz-frame_1-1-edit");
    });
  });

  it("asks to discard unsaved v2 edits when leaving Edit", async () => {
    mocks.confirm.mockResolvedValue(false);

    render(
      <FrameRenderer
        conversation={conversation}
        fileId="frame_1"
        projectId={null}
        owner={owner}
        renderMode="v2"
      />
    );

    fireEvent.click(screen.getByRole("tab", { name: "Edit" }));

    const onEditText = mocks.iframe.mock.calls.at(-1)?.[0].onEditText;
    if (!onEditText) {
      throw new Error("Expected Frame v2 to be editable.");
    }

    await act(async () => {
      await onEditText({
        newText: "Done",
        oldText: "Ready",
        source: "index.tsx:1:42",
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    });

    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        validateLabel: "Discard",
      })
    );
    // Cancel keeps Edit mode.
    expect(screen.getByRole("tab", { name: "Edit" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    mocks.confirm.mockResolvedValue(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    });

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
    });
    expect(mocks.batchEditFrameText).not.toHaveBeenCalled();
  });
});
