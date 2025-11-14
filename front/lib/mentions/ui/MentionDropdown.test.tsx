import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LightWorkspaceType, RichMention } from "@app/types";

import { MentionDropdown } from "./MentionDropdown";

// Mock Sparkle dropdown primitives to render content directly without portals.
vi.mock("@dust-tt/sparkle", () => {
  const DropdownMenu: React.FC<{ children: React.ReactNode }> = ({
    children,
  }) => <div data-testid="dropdown-menu">{children}</div>;
  const DropdownMenuTrigger: React.FC<{
    children: React.ReactNode;
    asChild?: boolean;
  }> = ({ children }) => (
    <button data-testid="dropdown-trigger">{children}</button>
  );
  const DropdownMenuContent: React.FC<{
    children: React.ReactNode;
    side?: string;
    align?: string;
  }> = ({ children }) => <div data-testid="dropdown-content">{children}</div>;
  const DropdownMenuItem: React.FC<{
    onClick?: () => void;
    icon?: React.ComponentType<any>;
    label: string;
  }> = ({ onClick, label }) => (
    <div>
      <button onClick={onClick}>{label}</button>
    </div>
  );
  const ChatBubbleBottomCenterTextIcon = () => null;
  const EyeIcon = () => null;
  return {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    ChatBubbleBottomCenterTextIcon,
    EyeIcon,
  };
});

// Mock router utilities and hooks.
const pushMock = vi.fn();
vi.mock("next/router", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

const openChangeMock = vi.fn();
vi.mock("@app/hooks/useURLSheet", () => ({
  useURLSheet: () => ({ onOpenChange: openChangeMock }),
}));

const getConversationRouteMock = vi.fn(
  (..._: any[]) => "/w/w_123/a/new?agent=agent_conf_1"
);
const setQueryParamMock = vi.fn();
vi.mock("@app/lib/utils/router", () => ({
  getConversationRoute: (...args: any[]) => getConversationRouteMock(...args),
  setQueryParam: (...args: any[]) => setQueryParamMock(...args),
}));

const owner = { sId: "w_1", id: 1, name: "W" } as LightWorkspaceType;

const agentMention: RichMention = {
  id: "agent_conf_1",
  type: "agent",
  label: "Alice",
  pictureUrl: "https://example.com/p.png",
  description: "desc",
};

const userMention: RichMention = {
  id: "user_1",
  type: "user",
  label: "Bob",
  pictureUrl: "https://example.com/u.png",
  description: "user desc",
};

describe("MentionDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.skip("returns children unchanged for non-agent mentions", () => {
    render(
      <MentionDropdown mention={userMention} owner={owner}>
        <span data-testid="child">@Bob</span>
      </MentionDropdown>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
    // Our mocked DropdownMenu container should not be present for non-agent mentions.
    expect(screen.queryByTestId("dropdown-menu")).toBeNull();
    // And no dropdown content rendered.
    expect(screen.queryByTestId("dropdown-content")).toBeNull();
  });

  it("renders dropdown items for agent mentions", () => {
    render(
      <MentionDropdown mention={agentMention} owner={owner}>
        <span>@Alice</span>
      </MentionDropdown>
    );

    // Items are rendered directly by our mock.
    expect(
      screen.getByRole("button", { name: "New conversation with @Alice" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "About @Alice" })
    ).toBeInTheDocument();
  });

  it("clicking 'New conversation' navigates to new conversation route", async () => {
    const user = userEvent.setup();
    render(
      <MentionDropdown mention={agentMention} owner={owner}>
        <span>@Alice</span>
      </MentionDropdown>
    );

    await user.click(
      screen.getByRole("button", { name: "New conversation with @Alice" })
    );

    expect(getConversationRouteMock).toHaveBeenCalledWith(
      owner.sId,
      "new",
      `agent=${agentMention.id}`
    );
    expect(pushMock).toHaveBeenCalledWith("/w/w_123/a/new?agent=agent_conf_1");
  });

  it("clicking 'About' opens the agent details sheet and sets query param", async () => {
    const user = userEvent.setup();
    render(
      <MentionDropdown mention={agentMention} owner={owner}>
        <span>@Alice</span>
      </MentionDropdown>
    );

    await user.click(screen.getByRole("button", { name: "About @Alice" }));

    expect(openChangeMock).toHaveBeenCalledWith(true);
    expect(setQueryParamMock).toHaveBeenCalled();
    const [routerArg, keyArg, valueArg] = setQueryParamMock.mock.calls[0];
    expect(keyArg).toBe("agentDetails");
    expect(valueArg).toBe(agentMention.id);
    // Router object is opaque; we only ensure it's provided.
    expect(routerArg).toBeDefined();
  });
});
