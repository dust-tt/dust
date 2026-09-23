import { ManageSkillsPage } from "@app/components/pages/builder/skills/ManageSkillsPage";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { SearchSkillsResponseBody } from "@app/types/api/skills";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
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

vi.mock("@dust-tt/sparkle", async (importOriginal) => {
  const sparkle = await importOriginal<typeof import("@dust-tt/sparkle")>();

  return {
    ...sparkle,
    // Keep menus inside the sheet to avoid competing portal focus traps in jsdom.
    // These tests cover search refresh after mutations, not focus management.
    DropdownMenuContent: (
      props: ComponentProps<typeof sparkle.DropdownMenuContent>
    ) => <sparkle.DropdownMenuContent {...props} mountPortal={false} />,
  };
});

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

async function setup({
  searchEnabled = true,
  pageEnabled = true,
  skillStatus = "active",
}: {
  searchEnabled?: boolean;
  pageEnabled?: boolean;
  skillStatus?: SkillStatus;
} = {}) {
  const { authenticator, user } = await createResourceTest({ role: "admin" });
  const resource = await SkillFactory.create(authenticator, {
    name: "Weekly report",
    availability: "workspace_users",
    instructions: "",
    status: skillStatus,
  });
  const [document] = await SkillFactory.createSearchDocuments(authenticator, [
    resource,
  ]);
  const { sId, fullName, image } = user.toJSON();
  const skill = {
    ...toSkillListItem(authenticator, document),
    editors: [{ sId, fullName, image }],
  };
  const context: AuthContextValue = {
    workspace: authenticator.getNonNullableWorkspace(),
    user: user.toJSON(),
    subscription: authenticator.getNonNullableSubscription(),
    isAdmin: true,
    isManager: false,
    featureFlags: [],
    vizUrl: "http://localhost",
    providersHealth: null,
    workspacePermissions: await authenticator.getWorkspacePermissions(),
  };
  if (searchEnabled) {
    context.featureFlags.push("skills_search");
  }
  if (pageEnabled) {
    context.featureFlags.push("new_manage_skills_page");
  }
  const search = vi
    .fn<() => Promise<SearchSkillsResponseBody>>()
    .mockResolvedValue({
      skills: [skill],
      hasMore: false,
      nextCursor: null,
    });
  const fetcherWithBody = vi.fn(async () => search());
  const mutation = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE" || url.endsWith("/restore")) {
      await mutation();
      return {};
    }
    if (url.endsWith("/skills/import")) {
      await mutation();
      return {
        imported: [resource.toJSON(authenticator)],
        updated: [],
        skipped: [],
      };
    }
    if (url.endsWith("/skills/detect")) {
      return {
        skills: [{ name: skill.name, status: "ready", existingSkillId: null }],
      };
    }
    if (url.endsWith("/skills/import/github-connection")) {
      return { connection: null };
    }
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
    render(<ManageSkillsPage />, {
      wrapper: ({ children }) => (
        <SWRConfig
          value={{ provider: () => new Map(), shouldRetryOnError: false }}
        >
          <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
            <AuthContext.Provider value={context}>
              {children}
            </AuthContext.Provider>
          </FetcherProvider>
        </SWRConfig>
      ),
    });
  return { skill, context, search, fetcher, fetcherWithBody, mutation, mount };
}

