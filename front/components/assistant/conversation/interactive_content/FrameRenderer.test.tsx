import { FrameRenderer } from "@app/components/assistant/conversation/interactive_content/FrameRenderer";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { EditTextFn } from "@app/types/assistant/visualization";
import type { LightWorkspaceType } from "@app/types/user";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  editFrameText: vi.fn(),
  iframe: vi.fn((_props: { onEditText?: EditTextFn }) => null),
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
  "@app/components/assistant/conversation/interactive_content/frame/ShareFrameSheet",
  () => ({ ShareFrameSheet: () => null })
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
  useFileMetadata: () => ({
    fileMetadata: {
      fileName: "manifest.json",
      useCaseMetadata: {},
      version: 1,
    },
    mutateFileMetadata: vi.fn(),
  }),
}));
vi.mock("@app/lib/swr/frames", () => ({
  useEditFrameText: () => mocks.editFrameText,
  useFramePermissions: () => ({
    isFrameAuthor: mocks.isFrameAuthor,
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
  mocks.isFrameAuthor = true;
});

describe("FrameRenderer", () => {
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
