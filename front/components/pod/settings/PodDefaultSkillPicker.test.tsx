import { PodDefaultSkillPicker } from "@app/components/pod/settings/PodDefaultSkillPicker";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
    const offset = "offset" in body ? body.offset : 0;
    const query = "query" in body ? body.query : "";
    const [sId, name] = query
      ? ["match", "Server match"]
      : offset === 200
        ? ["third", "Third skill"]
        : offset
          ? ["second", "Second skill"]
          : ["selected", "Already selected"];
    return {
      skills: [
        {
          sId,
          name,
          userFacingDescription: "",
          icon: null,
          editedBy: null,
        },
      ],
      hasMore: !query && offset !== 200,
      total: query ? 1 : 201,
      facets: {},
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
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        // Selected-only pages leave the viewport empty; other pages need scrolling.
        return this.querySelector('[role="menuitem"]') ? 1_000 : 0;
      }
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips selected-only pages, appends on scroll, and resets when searching", async () => {
    const user = userEvent.setup();
    const { fetcherWithBody, onSelect } = renderPicker();
    expect(fetcherWithBody).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Add a default skill" })
    );
    await screen.findByText("Second skill");
    expect(screen.queryByText("Already selected")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next" })
    ).not.toBeInTheDocument();
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ offset: 100, limit: 100 }),
      "POST",
    ]);

    const viewport = screen
      .getByText("Second skill")
      .closest<HTMLElement>("[data-radix-scroll-area-viewport]");
    expect(viewport).not.toBeNull();
    if (!viewport) {
      return;
    }
    fireEvent.scroll(viewport, { target: { scrollTop: 900 } });
    await screen.findByText("Third skill");
    expect(screen.getByText("Second skill")).toBeInTheDocument();
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ offset: 200, limit: 100 }),
      "POST",
    ]);
    fireEvent.scroll(viewport);
    expect(fetcherWithBody).toHaveBeenCalledTimes(3);

    fireEvent.change(screen.getByPlaceholderText("Search skills"), {
      target: { value: "ask" },
    });
    expect(screen.getByText("Second skill")).toBeInTheDocument();
    expect(screen.getByText("Third skill")).toBeInTheDocument();
    await screen.findByText("Server match");
    await waitFor(() => {
      expect(screen.queryByText("Second skill")).not.toBeInTheDocument();
      expect(screen.queryByText("Third skill")).not.toBeInTheDocument();
    });
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      `/api/w/${owner.sId}/skills/search`,
      expect.objectContaining({ query: "ask", offset: 0 }),
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
