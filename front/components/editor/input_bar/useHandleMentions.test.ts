import useHandleMentions from "@app/components/editor/input_bar/useHandleMentions";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { RichAgentMention } from "@app/types/assistant/mentions";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  agentSearchParamHolder,
  replaceMock,
  selectedSingleAgentHolder,
  setSelectedSingleAgent,
  setSuppressDefaultAgent,
  suppressDefaultAgentHolder,
  userSearchParamHolder,
} = vi.hoisted(() => ({
  agentSearchParamHolder: { current: null as string | null },
  replaceMock: vi.fn(),
  selectedSingleAgentHolder: { current: null as RichAgentMention | null },
  setSelectedSingleAgent: vi.fn(),
  setSuppressDefaultAgent: vi.fn(),
  suppressDefaultAgentHolder: { current: false },
  userSearchParamHolder: { current: null as string | null },
}));

vi.mock("@app/lib/platform", () => ({
  useSearchParam: (name: string) =>
    name === "user"
      ? userSearchParamHolder.current
      : agentSearchParamHolder.current,
  useAppRouter: () => ({ replace: replaceMock }),
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
        get suppressDefaultAgent() {
          return suppressDefaultAgentHolder.current;
        },
        setSelectedSingleAgent,
        setSuppressDefaultAgent,
      }),
    };
  }
);

function makeAgent(sId: string): LightAgentConfigurationType {
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

function setUrl(pathWithSearch: string) {
  window.history.replaceState(null, "", pathWithSearch);
}

const editorService = {
  insertText: vi.fn(),
} as unknown as Parameters<typeof useHandleMentions>[0]["editorService"];

function renderMentions(options: {
  defaultAgentId: string | null;
  isDefaultAgentLoading?: boolean;
  allAgents?: LightAgentConfigurationType[];
  selectedAgent?: RichAgentMention | null;
}) {
  const allAgents = options.allAgents ?? [
    makeAgent(GLOBAL_AGENTS_SID.DUST),
    makeAgent("agent_a"),
    makeAgent("agent_b"),
    makeAgent("agent_custom"),
  ];

  return renderHook(
    ({
      defaultAgentId,
      isDefaultAgentLoading,
      selectedAgent,
    }: {
      defaultAgentId: string | null;
      isDefaultAgentLoading: boolean;
      selectedAgent: RichAgentMention | null;
    }) =>
      useHandleMentions({
        allAgents,
        isAgentsLoading: false,
        editorService,
        getDraft: () => null,
        defaultAgentId,
        isDefaultAgentLoading,
        isAgentBuilder: false,
        selectedAgent,
        disableAutoFocus: false,
      }),
    {
      initialProps: {
        defaultAgentId: options.defaultAgentId,
        isDefaultAgentLoading: options.isDefaultAgentLoading ?? false,
        selectedAgent: options.selectedAgent ?? null,
      },
    }
  );
}

describe("useHandleMentions pod default agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentSearchParamHolder.current = null;
    userSearchParamHolder.current = null;
    suppressDefaultAgentHolder.current = false;
    selectedSingleAgentHolder.current = null;
    setUrl("/w/w_1/pods/pod_b");
  });

  it("selects the destination Pod default when switching Pods without ?agent=", async () => {
    selectedSingleAgentHolder.current = makeMention("agent_a");

    const { rerender } = renderMentions({ defaultAgentId: "agent_a" });

    await waitFor(() =>
      expect(setSelectedSingleAgent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "agent_a" })
      )
    );
    setSelectedSingleAgent.mockClear();

    // Cross-Pod: configured default changes, app-level selection still holds Pod A.
    selectedSingleAgentHolder.current = makeMention("agent_a");
    rerender({
      defaultAgentId: "agent_b",
      isDefaultAgentLoading: false,
      selectedAgent: null,
    });

    await waitFor(() =>
      expect(setSelectedSingleAgent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "agent_b" })
      )
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("clears a stale mirrored ?agent= when the Pod default changes", async () => {
    setUrl("/w/w_1/pods/pod_1?agent=agent_a#conversations");
    agentSearchParamHolder.current = "agent_a";
    selectedSingleAgentHolder.current = makeMention("agent_a");

    const { rerender } = renderMentions({ defaultAgentId: "agent_a" });

    // First settle: ?agent= matches the current default, so URL owns selection.
    expect(setSelectedSingleAgent).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent_b" })
    );
    setSelectedSingleAgent.mockClear();

    // Settings change (tasks#11254): default updates while URL still names the old default.
    rerender({
      defaultAgentId: "agent_b",
      isDefaultAgentLoading: false,
      selectedAgent: null,
    });

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/w/w_1/pods/pod_1#conversations"
      )
    );
    await waitFor(() =>
      expect(setSelectedSingleAgent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "agent_b" })
      )
    );
  });

  it("preserves an intentional ?agent= that is not the previous default", async () => {
    setUrl("/w/w_1/pods/pod_1?agent=agent_custom");
    agentSearchParamHolder.current = "agent_custom";
    selectedSingleAgentHolder.current = makeMention("agent_custom");

    const { rerender } = renderMentions({ defaultAgentId: "agent_a" });
    setSelectedSingleAgent.mockClear();

    rerender({
      defaultAgentId: "agent_b",
      isDefaultAgentLoading: false,
      selectedAgent: null,
    });

    // URL still owns the intentional deep link; do not strip or overwrite.
    expect(replaceMock).not.toHaveBeenCalled();
    expect(setSelectedSingleAgent).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent_b" })
    );
  });

  it("applies the Pod default on reload when ?agent= is absent", async () => {
    setUrl("/w/w_1/pods/pod_1");
    agentSearchParamHolder.current = null;

    renderMentions({ defaultAgentId: "agent_b" });

    await waitFor(() =>
      expect(setSelectedSingleAgent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "agent_b" })
      )
    );
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("leaves an intentional ?agent= alone on the initial resolve (reload)", async () => {
    setUrl("/w/w_1/pods/pod_1?agent=agent_custom");
    agentSearchParamHolder.current = "agent_custom";

    renderMentions({ defaultAgentId: "agent_b" });

    // useAgentFromSearchParam owns this path; useHandleMentions must not strip or
    // overwrite with the Pod default on first settle.
    expect(replaceMock).not.toHaveBeenCalled();
    expect(setSelectedSingleAgent).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "agent_b" })
    );
  });
});
