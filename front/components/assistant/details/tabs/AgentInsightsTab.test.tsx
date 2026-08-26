import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { WorkspaceType } from "@app/types/user";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentInsightsTab } from "./AgentInsightsTab";

const consumptionOverviewMock = vi.hoisted(() => vi.fn(() => null));

vi.mock(
  "@app/components/workspace/analytics/consumption/ConsumptionOverview",
  () => ({ ConsumptionOverview: consumptionOverviewMock })
);

const owner: WorkspaceType = {
  id: 1,
  sId: "w_1",
  name: "Workspace",
  role: "user",
  segmentation: null,
  whiteListedProviders: null,
  defaultEmbeddingProvider: null,
  regionalModelsOnly: false,
  sharingPolicy: "workspace_only",
  metronomeCustomerId: null,
};

const agentConfiguration: AgentConfigurationType = {
  id: 1,
  sId: "agent_1",
  versionCreatedAt: null,
  version: 1,
  versionAuthorId: null,
  instructions: null,
  instructionsHtml: null,
  model: {
    providerId: "openai",
    modelId: "gpt-4o",
    temperature: 0.7,
  },
  status: "active",
  scope: "visible",
  userFavorite: false,
  name: "Agent",
  description: "Agent description",
  pictureUrl: "",
  maxStepsPerRun: 8,
  tags: [],
  actions: [],
  templateId: null,
  requestedGroupIds: [],
  requestedSpaceIds: [],
  canRead: true,
  canEdit: false,
};

describe("AgentInsightsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains why a non-editor cannot view agent insights", () => {
    render(
      <AgentInsightsTab owner={owner} agentConfiguration={agentConfiguration} />
    );

    expect(
      screen.getByRole("heading", { name: "Insights" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("You’re not an editor of this agent")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Only this agent’s editors can view its analytics and feedback."
      )
    ).toBeInTheDocument();
    expect(consumptionOverviewMock).not.toHaveBeenCalled();
  });
});
