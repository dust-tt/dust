import { ConversationCreditUsageBreakdown } from "@app/components/assistant/conversation/credits_panel/ConversationCreditUsageBreakdown";
import type {
  ConversationConsumptionDetails,
  ConversationConsumptionToolDetails,
} from "@app/types/assistant/conversation_consumption";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/components/sparkle/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

function makeTool(
  toolName: string,
  label: string,
  attributedCredits: number
): ConversationConsumptionToolDetails {
  return {
    label,
    internalMCPServerName: null,
    toolName,
    callCount: 1,
    attributedCredits,
    directCredits: 0,
    pending: false,
  };
}

describe("ConversationCreditUsageBreakdown", () => {
  it("shows the largest tools and groups the rest", () => {
    const details: ConversationConsumptionDetails = {
      agentWorkCredits: 4.5,
      tools: [
        makeTool("files", "File tool", 2),
        makeTool("calendar", "Calendar tool", 6.5),
        makeTool("title", "Title tool", 1),
        makeTool("search", "Search tool", 5),
        makeTool("web", "Web tool", 3),
      ],
      models: [
        {
          providerId: "openai",
          modelId: "gpt-5-mini",
          displayName: "GPT-5 Mini",
          attributedCredits: 15,
        },
      ],
      agents: [
        {
          agentId: "agent_1",
          name: "Research agent",
          pictureUrl: null,
          billedCredits: 20,
          agentWorkCredits: 4.5,
          tools: [],
          models: [],
        },
      ],
    };

    render(
      <ConversationCreditUsageBreakdown billedCredits={20} details={details} />
    );

    expect(
      screen.getByRole("heading", { name: "Total credits consumed" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "By model" })
    ).toBeInTheDocument();
    expect(screen.getByText("Context and reasoning")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Agents use credits to process the conversation history and context. Longer conversations consume more credits."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Calendar tool")).toBeInTheDocument();
    expect(screen.getByText("6.5 credits")).toBeInTheDocument();
    expect(screen.getByText("4.5 credits")).toBeInTheDocument();
    expect(screen.getByText("Search tool")).toBeInTheDocument();
    expect(screen.getByText("Web tool")).toBeInTheDocument();
    expect(screen.queryByText("File tool")).not.toBeInTheDocument();
    expect(screen.queryByText("Title tool")).not.toBeInTheDocument();
    expect(screen.getByText("Other tools")).toBeInTheDocument();
    expect(screen.getByText("2 uses")).toBeInTheDocument();
    expect(screen.getByText("GPT-5 Mini")).toBeInTheDocument();
    expect(screen.getByText("15 credits")).toBeInTheDocument();
    expect(screen.queryByText("Research agent")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Per Agents" })
    ).not.toBeInTheDocument();
  });

  it("collapses agent breakdowns by default and expands them from the row", () => {
    const agent = {
      pictureUrl: null,
      billedCredits: 10,
      agentWorkCredits: 10,
      tools: [],
      models: [],
    };
    const details: ConversationConsumptionDetails = {
      agentWorkCredits: 20,
      tools: [],
      models: [],
      agents: [
        {
          ...agent,
          agentId: "agent_1",
          name: "Research agent",
          tools: [makeTool("search", "Search tool", 4)],
        },
        {
          ...agent,
          agentId: "agent_2",
          name: "Writing agent",
          tools: [makeTool("write", "Writing tool", 6)],
        },
      ],
    };

    render(
      <ConversationCreditUsageBreakdown billedCredits={20} details={details} />
    );

    expect(screen.getByText("Research agent")).toBeInTheDocument();
    expect(screen.getByText("Writing agent")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Per Agents" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Search tool")).not.toBeInTheDocument();
    expect(screen.queryByText("Writing tool")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Research agent"));

    expect(screen.getByText("Search tool")).toBeInTheDocument();
    expect(screen.queryByText("Writing tool")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Collapse credit details for Research agent",
      })
    ).toHaveAttribute("aria-expanded", "true");
  });
});
