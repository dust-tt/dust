import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LightWorkspaceType } from "@app/types";

import { agentMentionDirective, getAgentMentionPlugin } from "./plugin";

// Mock MentionDisplay to simplify rendering verification.
vi.mock("../ui/MentionDisplay", () => ({
  MentionDisplay: ({ mention, owner, interactive, showTooltip }: any) => (
    <div
      data-testid="mention-display"
      data-id={mention.id}
      data-label={mention.label}
      data-type={mention.type}
      data-owner={owner?.sId}
      data-interactive={interactive ? "true" : "false"}
      data-tooltip={showTooltip ? "true" : "false"}
    />
  ),
}));

describe("markdown mention plugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("agentMentionDirective transforms textDirective nodes for mentions", () => {
    const tree: any = {
      type: "root",
      children: [
        {
          type: "textDirective",
          name: "mention",
          attributes: { sId: "agent_123" },
          children: [{ type: "text", value: "Alice" }],
        },
        {
          type: "textDirective",
          name: "other",
          attributes: { foo: "bar" },
          children: [{ type: "text", value: "ignore" }],
        },
      ],
    };

    const plugin = agentMentionDirective();
    plugin(tree);

    const node = tree.children[0];
    expect(node.data.hName).toBe("mention");
    expect(node.data.hProperties).toEqual({
      agentSId: "agent_123",
      agentName: "Alice",
    });

    // Ensure non-mention directive is left untouched.
    const other = tree.children[1];
    expect(other.data).toBeUndefined();
  });

  it("getAgentMentionPlugin renders MentionDisplay with expected props", () => {
    const owner = { sId: "w_1", id: 1, name: "W" } as LightWorkspaceType;
    const Comp = getAgentMentionPlugin(owner);

    render(<Comp agentName="Alice" agentSId="agent_123" />);

    const el = screen.getByTestId("mention-display");
    expect(el).toHaveAttribute("data-id", "agent_123");
    expect(el).toHaveAttribute("data-label", "Alice");
    expect(el).toHaveAttribute("data-type", "agent");
    expect(el).toHaveAttribute("data-owner", "w_1");
    expect(el).toHaveAttribute("data-interactive", "true");
    expect(el).toHaveAttribute("data-tooltip", "false");
  });
});
