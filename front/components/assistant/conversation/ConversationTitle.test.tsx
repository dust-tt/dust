import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { UserType, WorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationTitle } from "./ConversationTitle";

const CURRENT_TITLE = "Current Conversation Title";
const PARENT_TITLE = "Parent Conversation Title";
const PARENT_CONVERSATION_ID = "conv_parent";

const mockState = vi.hoisted(() => ({
  activeConversationId: "conv_child" as string | null,
  conversation: null as ConversationWithoutContentType | null,
  handleMenuOpenChange: vi.fn(),
  handleRightClick: vi.fn(),
  isMobile: false,
  mutateConversations: vi.fn(),
  openPanel: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("@app/components/assistant/conversation/ConversationMenu", () => ({
  ConversationMenu: ({
    trigger,
  }: {
    trigger: (props: { isPendingAction: boolean }) => React.ReactNode;
  }) => <>{trigger({ isPendingAction: false })}</>,
  useConversationMenu: () => ({
    handleMenuOpenChange: mockState.handleMenuOpenChange,
    handleRightClick: mockState.handleRightClick,
    isMenuOpen: false,
    menuTriggerPosition: null,
  }),
}));

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  () => ({
    useConversationSidePanelContext: () => ({
      openPanel: mockState.openPanel,
    }),
  })
);

vi.mock(
  "@app/components/assistant/conversation/EditConversationTitleDialog",
  () => ({
    EditConversationTitleDialog: () => null,
  })
);

vi.mock("@app/hooks/conversations", () => ({
  useConversation: () => ({
    conversation: mockState.conversation,
  }),
  useConversations: () => ({
    mutateConversations: mockState.mutateConversations,
  }),
}));

vi.mock("@app/hooks/useActiveConversationId", () => ({
  useActiveConversationId: () => mockState.activeConversationId,
}));

vi.mock("@app/lib/auth/AuthContext", () => ({
  useAuth: () => ({
    user: makeUser(),
  }),
}));

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    push: mockState.routerPush,
  }),
}));

vi.mock("@app/lib/swr/spaces", () => ({
  useSpaceInfo: () => ({
    spaceInfo: null,
  }),
}));

vi.mock("@app/lib/swr/useIsMobile", () => ({
  useIsMobile: () => mockState.isMobile,
}));

const owner: WorkspaceType = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

function makeUser(): UserType {
  return {
    id: 1,
    sId: "user_1",
    createdAt: 1,
    provider: null,
    username: "philippe",
    email: "philippe@dust.tt",
    firstName: "Philippe",
    lastName: "Rolet",
    fullName: "Philippe Rolet",
    image: null,
    lastLoginAt: null,
  };
}

function makeConversation(): ConversationWithoutContentType {
  return {
    id: 1,
    sId: "conv_child",
    title: CURRENT_TITLE,
    created: 1,
    updated: 1,
    actionRequired: false,
    hasError: false,
    lastReadMs: null,
    metadata: {},
    requestedSpaceIds: [],
    spaceId: null,
    triggerId: null,
    unread: false,
    depth: 0,
    branchId: null,
    forkingData: {
      forkedFrom: {
        parentConversationId: PARENT_CONVERSATION_ID,
        parentConversationTitle: PARENT_TITLE,
        sourceMessageId: "msg_parent",
        branchedAt: 1,
        user: makeUser(),
      },
    },
  };
}

describe("ConversationTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.activeConversationId = "conv_child";
    mockState.conversation = makeConversation();
    mockState.isMobile = false;
  });

  it("keeps the parent conversation title visible on desktop", () => {
    render(<ConversationTitle owner={owner} />);

    expect(screen.getByText(CURRENT_TITLE)).toBeInTheDocument();
    expect(screen.getByText(PARENT_TITLE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: PARENT_TITLE })).toHaveAttribute(
      "href",
      `/w/${owner.sId}/conversation/${PARENT_CONVERSATION_ID}`
    );
  });

  it("renders an icon-only branch link on mobile", () => {
    mockState.isMobile = true;

    render(<ConversationTitle owner={owner} />);

    expect(screen.getByText(CURRENT_TITLE)).toBeInTheDocument();
    expect(screen.queryByText(PARENT_TITLE)).toBeNull();
    expect(
      screen.getByRole("link", {
        name: `Branched from '${PARENT_TITLE}'`,
      })
    ).toHaveAttribute(
      "href",
      `/w/${owner.sId}/conversation/${PARENT_CONVERSATION_ID}`
    );
  });
});
