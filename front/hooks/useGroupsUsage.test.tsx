import { useSharedUsageLimitGroupColumn } from "@app/hooks/useGroupsUsage";
import type { FetcherFn } from "@app/lib/swr/fetcher";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";

const owner = LightWorkspaceFactory.build();

describe("useSharedUsageLimitGroupColumn", () => {
  it("hides the column when the workspace's contract does not support group budgets", async () => {
    const fetcher = vi.fn<FetcherFn>();
    fetcher.mockRejectedValue(
      new Error("Shared usage limits are not available for this workspace.")
    );
    const swrConfig = { provider: () => new Map(), shouldRetryOnError: false };
    const wrapper = ({ children }: PropsWithChildren) => (
      <SWRConfig value={swrConfig}>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={vi.fn()}>
          {children}
        </FetcherProvider>
      </SWRConfig>
    );

    const { result } = renderHook(
      () =>
        useSharedUsageLimitGroupColumn({
          owner,
          enabled: true,
          disabled: false,
        }),
      { wrapper }
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    await waitFor(() =>
      expect(result.current.showSharedUsageLimitGroupColumn).toBe(false)
    );
  });
});
