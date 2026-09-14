import { useSWRWithDefaults } from "@app/lib/swr/swr";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cache: new Map(),
  globalMutate: vi.fn(),
  localMutate: vi.fn(),
  useSWR: vi.fn(),
}));

vi.mock("swr", () => ({
  default: mocks.useSWR,
  useSWRConfig: () => ({
    cache: mocks.cache,
    mutate: mocks.globalMutate,
  }),
}));

describe("useSWRWithDefaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cache.clear();
    mocks.globalMutate.mockResolvedValue(undefined);
    mocks.localMutate.mockResolvedValue(undefined);
    mocks.useSWR.mockReturnValue({ mutate: mocks.localMutate });
  });

  it("uses the concrete key to mutate when disabled", async () => {
    const key = "/api/w/w_test/resources?view=list";

    const { result } = renderHook(() =>
      useSWRWithDefaults(key, null, { disabled: true })
    );

    await act(async () => {
      await result.current.mutate();
    });

    expect(mocks.useSWR).toHaveBeenCalledWith(
      null,
      null,
      expect.objectContaining({ disabled: true })
    );
    expect(mocks.globalMutate).toHaveBeenCalledWith(key);
    expect(mocks.localMutate).not.toHaveBeenCalled();
  });

  it("uses the concrete key to mutate matching cache entries when disabled", async () => {
    const key = "/api/w/w_test/resources?view=list";
    const relatedKey = "/api/w/w_test/resources?view=manage";
    mocks.cache.set(key, {});
    mocks.cache.set(relatedKey, {});
    mocks.cache.set("/api/w/w_test/other", {});

    const { result } = renderHook(() =>
      useSWRWithDefaults(key, null, { disabled: true })
    );

    await act(async () => {
      await result.current.mutateRegardlessOfQueryParams();
    });

    expect(mocks.useSWR).toHaveBeenCalledWith(
      null,
      null,
      expect.objectContaining({ disabled: true })
    );
    expect(mocks.globalMutate).toHaveBeenCalledWith(relatedKey);
    expect(mocks.globalMutate).toHaveBeenCalledWith(key);
    expect(mocks.globalMutate).not.toHaveBeenCalledWith("/api/w/w_test/other");
    expect(mocks.localMutate).not.toHaveBeenCalled();
  });
});
