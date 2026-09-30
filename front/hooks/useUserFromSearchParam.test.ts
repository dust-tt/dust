import { useUserFromSearchParam } from "@app/hooks/useUserFromSearchParam";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  replaceMock,
  searchParamHolder,
  setPendingInputText,
  setSelectedAgent,
  setSelectedSingleAgent,
  setSuppressDefaultAgent,
  userDetailsHolder,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
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
  useAppRouter: () => ({ replace: replaceMock }),
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

  it("clears the agent immediately when ?user= appears, before details load", () => {
    searchParamHolder.current = "user_123";
    userDetailsHolder.current = null;

    renderHook(() => useUserFromSearchParam("w1"));

    expect(setSuppressDefaultAgent).toHaveBeenCalledWith(true);
    expect(setSelectedAgent).toHaveBeenCalledWith(null);
    expect(setSelectedSingleAgent).toHaveBeenCalledWith(null);
    expect(setPendingInputText).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("pre-fills a user mention and cleans user/agent from the URL via the router", async () => {
    searchParamHolder.current = "user_123";
    userDetailsHolder.current = {
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      image: null,
    };
    window.history.replaceState(
      null,
      "",
      "/w/w1/conversation/new?user=user_123&agent=dust#?selectedTab=favorites"
    );

    renderHook(() => useUserFromSearchParam("w1"));

    await waitFor(() => {
      expect(setPendingInputText).toHaveBeenCalledWith(
        ":mention_user[Ada Lovelace]{sId=user_123} ",
        { replace: true }
      );
    });

    expect(replaceMock).toHaveBeenCalledWith(
      "/w/w1/conversation/new#?selectedTab=favorites"
    );
  });

  it("re-applies after ?user= is cleared and set again with the same id", async () => {
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

    searchParamHolder.current = null;
    act(() => {
      rerender();
    });

    searchParamHolder.current = "user_123";
    act(() => {
      rerender();
    });

    await waitFor(() => {
      expect(setPendingInputText).toHaveBeenCalledTimes(2);
    });
    expect(setSuppressDefaultAgent).toHaveBeenCalledWith(true);
  });
});
