import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import type { FeedbackSelectorBaseProps } from "@app/components/assistant/conversation/FeedbackSelector";
import type { UiView } from "@app/components/assistant/conversation/types";
import { makeInitialMessageStreamState } from "@app/components/assistant/conversation/types";
import { useAutoOpenSidePanel } from "@app/components/assistant/conversation/useAutoOpenSidePanel";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { LightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { frameContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import type { UserType } from "@app/types/user";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({ vizUrl: null }),
  useFeatureFlags: () => ({ hasFeature: () => false }),
}));

vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => vi.fn(),
}));

vi.mock("@app/hooks/conversations", () => ({
  useBranchConversation: () => ({
    branchConversation: vi.fn(),
    isBranching: false,
  }),
  useCancelMessage: () => vi.fn(),
  usePostOnboardingFollowUp: () => ({ postFollowUp: vi.fn() }),
}));

vi.mock("@app/lib/swr/assistants", () => ({
  useUnifiedAgentConfigurations: () => ({ agentConfigurations: [] }),
}));

vi.mock("@app/hooks/conversations/useConversationAttachments", () => ({
  useConversationAttachments: () => ({
    mutateConversationAttachments: vi.fn(),
  }),
}));

vi.mock("@app/hooks/conversations/useConversationSandboxStatus", () => ({
  useConversationSandboxStatus: () => ({ mutateSandboxStatus: vi.fn() }),
}));

vi.mock("@app/hooks/conversations/useConversationSandboxFiles", () => ({
  useConversationSandboxFiles: () => ({ mutateSandboxFiles: vi.fn() }),
}));

vi.mock("@app/hooks/useAgentMessageStream", () => ({
  useAgentMessageStream: () => ({ shouldStream: false, streamError: null }),
}));

vi.mock(
  "@app/components/assistant/conversation/BlockedActionsProvider",
  () => ({
    useBlockedActionsContext: () => ({
      enqueueBlockedAction: vi.fn(),
      removeAllBlockedActionsForMessage: vi.fn(),
      getFirstBlockedActionForMessage: () => undefined,
    }),
  })
);

vi.mock(
  "@app/components/assistant/conversation/GenerationContextProvider",
  () => ({
    useGenerationContext: () => ({
      addGeneratingMessage: vi.fn(),
      removeGeneratingMessage: vi.fn(),
      getConversationGeneratingMessages: () => [],
    }),
  })
);

vi.mock("@app/components/assistant/conversation/useAutoOpenSidePanel", () => ({
  useAutoOpenSidePanel: vi.fn(() => ({ interactiveFiles: [] })),
}));

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/components/assistant/conversation/ConversationSidePanelContext")
      >();
    return {
      ...actual,
      useConversationSidePanelContext: () => ({
        togglePanel: vi.fn(),
        openPanel: vi.fn(),
        currentPanel: null,
      }),
    };
  }
);

vi.mock("@app/components/sparkle/ThemeContext", () => ({
  useTheme: () => ({ theme: "light", isDark: false, setTheme: vi.fn() }),
}));

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    push: vi.fn(),
    pathname: "/w/test-workspace/assistant/conv_1",
    query: {},
    asPath: "/w/test-workspace/assistant/conv_1",
  }),
  LinkWrapper: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@virtuoso.dev/message-list", () => ({
  useVirtuosoMethods: () => ({
    data: { map: vi.fn(), batch: vi.fn(), get: () => [] },
  }),
}));

vi.mock(
  "@app/components/assistant/conversation/attachment/AttachmentCitation",
  () => ({
    AttachmentCitation: ({
      attachmentCitation,
    }: {
      attachmentCitation: { title: string };
    }) => (
      <div data-testid="bottom-attachment-citation">
        {attachmentCitation.title}
      </div>
    ),
  })
);

const mockOwner = LightWorkspaceFactory.build({ sId: "test-workspace" });

const mockUser: UserType = {
  sId: "user_1",
  id: 1,
  createdAt: 0,
  provider: "google",
  username: "tester",
  email: "tester@example.com",
  firstName: "Test",
  lastName: "User",
  fullName: "Test User",
  image: null,
  lastLoginAt: null,
};

function buildAgentMessage(
  overrides: Partial<LightAgentMessageWithActionsType> = {}
) {
  const base: LightAgentMessageWithActionsType = {
    type: "agent_message",
    sId: "am_1",
    version: 0,
    rank: 1,
    branchId: null,
    created: 1700000000000,
    completedTs: 1700000001000,
    parentMessageId: "um_1",
    parentAgentMessageId: null,
    status: "succeeded",
    content: "Here is the answer :cite[abc].",
    chainOfThought: null,
    error: null,
    visibility: "visible",
    richMentions: [],
    completionDurationMs: 1000,
    reactions: [],
    costCredits: null,
    configuration: {
      sId: "agent_1",
      name: "TestAgent",
      pictureUrl: "https://example.com/avatar.png",
      status: "active",
      canRead: true,
    },
    citations: {
      abc: {
        title: "Example Source",
        provider: "notion",
        href: "https://example.com/doc",
        contentType: "text/plain",
      },
    },
    generatedFiles: [],
    activitySteps: [],
    resolvedModel: null,
    modelResolutionMethod: null,
    actions: [],
    ...overrides,
  };
  return makeInitialMessageStreamState(base);
}

