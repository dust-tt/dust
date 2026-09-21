import { ManageSkillsPage } from "@app/components/pages/builder/skills/ManageSkillsPage";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { SearchSkillsResponseBody } from "@app/types/api/skills";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    isReady: true,
    pathname: "/w/workspace/builder/skills",
    asPath: "/w/workspace/builder/skills",
    query: {},
    push: vi.fn(),
    replace: vi.fn(),
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

vi.mock("@app/components/assistant/details/AgentDetailsSheet", () => ({
  AgentDetailsSheet: () => null,
}));

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

async function setup({ enabled = true } = {}) {
  const { authenticator, user } = await createResourceTest({ role: "admin" });
  const resource = await SkillFactory.create(authenticator, {
    name: "Weekly report",
    availability: "workspace_users",
    instructions: "",
  });
  const [document] = await SkillFactory.createSearchDocuments(authenticator, [
    resource,
  ]);
  const skill = toSkillListItem(document);
  const context: AuthContextValue = {
    workspace: authenticator.getNonNullableWorkspace(),
    user: user.toJSON(),
    subscription: authenticator.getNonNullableSubscription(),
    isAdmin: true,
    isManager: false,
    featureFlags: enabled ? ["skills_search"] : [],
    vizUrl: "http://localhost",
    providersHealth: null,
    workspacePermissions: await authenticator.getWorkspacePermissions(),
  };
  const search = vi
    .fn<() => Promise<SearchSkillsResponseBody>>()
    .mockResolvedValue({
      skills: [skill],
      hasMore: false,
      nextCursor: null,
    });
  const fetcherWithBody = vi.fn(async () => search());
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes(`/skills/${skill.sId}`)) {
      return {
        skill: {
          ...resource.toJSON(authenticator),
          name: "Full skill details",
          relations: {
            usage: { count: 0, agents: [], skills: [] },
            editors: [],
            editedByUser: null,
            childSkills: [],
          },
        },
      };
    }
    if (url.includes("/skills?")) {
      return { skills: [] };
    }
    if (url.endsWith("/spaces")) {
      return { spaces: [] };
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const mount = () =>
    render(
      <SWRConfig
        value={{ provider: () => new Map(), shouldRetryOnError: false }}
      >
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          <AuthContext.Provider value={context}>
            <ManageSkillsPage />
          </AuthContext.Provider>
        </FetcherProvider>
      </SWRConfig>
    );
  return { skill, context, search, fetcher, fetcherWithBody, mount };
}

describe("search-backed Manage Skills", () => {
  it("loads All by usage and fetches full details only when selected", async () => {
    const { skill, context, fetcherWithBody, fetcher, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(fetcherWithBody).toHaveBeenCalledWith([
      `/api/w/${context.workspace.sId}/skills/search`,
      {
        query: "",
        sortBy: "usage",
        status: ["active"],
        limit: 50,
        cursor: undefined,
      },
      "POST",
    ]);
    expect(fetcher).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: /Weekly report/ })
    );
    await within(await screen.findByRole("dialog")).findByRole("heading", {
      name: "Full skill details",
    });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/w/${context.workspace.sId}/skills/${skill.sId}?withRelations=true`
    );
  });

  it("requests Dust-provided skills and archived skills in their own tabs", async () => {
    const { search, fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    search.mockResolvedValue({ skills: [], hasMore: false, nextCursor: null });
    await userEvent.click(screen.getByRole("tab", { name: "Default" }));
    await screen.findByText("No skills to show.");
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.objectContaining({
        status: ["active"],
        codeDefinedOnly: true,
        sortBy: "usage",
        cursor: undefined,
      }),
      "POST",
    ]);
    await userEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        {
          query: "",
          status: ["archived"],
          sortBy: "usage",
          limit: 50,
          cursor: undefined,
        },
        "POST",
      ])
    );
  });

  it("passes cursors unchanged, preserves server order and resets pagination when searching", async () => {
    const { skill, search, fetcherWithBody, mount } = await setup();
    const cursor = "opaque-search-after";
    search.mockResolvedValueOnce({
      skills: [{ ...skill, name: "Zebra" }],
      hasMore: true,
      nextCursor: cursor,
    });
    mount();
    await screen.findByRole("button", { name: /Zebra/ });
    search.mockResolvedValue({
      skills: [{ ...skill, sId: "next", name: "Alpha" }],
      hasMore: false,
      nextCursor: "last",
    });
    await userEvent.click(screen.getByText("Load more"));
    await screen.findByRole("button", { name: /Alpha/ });
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.objectContaining({ cursor, sortBy: "usage" }),
      "POST",
    ]);
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Zebra");
    expect(rows[2]).toHaveTextContent("Alpha");

    const input = screen.getByLabelText("Search skills");
    await userEvent.type(input, "report");
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          query: "report",
          sortBy: "relevance",
          cursor: undefined,
        }),
        "POST",
      ])
    );
    expect(
      screen.queryByRole("button", { name: /Zebra/ })
    ).not.toBeInTheDocument();
    await userEvent.clear(input);
    await screen.findByRole("button", { name: /Zebra/ });
    // Returning to the same query restores its already-loaded pages from SWR.
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Zebra");
    expect(screen.getAllByRole("row")[2]).toHaveTextContent("Alpha");
  });

  it("shows loading and a retryable error without falling back to the old list", async () => {
    const { search, fetcher, mount } = await setup();
    const pending = Promise.withResolvers<SearchSkillsResponseBody>();
    search.mockReturnValueOnce(pending.promise);
    mount();
    expect(
      screen.getByRole("status", { name: "Loading skills" })
    ).toBeInTheDocument();
    await act(async () => pending.reject(new Error("Unavailable")));
    await screen.findByRole("alert");
    search.mockResolvedValue({ skills: [], hasMore: false, nextCursor: null });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No skills to show.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps the legacy page when the flag is disabled", async () => {
    const { fetcherWithBody, fetcher, mount } = await setup({ enabled: false });
    mount();
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(screen.queryByRole("tab", { name: "All" })).not.toBeInTheDocument();
    expect(fetcherWithBody).not.toHaveBeenCalled();
  });
});
