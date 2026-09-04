import { ConsumptionAttributionTable } from "@app/components/workspace/analytics/consumption/ConsumptionAttributionTable";
import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { ConsumptionTopRow } from "@app/hooks/useConsumptionTop";
import { PERSONAL_CONSUMPTION_ANALYTICS_SCOPE } from "@app/lib/analytics/consumption_scope";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUseConsumptionTop,
  mockUseConsumptionExports,
  mockUseStartConsumptionExport,
} = vi.hoisted(() => ({
  mockUseConsumptionTop: vi.fn(),
  mockUseConsumptionExports: vi.fn(),
  mockUseStartConsumptionExport: vi.fn(),
}));

vi.mock("@app/hooks/useConsumptionTop", () => ({
  useConsumptionTop: mockUseConsumptionTop,
}));

vi.mock("@app/hooks/useConsumptionExports", () => ({
  useConsumptionExports: mockUseConsumptionExports,
  useStartConsumptionExport: mockUseStartConsumptionExport,
}));

vi.mock("@app/components/sparkle/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock("@dust-tt/sparkle", async (importOriginal) => {
  const sparkle = await importOriginal<typeof import("@dust-tt/sparkle")>();

  return {
    ...sparkle,
    Tooltip: ({ label, trigger }: { label: ReactNode; trigger: ReactNode }) => (
      <>
        {trigger}
        <div role="tooltip">{label}</div>
      </>
    ),
  };
});

vi.mock(
  "@app/components/workspace/analytics/consumption/ConsumptionAttributionBreakdown",
  () => ({
    ConsumptionAttributionBreakdown: () => <div>Attribution breakdown</div>,
  })
);

vi.mock(
  "@app/components/workspace/analytics/consumption/ConsumptionConversationAttribution",
  () => ({
    ConsumptionConversationAttribution: () => (
      <div>Conversation attribution</div>
    ),
  })
);

const period = { kind: "days", days: 30 } as const;
const agentAnalyticsScope = { kind: "agent", agentId: "agent-id" } as const;

function ControlledAttributionTable({
  onDimensionChange,
}: {
  onDimensionChange: (dimension: ConsumptionDimension) => void;
}) {
  const [dimension, setDimension] = useState<ConsumptionDimension>("source");

  return (
    <ConsumptionAttributionTable
      workspaceId="workspace-id"
      period={period}
      dimension={dimension}
      onDimensionChange={(nextDimension) => {
        onDimensionChange(nextDimension);
        setDimension(nextDimension);
      }}
      onAddFilter={vi.fn()}
      onRemoveFilter={vi.fn()}
      onViewAll={vi.fn()}
    />
  );
}

