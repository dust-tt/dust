import { AgentMessage } from "@app/components/assistant/conversation/AgentMessage";
import type { FeedbackSelectorBaseProps } from "@app/components/assistant/conversation/FeedbackSelector";
import type { UiView } from "@app/components/assistant/conversation/types";
import { makeInitialMessageStreamState } from "@app/components/assistant/conversation/types";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import type { LightAgentMessageWithActionsType } from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import type { UserType } from "@app/types/user";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { useAutoOpenSidePanelMock, openPanelMock } = vi.hoisted(() => ({
  useAutoOpenSidePanelMock: vi.fn(() => ({
    interactiveFiles: [] as unknown[],
  })),
  openPanelMock: vi.fn(),
}));

vi.mock("@app/components/assistant/conversation/useAutoOpenSidePanel", () => ({
  useAutoOpenSidePanel: useAutoOpenSidePanelMock,
}));

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  () => ({
    useConversationSidePanelContext: () => ({
      togglePanel: vi.fn(),
      openPanel: openPanelMock,
      currentPanel: null,
    }),
  })
);

// Inline file-preview card (:preview_file{...} directive): stubbed so tests can assert
// whether FilePreviewBlock decided to render it, without depending on PreviewableCitation's
// own context wiring (ConversationSidePanelContext, FilePreviewContext, sparkle Tooltip).
vi.mock(
  "@app/components/assistant/conversation/attachment/PreviewableCitation",
  () => ({
    PreviewableCitation: ({ title }: { title: string }) => (
      <span data-testid="inline-file-preview">{title}</span>
    ),
  })
);

// Top-of-message Frame renderer: stubbed so tests can assert its presence/absence
// without depending on the real Citation/CitationGrid markup.
vi.mock(
  "@app/components/assistant/conversation/AgentMessageGeneratedFiles",
  () => ({
    AgentMessageInteractiveContentGeneratedFiles: ({
      files,
    }: {
      files: { fileId?: string | null; title: string }[];
    }) =>
      files.length > 0 ? (
        <div data-testid="top-frame-link">
          {files.map((file) => (
            <span key={file.fileId ?? file.title}>{file.title}</span>
          ))}
        </div>
      ) : null,
  })
);

// Bottom citation/source card: stubbed the same way as AttachmentCitation above, so we
// can assert the visible label, accessible name, icon, and click behavior in isolation.
vi.mock(
  "@app/components/assistant/conversation/attachment/FileCitationCard",
  () => ({
    FileCitationCard: ({
      title,
      tooltipLabel,
      icon: IconComponent,
      onClick,
    }: {
      title: string;
      tooltipLabel?: ReactNode;
      icon?: ComponentType | ReactNode;
      onClick?: () => void;
    }) => (
      <div
        data-testid="bottom-frame-citation"
        aria-label={typeof tooltipLabel === "string" ? tooltipLabel : undefined}
        onClick={onClick}
      >
        {typeof IconComponent === "function" ? (
          <IconComponent data-testid="frame-icon" />
        ) : null}
        {title}
      </div>
    ),
  })
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

function buildFrameFile(
  overrides: Partial<{ fileId: string; title: string }> = {}
) {
  return {
    title: overrides.title ?? "Quarterly Report",
    contentType: "application/vnd.dust.frame",
    fileId: overrides.fileId ?? "fil_frame_1",
    hidden: false,
  };
}

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
    />
  );
}