const messageFeedback: FeedbackSelectorBaseProps = {
  feedback: null,
  onSubmitThumb: async () => {},
  isSubmittingThumb: false,
};

function renderAgentMessage({
  uiView,
  agentMessageOverrides,
}: {
  uiView: UiView;
  agentMessageOverrides?: Partial<LightAgentMessageWithActionsType>;
}) {
  return render(
    <AgentMessage
      conversationId="conv_1"
      spaceId={null}
      uiView={uiView}
      hideHeader={false}
      isLastMessage={false}
      agentMessage={buildAgentMessage(agentMessageOverrides)}
      messageFeedback={messageFeedback}
      owner={mockOwner}
      user={mockUser}
      triggeringUser={null}
      isOnboardingConversation={false}
      handleSubmit={async () => new Ok(undefined)}
      isAutoScrollEnabledRef={{ current: true } as { current: boolean }}
      lastUserScrollAtRef={{ current: null }}
    />
  );
}

describe("AgentMessage compact UI view", () => {
  afterEach(() => {
    vi.mocked(useAutoOpenSidePanel).mockReturnValue({ interactiveFiles: [] });
  });

  describe("frames", () => {
    const frameFile = {
      title: "My Frame",
      contentType: frameContentType,
      fileId: "fil_frame_1",
      filePath: undefined,
    };

    it("renders frames collapsed by default for compact UI conversations", () => {
      vi.mocked(useAutoOpenSidePanel).mockReturnValue({
        interactiveFiles: [frameFile],
      });

      renderAgentMessage({ uiView: "compact" });

      expect(screen.getByRole("button", { name: "Frames" })).toBeVisible();
      expect(screen.getByText("My Frame")).not.toBeVisible();
    });

    it("expands frames on click for compact UI conversations", () => {
      vi.mocked(useAutoOpenSidePanel).mockReturnValue({
        interactiveFiles: [frameFile],
      });

      renderAgentMessage({ uiView: "compact" });

      fireEvent.click(screen.getByRole("button", { name: "Frames" }));

      expect(screen.getByText("My Frame")).toBeVisible();
    });

    it("renders frames expanded for non-compact UI conversations", () => {
      vi.mocked(useAutoOpenSidePanel).mockReturnValue({
        interactiveFiles: [frameFile],
      });

      renderAgentMessage({ uiView: "standard" });

      expect(
        screen.queryByRole("button", { name: "Frames" })
      ).not.toBeInTheDocument();
      expect(screen.getByText("My Frame")).toBeVisible();
    });
  });

  describe("bottom citations", () => {
    it("hides the bottom citation list for compact UI conversations but keeps inline citations", () => {
      const { container } = renderAgentMessage({
        uiView: "compact",
      });

      expect(
        screen.queryByTestId("bottom-attachment-citation")
      ).not.toBeInTheDocument();
      expect(
        container.querySelector('a[href="https://example.com/doc"]')
      ).toHaveTextContent("1");
    });

    it("keeps the bottom citation list for non-compact UI conversations", () => {
      const { container } = renderAgentMessage({
        uiView: "standard",
      });

      expect(
        screen.getByTestId("bottom-attachment-citation")
      ).toHaveTextContent("Example Source");
      expect(
        container.querySelector('a[href="https://example.com/doc"]')
      ).toHaveTextContent("1");
    });

    it("renders no bottom citation container for an compact UI conversation with no citations", () => {
      const { container } = renderAgentMessage({
        uiView: "compact",
        agentMessageOverrides: { content: "No sources here.", citations: {} },
      });

      expect(
        screen.queryByTestId("bottom-attachment-citation")
      ).not.toBeInTheDocument();
      expect(container.querySelectorAll('[class*="min-w-60"]').length).toBe(0);
    });
  });

  describe("bottom generated file cards", () => {
    const generatedFilesOverrides: Partial<LightAgentMessageWithActionsType> = {
      generatedFiles: [
        {
          title: "AGENTS.md",
          contentType: "text/markdown",
          fileId: null,
          filePath: "pod-123/AGENTS.md",
        },
        {
          title: "session_plan.md",
          contentType: "text/markdown",
          fileId: null,
          filePath: "pod-123/session_plan.md",
        },
      ],
    };

    it("hides the bottom generated file cards for compact UI conversations", () => {
      renderAgentMessage({
        uiView: "compact",
        agentMessageOverrides: generatedFilesOverrides,
      });

      expect(screen.queryByText("AGENTS.md")).not.toBeInTheDocument();
      expect(screen.queryByText("session_plan.md")).not.toBeInTheDocument();
    });

    it("keeps the bottom generated file cards for non-compact UI conversations", () => {
      renderAgentMessage({
        uiView: "standard",
        agentMessageOverrides: generatedFilesOverrides,
      });

      expect(screen.getByText("AGENTS.md")).toBeInTheDocument();
      expect(screen.getByText("session_plan.md")).toBeInTheDocument();
    });
  });
});
