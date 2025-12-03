import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LightWorkspaceType, RichMention } from "@app/types";

import { MentionDisplay } from "./MentionDisplay";

// Mock Sparkle primitives used by MentionDisplay to simplify tooltip behavior.
vi.mock("@dust-tt/sparkle", () => {
  const Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div data-testid="tooltip-provider">{children}</div>
  );
  const Root: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div data-testid="tooltip-root">{children}</div>
  );
  const Trigger: React.FC<{ children: React.ReactNode; asChild?: boolean }> = ({
    children,
  }) => <span data-testid="tooltip-trigger">{children}</span>;
  const Content: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div role="tooltip">{children}</div>
  );

  return {
    TooltipProvider: Provider,
    TooltipRoot: Root,
    TooltipTrigger: Trigger,
    TooltipContent: Content,
    cn: (...classes: string[]) => classes.join(" "),
  };
});

// Mock MentionDropdown to verify it wraps children when interactive.
vi.mock("./MentionDropdown", () => ({
  MentionDropdown: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mention-dropdown">{children}</div>
  ),
}));

function makeMention(overrides: Partial<RichMention> = {}): RichMention {
  return {
    id: "agent_conf_1",
    type: "agent",
    label: "Alice",
    pictureUrl: "https://example.com/p.png",
    description: "Helpful agent.",
    userFavorite: true,
    ...overrides,
  };
}

const owner = { sId: "w_1", id: 1, name: "W" } as LightWorkspaceType;

describe("MentionDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the @label trigger", () => {
    render(<MentionDisplay mention={makeMention()} owner={owner} />);
    expect(screen.getByText("@Alice")).toBeInTheDocument();
  });

  it("shows tooltip content when showTooltip=true and description exists", () => {
    render(
      <MentionDisplay mention={makeMention()} showTooltip owner={owner} />
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("Helpful agent.");
  });

  it("does not render tooltip when showTooltip=false", () => {
    render(
      <MentionDisplay
        mention={makeMention()}
        showTooltip={false}
        owner={owner}
      />
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("wraps with MentionDropdown when interactive and owner provided", () => {
    render(
      <MentionDisplay mention={makeMention()} interactive owner={owner} />
    );
    // Should be wrapped by our mocked dropdown container.
    expect(screen.getByTestId("mention-dropdown")).toBeInTheDocument();
    // Trigger still visible inside.
    expect(screen.getByText("@Alice")).toBeInTheDocument();
  });

  it("renders tooltip inside dropdown when interactive with tooltip", () => {
    render(
      <MentionDisplay
        mention={makeMention()}
        interactive
        owner={owner}
        showTooltip
      />
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent("Helpful agent.");
  });

  it("non-interactive without description renders just trigger", () => {
    render(
      <MentionDisplay
        mention={makeMention({ description: "" })}
        showTooltip
        owner={owner}
      />
    );
    expect(screen.getByText("@Alice")).toBeInTheDocument();
    // No tooltip if description is empty.
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