describe("AgentMessage compact UI view", () => {
  beforeEach(() => {
    useAutoOpenSidePanelMock.mockReturnValue({ interactiveFiles: [] });
    openPanelMock.mockClear();
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

  describe("Frame link relocation", () => {
    it("renders one Frame card at the bottom (not the top) for a compact UI message with one Frame", () => {
      const frameFile = buildFrameFile();
      useAutoOpenSidePanelMock.mockReturnValue({
        interactiveFiles: [frameFile],
      });

      renderAgentMessage({ uiView: "compact" });

      expect(screen.queryByTestId("top-frame-link")).not.toBeInTheDocument();

      const cards = screen.getAllByTestId("bottom-frame-citation");
      expect(cards).toHaveLength(1);

      const [card] = cards;
      expect(card).toHaveTextContent(frameFile.title);
      expect(card).toHaveAttribute("aria-label", frameFile.title);
      expect(within(card).getByTestId("frame-icon")).toBeInTheDocument();

      fireEvent.click(card);
      expect(openPanelMock).toHaveBeenCalledWith({
        type: "interactive_content",
        fileId: frameFile.fileId,
      });
    });

    it("renders one bottom Frame card per Frame for a compact UI message with multiple Frames", () => {
      const frameFiles = [
        buildFrameFile({ fileId: "fil_frame_1", title: "First Frame" }),
        buildFrameFile({ fileId: "fil_frame_2", title: "Second Frame" }),
      ];
      useAutoOpenSidePanelMock.mockReturnValue({
        interactiveFiles: frameFiles,
      });

      renderAgentMessage({ uiView: "compact" });

      expect(screen.queryByTestId("top-frame-link")).not.toBeInTheDocument();
      expect(screen.getAllByTestId("bottom-frame-citation")).toHaveLength(2);
    });

    it("renders no Frame container for a compact UI message without a Frame", () => {
      useAutoOpenSidePanelMock.mockReturnValue({ interactiveFiles: [] });

      renderAgentMessage({ uiView: "compact" });

      expect(screen.queryByTestId("top-frame-link")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("bottom-frame-citation")
      ).not.toBeInTheDocument();
    });

    it("keeps the Frame link at the top for non-compact UI messages", () => {
      const frameFile = buildFrameFile();
      useAutoOpenSidePanelMock.mockReturnValue({
        interactiveFiles: [frameFile],
      });

      renderAgentMessage({ uiView: "standard" });

      expect(screen.getByTestId("top-frame-link")).toHaveTextContent(
        frameFile.title
      );
      expect(
        screen.queryByTestId("bottom-frame-citation")
      ).not.toBeInTheDocument();
    });

    it("suppresses the inline Frame preview directive for compact UI messages", () => {
      renderAgentMessage({
        uiView: "compact",
        agentMessageOverrides: {
          content:
            'Here is your frame: :preview_file{path="conv_1/frame.html" title="Quarterly Report" contentType="application/vnd.dust.frame"}',
          citations: {},
        },
      });

      expect(screen.queryByText("Quarterly Report")).not.toBeInTheDocument();
    });

    it("keeps the inline Frame preview directive for non-compact UI messages", () => {
      renderAgentMessage({
        uiView: "standard",
        agentMessageOverrides: {
          content:
            'Here is your frame: :preview_file{path="conv_1/frame.html" title="Quarterly Report" contentType="application/vnd.dust.frame"}',
          citations: {},
        },
      });

      expect(screen.getByText("Quarterly Report")).toBeInTheDocument();
    });

    it("keeps non-Frame inline file previews for compact UI messages", () => {
      renderAgentMessage({
        uiView: "compact",
        agentMessageOverrides: {
          content:
            'See the report: :preview_file{path="conv_1/report.pdf" title="Report.pdf" contentType="application/pdf"}',
          citations: {},
        },
      });

      expect(screen.getByText("Report.pdf")).toBeInTheDocument();
    });
  });

  describe("thinking step", () => {
    const thinkingContent =
      "Because the user asked about pricing, I should check the plan tiers first.";
    const thinkingStepOverrides: Partial<LightAgentMessageWithActionsType> = {
      activitySteps: [
        { type: "thinking", content: thinkingContent, id: "step_1" },
      ],
    };

    it("collapses the thinking step to a bare label for compact UI conversations", () => {
      renderAgentMessage({
        uiView: "compact",
        agentMessageOverrides: thinkingStepOverrides,
      });

      expect(screen.getByText("Thinking…")).toBeInTheDocument();
      expect(screen.queryByText(thinkingContent)).not.toBeInTheDocument();
    });

    it("shows the thinking step content directly for non-compact UI conversations", () => {
      renderAgentMessage({
        uiView: "standard",
        agentMessageOverrides: thinkingStepOverrides,
      });

      expect(screen.getByText(thinkingContent)).toBeInTheDocument();
      expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    });

    it("expands the compact thinking step on click to reveal its content", () => {
      renderAgentMessage({
        uiView: "compact",
        agentMessageOverrides: thinkingStepOverrides,
      });

      fireEvent.click(screen.getByText("Thinking…"));

      expect(screen.getByText(thinkingContent)).toBeInTheDocument();
      expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    });
  });
});
