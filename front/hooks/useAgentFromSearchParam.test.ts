import { useAgentFromSearchParam } from "@app/hooks/useAgentFromSearchParam";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { agentConfigurationHolder, searchParamHolder, setSelectedAgent } =
  vi.hoisted(() => ({
    agentConfigurationHolder: {
      current: null as LightAgentConfigurationType | null,
    },
    searchParamHolder: { current: null as string | null },
    setSelectedAgent: vi.fn(),
  }));

vi.mock("@app/lib/platform", () => ({
  useSearchParam: () => searchParamHolder.current,
}));

vi.mock("@app/lib/swr/assistants", () => ({
  useAgentConfiguration: () => ({
    agentConfiguration: agentConfigurationHolder.current,
  }),
}));

vi.mock(
  "@app/components/assistant/conversation/input_bar/InputBarContext",
  async () => {
    const { createContext } = await import("react");
    return { InputBarContext: createContext({ setSelectedAgent }) };
  }
);

function makeAgentConfiguration(sId: string): LightAgentConfigurationType {
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
    name: `agent-${sId}`,
    description: "desc",
    pictureUrl: "https://example.com/p.png",
    maxStepsPerRun: 8,
    tags: [],
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    canRead: true,
    canEdit: true,
  };
}

describe("useAgentFromSearchParam", () => {
  beforeEach(() => {
    setSelectedAgent.mockClear();
    searchParamHolder.current = "agent_1";
    agentConfigurationHolder.current = makeAgentConfiguration("agent_1");
    window.history.replaceState(
      null,
      "",
      "/w/w_1/conversation/new?agent=agent_1"
    );
  });

  it("selects the agent and leaves the param in the URL", async () => {
    renderHook(() => useAgentFromSearchParam("w_1"));

    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(1));
    expect(setSelectedAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent_1", type: "agent" })
    );
    expect(window.location.search).toBe("?agent=agent_1");
  });

  it("does not re-select when the configuration revalidates to the same agent", async () => {
    const { rerender } = renderHook(() => useAgentFromSearchParam("w_1"));

    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(1));

    agentConfigurationHolder.current = makeAgentConfiguration("agent_1");
    rerender();

    expect(setSelectedAgent).toHaveBeenCalledTimes(1);
  });

  it("selects the new agent when the param changes", async () => {
    const { rerender } = renderHook(() => useAgentFromSearchParam("w_1"));

    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(1));

    searchParamHolder.current = "agent_2";
    agentConfigurationHolder.current = makeAgentConfiguration("agent_2");
    rerender();

    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(2));
    expect(setSelectedAgent).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "agent_2" })
    );
  });
});
