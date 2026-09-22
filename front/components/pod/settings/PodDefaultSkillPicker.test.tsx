import { PodDefaultSkillPicker } from "@app/components/pod/settings/PodDefaultSkillPicker";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const feature = vi.hoisted(() => ({ enabled: true }));
vi.mock(import("@app/lib/auth/AuthContext"), () => ({
  useFeatureFlags: () => ({
    featureFlags: [],
    hasFeature: () => feature.enabled,
  }),
}));

const owner = LightWorkspaceFactory.build();

function renderPicker() {
  const onSelect = vi.fn();
  const fetcherWithBody = vi.fn<FetcherWithBodyFn>(async ([, body]) => {
    const cursor = "cursor" in body ? body.cursor : null;
    const query = "query" in body ? body.query : "";
    return {
      skills: [
        {
          sId: query ? "match" : cursor ? "second" : "selected",
          name: query
            ? "Server match"
            : cursor
              ? "Second skill"
              : "Already selected",
          userFacingDescription: "",
          icon: null,
          editedBy: null,
        },
      ],
      hasMore: !query && !cursor,
      nextCursor: query || cursor ? null : "opaque-cursor",
    };
  });
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FetcherProvider fetcher={vi.fn()} fetcherWithBody={fetcherWithBody}>
        <PodDefaultSkillPicker
          owner={owner}
          skills={[]}
          selectedSkillIds={["selected"]}
          onSelect={onSelect}
          triggerClassName=""
        />
      </FetcherProvider>
    </SWRConfig>
  );
  return { fetcherWithBody, onSelect };
}

describe("PodDefaultSkillPicker", () => {
  beforeAll(() => {
    // Radix relies on browser APIs that jsdom does not implement.
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
  });
  beforeEach(() => {
    feature.enabled = true;
  });

  it("can page past selected skills, then searches from the first page", async () => {
    const user = userEvent.setup();
    const { fetcherWithBody, onSelect } = renderPicker();
    expect(fetcherWithBody).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Add a default skill" })
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled()
    );
    expect(screen.queryByText("Already selected")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Second skill");
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ cursor: "opaque-cursor" }),
      "POST",
    ]);

    fireEvent.change(screen.getByPlaceholderText("Search skills"), {
      target: { value: "ask" },
    });
    await screen.findByText("Server match");
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ query: "ask", cursor: null }),
      "POST",
    ]);
    fireEvent.click(screen.getByText("Server match"));
    expect(onSelect).toHaveBeenCalledWith("match");
  });

  it("does not call search with the flag off", async () => {
    feature.enabled = false;
    const user = userEvent.setup();
    const { fetcherWithBody } = renderPicker();
    await user.click(
      screen.getByRole("button", { name: "Add a default skill" })
    );
    await screen.findByText("No more skills to add");
    expect(fetcherWithBody).not.toHaveBeenCalled();
  });
});
