import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { RichMention } from "@app/types/assistant/mentions";
import type { WorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import { forwardRef, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { MentionDropdown } from "./MentionDropdown";

const {
  useConversationParticipantsMock,
  useMentionSuggestionsMock,
  useUnifiedAgentConfigurationsMock,
} = vi.hoisted(() => ({
  useConversationParticipantsMock: vi.fn(),
  useMentionSuggestionsMock: vi.fn(),
  useUnifiedAgentConfigurationsMock: vi.fn(),
}));

vi.mock("@app/hooks/conversations/useConversationParticipants", () => ({
  useConversationParticipants: useConversationParticipantsMock,
}));

vi.mock("@app/lib/swr/assistants", () => ({
  useUnifiedAgentConfigurations: useUnifiedAgentConfigurationsMock,
}));

vi.mock("@app/lib/swr/mentions", () => ({
  useMentionSuggestions: useMentionSuggestionsMock,
}));

vi.mock("@dust-tt/sparkle", () => {
  const Container = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  const DropdownMenuItem = forwardRef<
    HTMLButtonElement,
    {
      children: ReactNode;
      onClick?: () => void;
      onMouseEnter?: () => void;
    }
  >(({ children, onClick, onMouseEnter }, _ref) => (
    <button type="button" onClick={onClick} onMouseEnter={onMouseEnter}>
      {children}
    </button>
  ));
  DropdownMenuItem.displayName = "DropdownMenuItem";

  return {
    Avatar: () => null,
    Chip: ({ label }: { label: string }) => <span>{label}</span>,
    cn: (...classes: Array<string | false | undefined>) =>
      classes.filter(Boolean).join(" "),
    DropdownMenu: Container,
    DropdownMenuContent: Container,
    DropdownMenuItem,
    DropdownMenuTrigger: Container,
    Spinner: () => <div data-testid="spinner" />,
  };
});

const owner: WorkspaceType = {
  id: 1,
  sId: "w_test",
  name: "Test Workspace",
  role: "admin",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
  regionalModelsOnly: false,
};

const agentConfiguration: LightAgentConfigurationType = {
  id: 1,
  versionCreatedAt: null,
  sId: "agent_code",
  version: 0,
  versionAuthorId: null,
  instructions: null,
  model: {
    providerId: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    temperature: 0,
  },
  status: "active",
  scope: "visible",
  userFavorite: false,
  name: "Code Agent",
  description: "Writes code",
  pictureUrl: "",
  maxStepsPerRun: 8,
  tags: [],
  templateId: null,
  requestedGroupIds: [],
  requestedSpaceIds: [],
  canRead: true,
  canEdit: false,
};

const userSuggestion: RichMention = {
  id: "user_alice",
  type: "user",
  label: "Alice",
  pictureUrl: "",
  description: "alice@dust.tt",
};

function renderDropdown(query: string) {
  return render(
    <MentionDropdown
      query={query}
      owner={owner}
      conversationId={null}
      command={vi.fn()}
      clientRect={() => new DOMRect(0, 0, 1, 1)}
      select={{ agents: true, users: true }}
    />
  );
}

describe("MentionDropdown", () => {
  it("filters cached agents locally and requests only users from the server", () => {
    useUnifiedAgentConfigurationsMock.mockReturnValue({
      agentConfigurations: [agentConfiguration],
      isLoading: false,
    });
    useConversationParticipantsMock.mockReturnValue({
      conversationParticipants: undefined,
    });
    useMentionSuggestionsMock.mockReturnValue({
      suggestions: [userSuggestion],
      isLoading: false,
    });

    renderDropdown("code");

    expect(screen.getByText("Code Agent")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).toBeNull();
    expect(useMentionSuggestionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { agents: false, users: true },
      })
    );
  });

  it("shows matching agents while user suggestions are loading", () => {
    useUnifiedAgentConfigurationsMock.mockReturnValue({
      agentConfigurations: [agentConfiguration],
      isLoading: false,
    });
    useConversationParticipantsMock.mockReturnValue({
      conversationParticipants: undefined,
    });
    useMentionSuggestionsMock.mockReturnValue({
      suggestions: [],
      isLoading: true,
    });

    renderDropdown("code");

    expect(screen.getByText("Code Agent")).toBeInTheDocument();
    expect(screen.queryByTestId("spinner")).toBeNull();
  });
});
