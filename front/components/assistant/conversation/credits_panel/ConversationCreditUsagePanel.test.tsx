import { ConversationCreditUsagePanel } from "@app/components/assistant/conversation/credits_panel/ConversationCreditUsagePanel";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTrackEvent, mockUseConversationConsumption } = vi.hoisted(() => ({
  mockTrackEvent: vi.fn(),
  mockUseConversationConsumption: vi.fn(),
}));

vi.mock(
  "@app/components/assistant/conversation/ConversationSidePanelContext",
  () => ({
    useConversationSidePanelContext: () => ({ closePanel: vi.fn() }),
  })
);

vi.mock("@app/hooks/conversations/useConversationConsumption", () => ({
  useConversationConsumption: mockUseConversationConsumption,
}));

vi.mock("@app/lib/tracking", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/tracking")>();
  return { ...actual, trackEvent: mockTrackEvent };
});

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
  lastReadMs: null,
  metadata: {},
  requestedSpaceIds: [],
  spaceId: null,
  triggerId: null,
  unread: false,
  updated: 1,
};

describe("ConversationCreditUsagePanel", () => {
  beforeEach(() => {
    mockTrackEvent.mockReset();
    mockUseConversationConsumption.mockReset();
  });

  it("shows the empty usage placeholder when no credits have been consumed", () => {
    mockUseConversationConsumption.mockReturnValue({
      consumption: undefined,
      isConsumptionError: false,
      isConsumptionLoading: false,
    });

    render(
      <ConversationCreditUsagePanel conversation={conversation} owner={owner} />
    );

    expect(screen.getByText("Credit usage")).toBeInTheDocument();
    expect(screen.getByText("No usage yet")).toBeInTheDocument();
    expect(
      screen.getByText("Updates once a message is fully processed.")
    ).toBeInTheDocument();
    expect(mockTrackEvent).toHaveBeenCalledOnce();
    expect(mockTrackEvent).toHaveBeenCalledWith({
      area: "analytics",
      object: "conversation_breakdown",
      action: "view",
      extra: {
        workspace_id: "workspace_1",
        conversation_id: "conversation_1",
      },
    });
  });
});
