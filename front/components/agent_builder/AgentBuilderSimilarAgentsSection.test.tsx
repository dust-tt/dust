import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentBuilderSimilarAgentsSection } from "./AgentBuilderSimilarAgentsSection";

const owner: LightWorkspaceType = {
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

const user = { sId: "user_1" };

vi.mock("@app/components/agent_builder/AgentBuilderContext", () => ({
  useAgentBuilderContext: () => ({ owner, user }),
}));

vi.mock("@app/components/assistant/details/AgentDetailsSheet", () => ({
  AgentDetailsSheet: ({ agentId }: { agentId: string | null }) =>
    agentId ? <div data-testid="agent-details-sheet">{agentId}</div> : null,
}));

let isSimilarAgentsCheckEnabledMock = true;
vi.mock("@app/lib/auth/AuthContext", () => ({
  useFeatureFlags: () => ({
    hasFeature: () => isSimilarAgentsCheckEnabledMock,
  }),
}));

let descriptionMock = "";
vi.mock("react-hook-form", () => ({
  useWatch: () => descriptionMock,
}));

const getSimilarAgentsMock = vi.fn();
let agentConfigurationsMock: LightAgentConfigurationType[] = [];
vi.mock("@app/lib/swr/assistants", () => ({
  useSimilarAgents: () => ({ getSimilarAgents: getSimilarAgentsMock }),
  useAgentConfigurations: () => ({
    agentConfigurations: agentConfigurationsMock,
  }),
}));

function makeAgent(sId: string, name: string): LightAgentConfigurationType {
  return {
    id: 1,
    versionCreatedAt: null,
    sId,
    version: 1,
    versionAuthorId: null,
    instructions: null,
    model: {
      providerId: "openai",
      modelId: "gpt-4o",
      temperature: 0.7,
    },
    status: "active",
    scope: "visible",
    userFavorite: false,
    name,
    description: `Description for ${name}`,
    pictureUrl: "https://example.com/avatar.png",
    maxStepsPerRun: 8,
    tags: [],
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    canRead: true,
    canEdit: true,
  };
}

describe("AgentBuilderSimilarAgentsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    descriptionMock = "";
    agentConfigurationsMock = [makeAgent("agent_1", "HR Assistant")];
    isSimilarAgentsCheckEnabledMock = true;
  });

  it("does not fetch while the description is too short", async () => {
    descriptionMock = "short";

    render(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);

    // Give the debounce a chance to fire; it shouldn't call the API.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(getSimilarAgentsMock).not.toHaveBeenCalled();
  });

  it("fetches similar agents once the description is long enough, after the debounce", async () => {
    getSimilarAgentsMock.mockResolvedValue(new Ok(["agent_1"]));
    descriptionMock = "Answer questions about HR policies";

    render(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);

    await waitFor(() => expect(getSimilarAgentsMock).toHaveBeenCalledTimes(1));
    expect(getSimilarAgentsMock).toHaveBeenCalledWith(
      "Answer questions about HR policies",
      expect.anything()
    );
    expect(await screen.findByText("HR Assistant")).toBeInTheDocument();
  });

  it("debounces rapid successive changes into a single request", async () => {
    getSimilarAgentsMock.mockResolvedValue(new Ok([]));

    descriptionMock = "Answer questions about HR poli";
    const { rerender } = render(
      <AgentBuilderSimilarAgentsSection agentConfigurationId={null} />
    );

    descriptionMock = "Answer questions about HR polic";
    rerender(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);

    descriptionMock = "Answer questions about HR policies";
    rerender(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);

    await waitFor(() => expect(getSimilarAgentsMock).toHaveBeenCalledTimes(1));
    expect(getSimilarAgentsMock).toHaveBeenCalledWith(
      "Answer questions about HR policies",
      expect.anything()
    );
  });

  it("does not fetch when editing an existing agent", async () => {
    descriptionMock = "Answer questions about HR policies";

    render(
      <AgentBuilderSimilarAgentsSection agentConfigurationId="agent_config_1" />
    );

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(getSimilarAgentsMock).not.toHaveBeenCalled();
  });

  it("does not fetch when the similar_agents_check feature flag is disabled", async () => {
    isSimilarAgentsCheckEnabledMock = false;
    descriptionMock = "Answer questions about HR policies";

    const { container } = render(
      <AgentBuilderSimilarAgentsSection agentConfigurationId={null} />
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(getSimilarAgentsMock).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
