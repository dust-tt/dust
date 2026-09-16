import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { Err, Ok } from "@app/types/shared/result";
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

interface AgentDetailsSheetMockProps {
  agentId: string | null;
}

vi.mock("@app/components/assistant/details/AgentDetailsSheet", () => ({
  AgentDetailsSheet: ({ agentId }: AgentDetailsSheetMockProps) =>
    agentId ? <div data-testid="agent-details-sheet">{agentId}</div> : null,
}));

let isSimilarAgentsCheckEnabledMock = true;
vi.mock("@app/lib/auth/AuthContext", () => ({
  useFeatureFlags: () => ({
    hasFeature: () => isSimilarAgentsCheckEnabledMock,
  }),
}));

let instructionsMock = "";
vi.mock("react-hook-form", () => ({
  useWatch: () => instructionsMock,
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
    agentModelId: 1,
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
    instructionsMock = "";
    agentConfigurationsMock = [makeAgent("agent_1", "HR Assistant")];
    isSimilarAgentsCheckEnabledMock = true;
  });

  it("does not fetch while the instructions are too short", async () => {
    instructionsMock = "short";

    render(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);

    // Give the debounce a chance to fire; it shouldn't call the API.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(getSimilarAgentsMock).not.toHaveBeenCalled();
  });

  it("fetches similar agents once the instructions are long enough, after the debounce", async () => {
    getSimilarAgentsMock.mockResolvedValue(new Ok(["agent_1"]));
    instructionsMock = "Answer questions about HR policies";

    render(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);

    await waitFor(() => expect(getSimilarAgentsMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(getSimilarAgentsMock).toHaveBeenCalledWith(
      "Answer questions about HR policies",
      expect.anything()
    );
    expect(await screen.findByText("HR Assistant")).toBeInTheDocument();
  });

  it("debounces rapid successive changes into a single request", async () => {
    getSimilarAgentsMock.mockResolvedValue(new Ok([]));

    instructionsMock = "Answer questions about HR poli";
    const { rerender } = render(
      <AgentBuilderSimilarAgentsSection agentConfigurationId={null} />
    );

    instructionsMock = "Answer questions about HR polic";
    rerender(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);

    instructionsMock = "Answer questions about HR policies";
    rerender(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);

    await waitFor(() => expect(getSimilarAgentsMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(getSimilarAgentsMock).toHaveBeenCalledWith(
      "Answer questions about HR policies",
      expect.anything()
    );
  });

  it("does not re-fetch when the instructions settle back to an already-checked value", async () => {
    getSimilarAgentsMock.mockResolvedValue(new Ok([]));

    instructionsMock = "Answer questions about HR policies";
    const { rerender } = render(
      <AgentBuilderSimilarAgentsSection agentConfigurationId={null} />
    );

    await waitFor(() => expect(getSimilarAgentsMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });

    // Undo back to the exact same instructions already checked.
    instructionsMock = "Answer questions about HR policie";
    rerender(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);
    instructionsMock = "Answer questions about HR policies";
    rerender(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);

    // Give the debounce a chance to fire again; it shouldn't re-call the API.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1300));
    });

    expect(getSimilarAgentsMock).toHaveBeenCalledTimes(1);
  });

  it("shows an error message when the check fails", async () => {
    getSimilarAgentsMock.mockResolvedValue(new Err(new Error("boom")));
    instructionsMock = "Answer questions about HR policies";

    render(<AgentBuilderSimilarAgentsSection agentConfigurationId={null} />);

    expect(
      await screen.findByText("Couldn't check for similar agents.", undefined, {
        timeout: 3000,
      })
    ).toBeInTheDocument();
  });

  it("does not fetch when editing an existing agent", async () => {
    instructionsMock = "Answer questions about HR policies";

    render(
      <AgentBuilderSimilarAgentsSection agentConfigurationId="agent_config_1" />
    );

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(getSimilarAgentsMock).not.toHaveBeenCalled();
  });

  it("does not fetch when the similar_agents_check feature flag is disabled", async () => {
    isSimilarAgentsCheckEnabledMock = false;
    instructionsMock = "Answer questions about HR policies";

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
