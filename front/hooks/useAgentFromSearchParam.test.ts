import { useAgentFromSearchParam } from "@app/hooks/useAgentFromSearchParam";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { RichAgentMention } from "@app/types/assistant/mentions";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  activeConversationIdHolder,
  agentConfigurationErrorHolder,
  agentConfigurationHolder,
  replaceMock,
  searchParamHolder,
  selectedSingleAgentHolder,
  setSelectedAgent,
} = vi.hoisted(() => ({
  activeConversationIdHolder: { current: null as string | null },
  agentConfigurationErrorHolder: {
    current: undefined as { error: { type: string } } | Error | undefined,
  },
  agentConfigurationHolder: {
    current: null as LightAgentConfigurationType | null,
  },
  replaceMock: vi.fn(),
  searchParamHolder: { current: null as string | null },
  selectedSingleAgentHolder: { current: null as RichAgentMention | null },
  setSelectedAgent: vi.fn(),
}));

vi.mock("@app/lib/platform", () => ({
  useSearchParam: () => searchParamHolder.current,
  useAppRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@app/hooks/useActiveConversationId", () => ({
  useActiveConversationId: () => activeConversationIdHolder.current,
}));

vi.mock("@app/lib/swr/assistants", () => ({
  useAgentConfiguration: ({ disabled }: { disabled?: boolean }) => ({
    agentConfiguration: disabled ? null : agentConfigurationHolder.current,
    isAgentConfigurationError: agentConfigurationErrorHolder.current,
  }),
}));

vi.mock(
  "@app/components/assistant/conversation/input_bar/InputBarContext",
  async () => {
    const { createContext } = await import("react");
    return {
      InputBarContext: createContext({
        get selectedSingleAgent() {
          return selectedSingleAgentHolder.current;
        },
        setSelectedAgent,
      }),
    };
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

function makeMention(id: string): RichAgentMention {
  return {
    id,
    type: "agent",
    label: `agent-${id}`,
    pictureUrl: "https://example.com/p.png",
    description: "desc",
  };
}

function setUrl(search: string) {
  window.history.replaceState(null, "", `/w/w_1/conversation/new${search}`);
}

describe("useAgentFromSearchParam", () => {
  beforeEach(() => {
    setSelectedAgent.mockClear();
    replaceMock.mockClear();
    activeConversationIdHolder.current = null;
    searchParamHolder.current = null;
    agentConfigurationErrorHolder.current = undefined;
    agentConfigurationHolder.current = null;
    selectedSingleAgentHolder.current = null;
    setUrl("");
  });

  it("selects the URL agent on arrival and leaves the URL alone", async () => {
    setUrl("?agent=agent_1");
    searchParamHolder.current = "agent_1";
    agentConfigurationHolder.current = makeAgentConfiguration("agent_1");

    renderHook(() => useAgentFromSearchParam("w_1"));

    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(1));
    expect(setSelectedAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent_1", type: "agent" })
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not write the URL while the URL agent is still loading", () => {
    setUrl("?agent=agent_1");
    searchParamHolder.current = "agent_1";
    selectedSingleAgentHolder.current = makeMention("agent_default");

    renderHook(() => useAgentFromSearchParam("w_1"));

    expect(replaceMock).not.toHaveBeenCalled();
    expect(setSelectedAgent).not.toHaveBeenCalled();
  });

  it("mirrors a picker change to the URL without re-selecting", async () => {
    setUrl("?agent=agent_1#?selectedTab=favorites");
    searchParamHolder.current = "agent_1";
    selectedSingleAgentHolder.current = makeMention("agent_1");

    const { rerender } = renderHook(() => useAgentFromSearchParam("w_1"));
    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(1));
    expect(replaceMock).not.toHaveBeenCalled();

    setSelectedAgent.mockClear();
    selectedSingleAgentHolder.current = makeMention("agent_2");
    rerender();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledWith(
      "/w/w_1/conversation/new?agent=agent_2#?selectedTab=favorites"
    );
    expect(setSelectedAgent).not.toHaveBeenCalled();
  });

  it("applies a new URL agent over the current selection", async () => {
    setUrl("?agent=agent_1");
    searchParamHolder.current = "agent_1";
    selectedSingleAgentHolder.current = makeMention("agent_1");

    const { rerender } = renderHook(() => useAgentFromSearchParam("w_1"));
    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(1));

    setSelectedAgent.mockClear();
    setUrl("?agent=agent_2");
    searchParamHolder.current = "agent_2";
    agentConfigurationHolder.current = makeAgentConfiguration("agent_2");
    rerender();

    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(1));
    expect(setSelectedAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent_2" })
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("writes the URL when an agent is selected and the param is absent", async () => {
    selectedSingleAgentHolder.current = makeMention("agent_1");

    renderHook(() => useAgentFromSearchParam("w_1"));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledWith(
      "/w/w_1/conversation/new?agent=agent_1"
    );
  });

  it("writes the selected agent to the URL when the URL agent cannot be loaded", async () => {
    setUrl("?agent=agent_gone");
    searchParamHolder.current = "agent_gone";
    agentConfigurationErrorHolder.current = {
      error: { type: "agent_configuration_not_found" },
    };
    selectedSingleAgentHolder.current = makeMention("agent_default");

    renderHook(() => useAgentFromSearchParam("w_1"));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledTimes(1));
    expect(replaceMock).toHaveBeenCalledWith(
      "/w/w_1/conversation/new?agent=agent_default"
    );
    expect(setSelectedAgent).not.toHaveBeenCalled();
  });

  it("keeps the URL agent pending on a transient load error", () => {
    setUrl("?agent=agent_1");
    searchParamHolder.current = "agent_1";
    agentConfigurationErrorHolder.current = new Error("network");
    selectedSingleAgentHolder.current = makeMention("agent_default");

    renderHook(() => useAgentFromSearchParam("w_1"));

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not touch the URL on an existing conversation", () => {
    activeConversationIdHolder.current = "conv_1";
    selectedSingleAgentHolder.current = makeMention("agent_1");

    renderHook(() => useAgentFromSearchParam("w_1"));

    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("re-pushes a matching URL agent when entering a new conversation", async () => {
    activeConversationIdHolder.current = "conv_1";
    setUrl("?agent=agent_1");
    searchParamHolder.current = "agent_1";
    selectedSingleAgentHolder.current = makeMention("agent_1");

    const { rerender } = renderHook(() => useAgentFromSearchParam("w_1"));
    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(1));
    setSelectedAgent.mockClear();

    // Navigate to /conversation/new with the same custom agent still selected.
    activeConversationIdHolder.current = null;
    rerender();

    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(1));
    expect(setSelectedAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent_1" })
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does not mirror a default overwrite while the URL agent is pending after entering new", async () => {
    activeConversationIdHolder.current = "conv_1";
    setUrl("?agent=agent_1");
    searchParamHolder.current = "agent_1";
    selectedSingleAgentHolder.current = makeMention("agent_1");

    const { rerender } = renderHook(() => useAgentFromSearchParam("w_1"));
    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalledTimes(1));
    setSelectedAgent.mockClear();

    // Enter new conversation, then simulate the homepage default winning the race
    // before the URL agent is re-applied.
    activeConversationIdHolder.current = null;
    selectedSingleAgentHolder.current = makeMention("dust");
    agentConfigurationHolder.current = makeAgentConfiguration("agent_1");
    rerender();

    await waitFor(() => expect(setSelectedAgent).toHaveBeenCalled());
    expect(setSelectedAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent_1" })
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