describe("search-backed Manage Skills", () => {
  it("sorts Name, Usage and Last edited in both directions without reordering the server page", async () => {
    const { skill, search, fetcherWithBody, mount } = await setup();
    search.mockResolvedValue({
      skills: [
        { ...skill, name: "Zebra" },
        { ...skill, sId: "other-skill", name: "Alpha" },
      ],
      hasMore: false,
      nextCursor: null,
    });
    mount();
    await screen.findByRole("button", { name: /Zebra/ });
    expect(screen.getByRole("columnheader", { name: "Usage" })).toHaveAttribute(
      "aria-sort",
      "descending"
    );

    for (const { label, sortBy, orders } of [
      { label: "Name", sortBy: "name", orders: ["asc", "desc"] },
      { label: "Usage", sortBy: "usage", orders: ["desc", "asc"] },
      { label: "Last edited", sortBy: "updatedAt", orders: ["desc", "asc"] },
    ]) {
      for (const sortOrder of orders) {
        await userEvent.click(screen.getByRole("button", { name: label }));
        await waitFor(() =>
          expect(fetcherWithBody).toHaveBeenLastCalledWith([
            expect.any(String),
            expect.objectContaining({ sortBy, sortOrder, cursor: null }),
            "POST",
          ])
        );
        expect(
          screen.getByRole("columnheader", { name: label })
        ).toHaveAttribute(
          "aria-sort",
          sortOrder === "asc" ? "ascending" : "descending"
        );
        expect(screen.getAllByRole("row")[1]).toHaveTextContent("Zebra");
      }
    }
  });

  it("resets pagination when sorting, keeps existing results while loading, and can return to relevance", async () => {
    const { skill, search, fetcherWithBody, mount } = await setup();
    search.mockResolvedValueOnce({
      skills: [skill],
      hasMore: true,
      nextCursor: "next-page",
    });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    search.mockResolvedValue({
      skills: [{ ...skill, name: "Second page" }],
      hasMore: false,
      nextCursor: null,
    });
    const [, nextButton] = screen
      .getAllByRole("button", { name: "" })
      .slice(-2);
    await userEvent.click(nextButton);
    await screen.findByRole("button", { name: /Second page/ });

    const pending = Promise.withResolvers<SearchSkillsResponseBody>();
    search.mockReturnValueOnce(pending.promise);
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          sortBy: "name",
          sortOrder: "asc",
          cursor: null,
        }),
        "POST",
      ])
    );
    expect(
      screen.getByRole("button", { name: /Second page/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Loading skills" })
    ).not.toBeInTheDocument();
    search.mockResolvedValue({
      skills: [skill],
      hasMore: false,
      nextCursor: null,
    });
    await act(async () => {
      pending.resolve({ skills: [skill], hasMore: false, nextCursor: null });
    });
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.type(screen.getByLabelText("Search skills"), "report");
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          query: "report",
          sortBy: "name",
          sortOrder: "asc",
        }),
        "POST",
      ])
    );
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          query: "report",
          sortBy: "relevance",
          cursor: null,
        }),
        "POST",
      ])
    );
  });

  it("loads All by usage and fetches full details only when selected", async () => {
    const { skill, context, fetcherWithBody, fetcher, mount } = await setup();
    const { rerender } = mount();
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
        cursor: null,
        permissionFiltering: undefined,
      },
      "POST",
    ]);
    expect(fetcher).not.toHaveBeenCalled();

    const skillButton = screen.getByRole("button", { name: /Weekly report/ });
    const user = userEvent.setup();
    await user.pointer({ target: skillButton, keys: "[MouseLeft>]" });
    // A render between pointer down and up must not replace the clicked cell.
    rerender(<ManageSkillsPage />);
    expect(skillButton).toBeInTheDocument();
    await user.pointer({ keys: "[/MouseLeft]" });
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
    search.mockResolvedValue({
      skills: [],
      hasMore: false,
      nextCursor: null,
    });
    await userEvent.click(screen.getByRole("tab", { name: "Default" }));
    await screen.findByText("No skills to show.");
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.objectContaining({
        status: ["active"],
        codeDefinedOnly: true,
        sortBy: "usage",
        cursor: null,
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
          cursor: null,
          permissionFiltering: undefined,
        },
        "POST",
      ])
    );
  });

  it("refreshes All after importing a skill", async () => {
    const { skill, search, mutation, mount } = await setup();
    search.mockResolvedValue({ skills: [], hasMore: false, nextCursor: null });
    mutation.mockImplementation(async () => {
      search.mockResolvedValue({
        skills: [skill],
        hasMore: false,
        nextCursor: null,
      });
    });
    mount();
    await screen.findByText("No skills to show.");

    await userEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "From existing" })
    );
    const dialog = await screen.findByRole("dialog", { name: "Import skills" });
    await userEvent.type(
      within(dialog).getByPlaceholderText("https://github.com/owner/repo"),
      "https://github.com/dust-tt/skills"
    );
    await within(dialog).findByText(skill.name, {}, { timeout: 3_000 });
    const importButton = within(dialog).getByRole("button", {
      name: "Import",
    });
    await waitFor(() => expect(importButton).toBeEnabled());
    await userEvent.click(importButton);

    await screen.findByRole("button", { name: /Weekly report/ });
    expect(mutation).toHaveBeenCalledOnce();
  });

  it.each([
    {
      status: "active",
      tab: "All",
      action: "Archive",
      confirm: "Archive for everyone",
    },
    {
      status: "archived",
      tab: "Archived",
      action: "Restore",
      confirm: "Restore the skill",
    },
  ] satisfies {
    status: SkillStatus;
    tab: string;
    action: string;
    confirm: string;
  }[])("refreshes $tab after $action from the details sheet", async ({
    status,
    tab,
    action,
    confirm,
  }) => {
    const { search, mutation, mount } = await setup({ skillStatus: status });
    mutation.mockImplementation(async () => {
      search.mockResolvedValue({
        skills: [],
        hasMore: false,
        nextCursor: null,
      });
    });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    if (tab === "Archived") {
      await userEvent.click(screen.getByRole("tab", { name: tab }));
    }
    await userEvent.click(
      await screen.findByRole("button", { name: /Weekly report/ })
    );
    const sheet = await screen.findByRole("dialog");
    await within(sheet).findByRole("heading", { name: "Full skill details" });

    if (action === "Archive") {
      await userEvent.click(
        within(sheet).getByRole("button", { name: "Skill options" })
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: action })
      );
    } else {
      await userEvent.click(
        within(sheet).getByRole("button", { name: action })
      );
    }
    const confirmation = await screen.findByRole("dialog", {
      name:
        action === "Archive" ? "Archiving the skill" : "Restoring the skill",
    });
    await userEvent.click(
      within(confirmation).getByRole("button", { name: confirm })
    );

    await screen.findByText("No skills to show.");
    expect(
      screen.queryByRole("button", { name: /Weekly report/ })
    ).not.toBeInTheDocument();
    expect(mutation).toHaveBeenCalledOnce();
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
    const [, nextPageButton] = screen
      .getAllByRole("button", { name: "" })
      .slice(-2);
    await userEvent.click(nextPageButton);
    await screen.findByRole("button", { name: /Alpha/ });
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.objectContaining({ cursor, sortBy: "usage" }),
      "POST",
    ]);
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Alpha");
    expect(
      screen.queryByRole("button", { name: /Zebra/ })
    ).not.toBeInTheDocument();
    const [previousPageButton, lastPageButton] = screen
      .getAllByRole("button", { name: "" })
      .slice(-2);
    expect(lastPageButton).toBeDisabled();

    search.mockResolvedValue({
      skills: [{ ...skill, name: "Zebra" }],
      hasMore: true,
      nextCursor: cursor,
    });
    await userEvent.click(previousPageButton);
    await screen.findByRole("button", { name: /Zebra/ });
    expect(
      screen.queryByRole("button", { name: /Alpha/ })
    ).not.toBeInTheDocument();

    search.mockResolvedValue({
      skills: [{ ...skill, sId: "next", name: "Alpha" }],
      hasMore: false,
      nextCursor: "last",
    });
    const [, nextButton] = screen
      .getAllByRole("button", { name: "" })
      .slice(-2);
    await userEvent.click(nextButton);
    await screen.findByRole("button", { name: /Alpha/ });
    search.mockResolvedValue({
      skills: [skill],
      hasMore: false,
      nextCursor: null,
    });

    const input = screen.getByLabelText("Search skills");
    await userEvent.type(input, "report");
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          query: "report",
          sortBy: "relevance",
          cursor: null,
        }),
        "POST",
      ])
    );
    expect(
      screen.queryByRole("button", { name: /Zebra/ })
    ).not.toBeInTheDocument();
    search.mockResolvedValue({
      skills: [{ ...skill, name: "Zebra" }],
      hasMore: true,
      nextCursor: cursor,
    });
    await userEvent.clear(input);
    await screen.findByRole("button", { name: /Zebra/ });
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Zebra");
    expect(
      screen.queryByRole("button", { name: /Alpha/ })
    ).not.toBeInTheDocument();
  });

  it("keeps the current table visible and busy while a new search loads", async () => {
    const { skill, search, fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    const table = screen.getByRole("table");

    const pending = Promise.withResolvers<SearchSkillsResponseBody>();
    search.mockReturnValueOnce(pending.promise);
    await userEvent.type(screen.getByLabelText("Search skills"), "report");
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({ query: "report" }),
        "POST",
      ])
    );

    expect(screen.getByRole("table")).toBe(table);
    expect(table.querySelector("tbody")).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("button", { name: /Weekly report/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", { name: "Loading skills" })
    ).not.toBeInTheDocument();

    await act(async () => {
      pending.resolve({
        skills: [{ ...skill, name: "New report" }],
        hasMore: false,
        nextCursor: null,
      });
    });
    await screen.findByRole("button", { name: /New report/ });
    expect(screen.getByRole("table")).toBe(table);
    expect(table.querySelector("tbody")).not.toHaveAttribute("aria-busy");
    expect(
      screen.queryByRole("button", { name: /Weekly report/ })
    ).not.toBeInTheDocument();
  });

  it("shows a table skeleton and a retryable error without falling back to the old list", async () => {
    const { search, fetcher, mount } = await setup();
    const pending = Promise.withResolvers<SearchSkillsResponseBody>();
    search.mockReturnValueOnce(pending.promise);
    mount();
    const loading = screen.getByRole("status", { name: "Loading skills" });
    expect(within(loading).getByRole("table")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(
      within(loading).getByRole("columnheader", { name: "Name" })
    ).toBeInTheDocument();
    expect(
      within(loading).getByRole("columnheader", { name: "Usage" })
    ).toBeInTheDocument();
    expect(screen.queryByText("No skills to show.")).not.toBeInTheDocument();
    await act(async () => pending.reject(new Error("Unavailable")));
    await screen.findByRole("alert");
    search.mockResolvedValue({
      skills: [],
      hasMore: false,
      nextCursor: null,
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No skills to show.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { searchEnabled: false, pageEnabled: false },
    { searchEnabled: true, pageEnabled: false },
    { searchEnabled: false, pageEnabled: true },
  ])("keeps the legacy page with searchEnabled=$searchEnabled and pageEnabled=$pageEnabled", async (flags) => {
    const { fetcherWithBody, fetcher, mount } = await setup(flags);
    mount();
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(screen.queryByRole("tab", { name: "All" })).not.toBeInTheDocument();
    expect(fetcherWithBody).not.toHaveBeenCalled();
  });
});
