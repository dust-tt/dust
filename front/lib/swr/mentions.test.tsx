import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherFn, FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { useMentionSuggestions } from "@app/lib/swr/mentions";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

const owner = LightWorkspaceFactory.build({ sId: "workspace_1" });
const searchUrl = "/api/w/workspace_1/assistant/agent_configurations/search";
const searchResponse = {
  agents: [
    {
      sId: "agent_2",
      name: "Alpha Sales",
      description: "Sales reporting",
      pictureUrl: "/agent_2.png",
    },
    {
      sId: "agent_1",
      name: "Sales",
      description: "Sales assistant",
      pictureUrl: "/agent_1.png",
    },
  ],
  total: 2,
  hasMore: false,
  facets: {},
};
const userResponse = {
  suggestions: [
    {
      id: "user_1",
      type: "user",
      label: "Sales teammate",
      description: "teammate@dust.tt",
      pictureUrl: "/user_1.png",
      isParticipant: true,
    },
  ],
};

interface WrapperProps {
  children: ReactNode;
}

function setup() {
  const fetcher = vi.fn<FetcherFn>().mockResolvedValue(userResponse);
  const fetcherWithBody = vi
    .fn<FetcherWithBodyFn>()
    .mockResolvedValue(searchResponse);
  const swrConfig = {
    provider: () => new Map(),
    shouldRetryOnError: false,
  };
  function Wrapper({ children }: WrapperProps) {
    return (
      <SWRConfig value={swrConfig}>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          {children}
        </FetcherProvider>
      </SWRConfig>
    );
  }
  return { fetcher, fetcherWithBody, wrapper: Wrapper };
}

describe("useMentionSuggestions", () => {
  it.each([
    "",
    "sales",
  ])("requests alphabetical agents for query %j alongside participants", async (query) => {
    const { fetcher, fetcherWithBody, wrapper } = setup();
    const { result, rerender } = renderHook(
      () =>
        useMentionSuggestions({
          owner,
          conversationId: "conversation_1",
          query,
          select: { agents: true, users: true },
          includeCurrentUser: true,
        }),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetcherWithBody).toHaveBeenCalledWith([
      searchUrl,
      expect.objectContaining({
        query,
        limit: 20,
        sortBy: "name",
        sortOrder: "asc",
        permissionFiltering: "strict",
      }),
      "POST",
    ]);
    expect(fetcher).toHaveBeenCalledWith(
      `/api/w/workspace_1/assistant/conversations/conversation_1/mentions/suggestions?query=${query}&select=users&current=true`
    );
    expect(result.current.suggestions.map((mention) => mention.id)).toEqual([
      "user_1",
      "agent_2",
      "agent_1",
    ]);
    expect(result.current.suggestions[1]).toEqual({
      id: "agent_2",
      type: "agent",
      label: "Alpha Sales",
      description: "Sales reporting",
      pictureUrl: "/agent_2.png",
    });
    const suggestions = result.current.suggestions;
    rerender();
    expect(result.current.suggestions).toBe(suggestions);
  });

  it("fetches only selected types and clears retained results when disabled", async () => {
    const { fetcher, fetcherWithBody, wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ agents, users, disabled }) =>
        useMentionSuggestions({
          owner,
          conversationId: null,
          spaceId: "space_1",
          select: { agents, users },
          disabled,
        }),
      {
        wrapper,
        initialProps: { agents: false, users: false, disabled: false },
      }
    );

    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(fetcherWithBody).not.toHaveBeenCalled();

    rerender({ agents: true, users: false, disabled: false });
    await waitFor(() => expect(result.current.suggestions).toHaveLength(2));
    expect(fetcher).not.toHaveBeenCalled();
    expect(fetcherWithBody).toHaveBeenCalledTimes(1);

    rerender({ agents: false, users: true, disabled: false });
    await waitFor(() =>
      expect(result.current.suggestions.map((mention) => mention.id)).toEqual([
        "user_1",
      ])
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/api/w/workspace_1/assistant/mentions/suggestions?query=&select=users&spaceId=space_1"
    );
    expect(fetcherWithBody).toHaveBeenCalledTimes(1);

    rerender({ agents: true, users: true, disabled: true });
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcherWithBody).toHaveBeenCalledTimes(1);
  });

  it("debounces agent queries and keeps user mentions available if search fails", async () => {
    const { fetcherWithBody, wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ query }) =>
        useMentionSuggestions({
          owner,
          conversationId: null,
          query,
          select: { agents: true, users: true },
        }),
      { wrapper, initialProps: { query: "" } }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    fetcherWithBody.mockRejectedValue(new Error("Search unavailable"));
    rerender({ query: "s" });
    rerender({ query: "sales" });
    expect(result.current.isLoading).toBe(true);
    expect(fetcherWithBody).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(fetcherWithBody).toHaveBeenCalledTimes(2);
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      searchUrl,
      expect.objectContaining({ query: "sales" }),
      "POST",
    ]);
    expect(
      result.current.suggestions.some((mention) => mention.id === "user_1")
    ).toBe(true);
  });
});
