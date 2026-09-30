import { useUserFromSearchParam } from "@app/hooks/useUserFromSearchParam";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  searchParamHolder,
  setPendingInputText,
  setSelectedAgent,
  setSelectedSingleAgent,
  setSuppressDefaultAgent,
  userDetailsHolder,
} = vi.hoisted(() => ({
  searchParamHolder: { current: null as string | null },
  setPendingInputText: vi.fn(),
  setSelectedAgent: vi.fn(),
  setSelectedSingleAgent: vi.fn(),
  setSuppressDefaultAgent: vi.fn(),
  userDetailsHolder: {
    current: null as {
      fullName: string;
      email: string;
      image: string | null;
    } | null,
  },
}));

vi.mock("@app/lib/platform", () => ({
  useSearchParam: () => searchParamHolder.current,
}));

vi.mock("@app/lib/swr/assistants", () => ({
  useMemberDetails: () => ({
    userDetails: userDetailsHolder.current,
  }),
}));

vi.mock(
  "@app/components/assistant/conversation/input_bar/InputBarContext",
  async () => {
    const { createContext } = await import("react");
    return {
      InputBarContext: createContext({
        setPendingInputText,
        setSelectedAgent,
        setSelectedSingleAgent,
        setSuppressDefaultAgent,
      }),
    };
  }
);

describe("useUserFromSearchParam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamHolder.current = null;
    userDetailsHolder.current = null;
    window.history.replaceState(null, "", "/w/w1/conversation/new");
  });

  it("pre-fills a user mention, clears the agent, and cleans the URL", async () => {
    searchParamHolder.current = "user_123";
    userDetailsHolder.current = {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      image: null,
    };
    window.history.replaceState(
      null,
      "",
      "/w/w1/conversation/new?user=user_123&agent=agent_1"
    );

    renderHook(() => useUserFromSearchParam("w1"));

    await waitFor(() => {
      expect(setSuppressDefaultAgent).toHaveBeenCalledWith(true);
    });

    expect(setSelectedAgent).toHaveBeenCalledWith(null);
    expect(setSelectedSingleAgent).toHaveBeenCalledWith(null);
    expect(setPendingInputText).toHaveBeenCalledWith(
      ":mention_user[Ada Lovelace]{sId=user_123} ",
      { replace: true }
    );
    expect(window.location.search).toBe("");
  });

  it("does nothing until member details are available", () => {
    searchParamHolder.current = "user_123";
    userDetailsHolder.current = null;

    renderHook(() => useUserFromSearchParam("w1"));

    expect(setPendingInputText).not.toHaveBeenCalled();
    expect(setSuppressDefaultAgent).not.toHaveBeenCalled();
  });

  it("applies a given user id only once", async () => {
    searchParamHolder.current = "user_123";
    userDetailsHolder.current = {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      image: null,
    };

    const { rerender } = renderHook(() => useUserFromSearchParam("w1"));

    await waitFor(() => {
      expect(setPendingInputText).toHaveBeenCalledTimes(1);
    });

    act(() => {
      rerender();
    });

    expect(setPendingInputText).toHaveBeenCalledTimes(1);
  });
});