describe("ConsumptionAttributionTable", () => {
  beforeEach(() => {
    mockUseConsumptionExports.mockReturnValue({
      exports: [],
      isGenerating: false,
      isConsumptionExportsLoading: false,
      isConsumptionExportsError: undefined,
    });
    mockUseStartConsumptionExport.mockReturnValue({
      isStarting: false,
      startConsumptionExport: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("scopes attribution data and hides raw exports in the personal view", () => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [],
      totalCredits: 0,
      totalCount: 0,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    });

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        analyticsScope={PERSONAL_CONSUMPTION_ANALYTICS_SCOPE}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    expect(mockUseConsumptionTop).toHaveBeenCalledWith(
      expect.objectContaining({
        analyticsScope: PERSONAL_CONSUMPTION_ANALYTICS_SCOPE,
      })
    );
    expect(mockUseConsumptionExports).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Download raw data" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Agents" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Conversations" })).toHaveClass(
      "ml-auto"
    );
    expect(
      screen.queryByRole("tab", { name: "Members" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Groups" })
    ).not.toBeInTheDocument();
  });

  it.each([
    "user",
    "group",
  ] as const)("normalizes the %s dimension in the personal view", (dimension) => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [],
      totalCredits: 0,
      totalCount: 0,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    });

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        analyticsScope={PERSONAL_CONSUMPTION_ANALYTICS_SCOPE}
        dimension={dimension}
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    expect(screen.getByRole("tab", { name: "Agents" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(mockUseConsumptionTop).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dimension: "agent",
        analyticsScope: PERSONAL_CONSUMPTION_ANALYTICS_SCOPE,
      })
    );
  });

  it("shows conversations only in personal attribution without changing the chart dimension", () => {
    const onDimensionChange = vi.fn();
    mockUseConsumptionTop.mockReturnValue({
      rows: [],
      totalCredits: 0,
      totalCount: 0,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    });

    const { rerender } = render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        analyticsScope={PERSONAL_CONSUMPTION_ANALYTICS_SCOPE}
        dimension="agent"
        onDimensionChange={onDimensionChange}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    const conversationsTab = screen.getByRole("tab", {
      name: "Conversations",
    });
    fireEvent.pointerDown(conversationsTab);
    fireEvent.mouseDown(conversationsTab, { button: 0, ctrlKey: false });

    expect(onDimensionChange).not.toHaveBeenCalled();
    expect(screen.getByText("Conversation attribution")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Search…")).not.toBeInTheDocument();

    rerender(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={onDimensionChange}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("tab", { name: "Conversations" })
    ).not.toBeInTheDocument();
  });

  it("scopes attribution data to an agent and removes the Agents tab", () => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [],
      totalCredits: 0,
      totalCount: 0,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    });

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        analyticsScope={agentAnalyticsScope}
        dimension="user"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    expect(mockUseConsumptionTop).toHaveBeenCalledWith(
      expect.objectContaining({
        analyticsScope: agentAnalyticsScope,
        dimension: "user",
      })
    );
    expect(mockUseConsumptionExports).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Download raw data" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Agents" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Members" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Groups" })).toBeInTheDocument();
  });

  it("shows active members and per-member usage for groups", () => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [
        {
          id: "engineering",
          name: "Engineering",
          pictureUrl: null,
          description: null,
          icon: null,
          modelId: null,
          modelDisplayName: null,
          credits: 500,
          avgCredits: 100,
          activeMembers: 2,
          totalMembers: 5,
          previousCredits: null,
        },
      ],
      totalCredits: 1_000,
      totalActiveMembers: 10,
      totalCount: 1,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    });

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="group"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    expect(
      screen.getByRole("columnheader", { name: "Active / total members" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Per-member usage vs avg" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Consumption share" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
    const usagePercentage = screen.getByText("250%");
    expect(usagePercentage.parentElement).toHaveClass("text-highlight-600");
    expect(usagePercentage.parentElement?.querySelector("svg")).toBeNull();
  });

  it("caps the available pages and fetches the selected fixed-size page", async () => {
    const rows = Array.from({ length: 1_025 }, (_, index) => ({
      id: `agent-${index + 1}`,
      name: `Agent ${index + 1}`,
      pictureUrl: null,
      credits: 100 - index,
      avgCredits: 10,
    }));
    mockUseConsumptionTop.mockImplementation(
      ({ limit, offset }: { limit: number; offset: number }) => ({
        rows: rows.slice(offset, offset + limit),
        totalCredits: 2_565,
        totalCount: rows.length,
        hasMore: offset + limit < rows.length,
        isTopLoading: false,
        isTopError: undefined,
        isTopValidating: false,
      })
    );

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    expect(mockUseConsumptionTop).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, offset: 0 })
    );

    expect(screen.getByRole("button", { name: "40" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "41" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "40" }));

    await waitFor(() => {
      expect(mockUseConsumptionTop).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 975 })
      );
      expect(screen.getByText("Agent 1000")).toBeInTheDocument();
    });
  });

  it("shows a destination-sized skeleton while changing pages", async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      id: `agent-${index + 1}`,
      name: `Agent ${index + 1}`,
      pictureUrl: null,
      description: null,
      icon: null,
      modelId: null,
      modelDisplayName: null,
      credits: 100 - index,
      avgCredits: 10,
    }));
    let secondPageLoaded = false;
    mockUseConsumptionTop.mockImplementation(
      ({ limit, offset }: { limit: number; offset: number }) => ({
        rows:
          offset === 0 || secondPageLoaded
            ? rows.slice(offset, offset + limit)
            : rows.slice(0, limit),
        totalCredits: 2_565,
        totalCount: rows.length,
        hasMore: offset + limit < rows.length,
        isTopLoading: offset > 0 && !secondPageLoaded,
        isTopError: undefined,
        isTopValidating: offset > 0 && !secondPageLoaded,
      })
    );

    const { container, rerender } = render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "2" }));

    const loadingContent =
      container.querySelector<HTMLElement>('[aria-busy="true"]');
    if (!loadingContent) {
      throw new Error("Expected paginated attribution rows to be loading");
    }
    expect(
      loadingContent.querySelectorAll('tbody tr[aria-hidden="true"]')
    ).toHaveLength(5);
    expect(
      within(loadingContent).getByRole("button", { name: "2" })
    ).toBeInTheDocument();

    secondPageLoaded = true;
    rerender(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    expect(await screen.findByText("Agent 30")).toBeInTheDocument();
  });

  it("sends the search to the backend", async () => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [],
      totalCredits: 0,
      totalCount: 0,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    });

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "Agent 080" },
    });

    await waitFor(() => {
      expect(mockUseConsumptionTop).toHaveBeenCalledWith(
        expect.objectContaining({ search: "Agent 080", offset: 0, limit: 25 })
      );
    });
  });

  it("clears the search when a row is added to the filters", async () => {
    const onAddFilter = vi.fn();
    const row = {
      id: "user-1",
      name: "Jane Doe",
      pictureUrl: null,
      credits: 100,
      avgCredits: 10,
    };
    mockUseConsumptionTop.mockReturnValue({
      rows: [row],
      totalCredits: 100,
      totalCount: 1,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    });

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="user"
        onDimensionChange={vi.fn()}
        onAddFilter={onAddFilter}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText("Search…");
    fireEvent.change(searchInput, { target: { value: "Jane" } });

    fireEvent.click(
      screen.getByRole("button", { name: "Add Jane Doe to filters" })
    );

    expect(onAddFilter).toHaveBeenCalledWith(expect.objectContaining(row));
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search…")).toHaveValue("");
    });
  });

  it("selects the API key dimension with a pointer", () => {
    const onDimensionChange = vi.fn();
    mockUseConsumptionTop.mockReturnValue({
      rows: [],
      totalCredits: 0,
      isTopLoading: false,
      isTopError: undefined,
    });

    render(
      <ControlledAttributionTable onDimensionChange={onDimensionChange} />
    );

    const apiKeysTab = screen.getByRole("tab", { name: "API keys" });
    fireEvent.pointerDown(apiKeysTab);
    fireEvent.mouseDown(apiKeysTab, { button: 0, ctrlKey: false });

    expect(onDimensionChange).toHaveBeenCalledWith("api_key");
    expect(apiKeysTab).toHaveAttribute("aria-selected", "true");
    expect(mockUseConsumptionTop).toHaveBeenLastCalledWith(
      expect.objectContaining({ dimension: "api_key" })
    );
  });

  it("selects the API key dimension with the keyboard", () => {
    const onDimensionChange = vi.fn();
    mockUseConsumptionTop.mockReturnValue({
      rows: [],
      totalCredits: 0,
      isTopLoading: false,
      isTopError: undefined,
    });

    render(
      <ControlledAttributionTable onDimensionChange={onDimensionChange} />
    );

    const apiKeysTab = screen.getByRole("tab", { name: "API keys" });
    fireEvent.focus(apiKeysTab);
    fireEvent.keyDown(apiKeysTab, { key: "Enter" });

    expect(onDimensionChange).toHaveBeenCalledWith("api_key");
    expect(apiKeysTab).toHaveAttribute("aria-selected", "true");
    expect(mockUseConsumptionTop).toHaveBeenLastCalledWith(
      expect.objectContaining({ dimension: "api_key" })
    );
  });

  it("resets expanded rows when switching dimensions", async () => {
    mockUseConsumptionTop.mockImplementation(
      ({ dimension }: { dimension: ConsumptionDimension }) => ({
        rows: [
          {
            id: "shared-row-id",
            name: dimension === "agent" ? "Research agent" : "Large model",
            pictureUrl: null,
            description: null,
            icon: null,
            modelId: null,
            modelDisplayName: null,
            credits: 100,
            avgCredits: 10,
          },
        ],
        totalCredits: 100,
        totalCount: 1,
        hasMore: false,
        isTopLoading: false,
        isTopError: undefined,
        isTopValidating: false,
      })
    );

    const { rerender } = render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    const expandAgent = screen.getByRole("button", {
      name: "Expand breakdown for Research agent",
    });
    fireEvent.click(expandAgent);
    expect(
      screen.getByRole("button", {
        name: "Collapse breakdown for Research agent",
      })
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Attribution breakdown")).toBeInTheDocument();

    rerender(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="model"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", {
        name: "Expand breakdown for Large model",
      })
    ).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(
        screen.queryByText("Attribution breakdown")
      ).not.toBeInTheDocument();
    });
  });

  it("keeps rows visible while refreshing cached data", () => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [
        {
          id: "agent-id",
          name: "Cached agent",
          pictureUrl: null,
          description: null,
          icon: null,
          modelId: null,
          modelDisplayName: null,
          credits: 100,
          avgCredits: 10,
        },
      ],
      totalCredits: 100,
      totalCount: 1,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: true,
    });

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    expect(screen.getByText("Cached agent")).toBeInTheDocument();
  });

  it("reveals rows that arrive after the initial loading state", async () => {
    const emptyRows: ConsumptionTopRow[] = [];
    let result = {
      rows: emptyRows,
      totalCredits: 0,
      totalCount: 0,
      hasMore: false,
      isTopLoading: true,
      isTopError: undefined,
      isTopValidating: true,
    };
    mockUseConsumptionTop.mockImplementation(() => result);

    const { rerender } = render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    result = {
      rows: [
        {
          id: "fresh-agent-id",
          name: "Fresh agent",
          pictureUrl: null,
          description: null,
          icon: null,
          modelId: null,
          modelDisplayName: null,
          credits: 100,
          avgCredits: 10,
          previousCredits: null,
        },
      ],
      totalCredits: 100,
      totalCount: 1,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    };
    rerender(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    const row = await screen.findByText("Fresh agent");
    await waitFor(() => {
      let animatedAncestor: HTMLElement | null = row;
      while (animatedAncestor && !animatedAncestor.style.opacity) {
        animatedAncestor = animatedAncestor.parentElement;
      }

      expect(animatedAncestor).toHaveStyle({ opacity: "1" });
    });
  });

  it("toggles the filter button between add and remove", () => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [
        {
          id: "agent-id",
          name: "Research agent",
          pictureUrl: null,
          description: null,
          icon: null,
          modelId: null,
          modelDisplayName: null,
          credits: 100,
          avgCredits: 10,
        },
      ],
      totalCredits: 100,
      totalCount: 1,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    });

    const onAddFilter = vi.fn();
    const onRemoveFilter = vi.fn();

    const { rerender } = render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        onDimensionChange={vi.fn()}
        onAddFilter={onAddFilter}
        onRemoveFilter={onRemoveFilter}
        onViewAll={vi.fn()}
      />
    );

    const addButton = screen.getByRole("button", {
      name: "Add Research agent to filters",
    });
    fireEvent.click(addButton);
    expect(onAddFilter).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-id" })
    );
    expect(onRemoveFilter).not.toHaveBeenCalled();

    rerender(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="agent"
        filter={{ agents: ["agent-id"] }}
        onDimensionChange={vi.fn()}
        onAddFilter={onAddFilter}
        onRemoveFilter={onRemoveFilter}
        onViewAll={vi.fn()}
      />
    );

    const removeButton = screen.getByRole("button", {
      name: "Remove Research agent from filters",
    });
    expect(
      screen.queryByRole("button", { name: "Add Research agent to filters" })
    ).not.toBeInTheDocument();

    fireEvent.click(removeButton);
    expect(onRemoveFilter).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent-id" })
    );
    expect(onAddFilter).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      dimension: "agent" as const,
      row: {
        id: "agent-id",
        name: "Research agent",
        pictureUrl: null,
        description: null,
        icon: null,
        modelId: "model-id",
        modelDisplayName: "Model",
        credits: 100,
        avgCredits: 10,
        previousCredits: null,
      },
    },
    {
      dimension: "skill" as const,
      row: {
        id: "skill-id",
        name: "Research skill",
        pictureUrl: null,
        description: null,
        icon: null,
        modelId: null,
        modelDisplayName: null,
        credits: 100,
        avgCredits: 10,
        previousCredits: null,
      },
    },
  ])("opens the $dimension info page from its name", ({ dimension, row }) => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [row],
      totalCredits: 100,
      totalCount: 1,
      hasMore: false,
      isTopLoading: false,
      isTopError: undefined,
      isTopValidating: false,
    });
    const onAgentClick = vi.fn();
    const onSkillClick = vi.fn();

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension={dimension}
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onAgentClick={onAgentClick}
        onRemoveFilter={vi.fn()}
        onSkillClick={onSkillClick}
        onViewAll={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(row.name));

    expect(
      dimension === "agent" ? onAgentClick : onSkillClick
    ).toHaveBeenCalledWith(row.id);
    expect(
      dimension === "agent" ? onSkillClick : onAgentClick
    ).not.toHaveBeenCalled();
  });

  it("renders the skill identity and description without a model", () => {
    mockUseConsumptionTop.mockReturnValue({
      rows: [
        {
          id: "skill-id",
          name: "Research",
          pictureUrl: null,
          description: "Researches a topic in depth.",
          icon: "search",
          modelId: null,
          modelDisplayName: null,
          credits: 100,
          avgCredits: 10,
        },
      ],
      totalCredits: 100,
      isTopLoading: false,
      isTopError: undefined,
    });

    render(
      <ConsumptionAttributionTable
        workspaceId="workspace-id"
        period={period}
        dimension="skill"
        onDimensionChange={vi.fn()}
        onAddFilter={vi.fn()}
        onRemoveFilter={vi.fn()}
        onViewAll={vi.fn()}
      />
    );

    const tooltip = screen
      .getAllByRole("tooltip")
      .find((candidate) => within(candidate).queryByText("Research"));
    if (!tooltip) {
      throw new Error("Expected a tooltip with the skill's identity card");
    }
    expect(within(tooltip).getByText("Research")).toBeInTheDocument();
    expect(
      within(tooltip).getByText("Researches a topic in depth.")
    ).toBeInTheDocument();
    expect(tooltip.querySelector("svg")).toBeInTheDocument();
  });
});
