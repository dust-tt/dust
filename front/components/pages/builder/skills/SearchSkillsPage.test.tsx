import { ManageSkillsPage } from "@app/components/pages/builder/skills/ManageSkillsPage";
import { SkillsDataTable } from "@app/components/poke/skills/table";
import { ArchiveSkillDialog } from "@app/components/skills/ArchiveSkillDialog";
import { ImportSkillsDialog } from "@app/components/skills/import/ImportSkillsDialog";
import { RestoreSkillDialog } from "@app/components/skills/RestoreSkillDialog";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewTypeFactory } from "@app/tests/utils/MCPServerViewTypeFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { SearchSkillsResponseBody } from "@app/types/api/skills";
import type { SkillStatus } from "@app/types/assistant/skill_configuration";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
import type { MembershipRoleType } from "@app/types/memberships";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  for (const observer of ["ResizeObserver", "IntersectionObserver"]) {
    vi.stubGlobal(
      observer,
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  }
});

const push = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    isReady: true,
    pathname: "/w/workspace/builder/skills",
    asPath: "/w/workspace/builder/skills",
    query: {},
    push,
    replace: vi.fn(),
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

interface BatchAvailabilityDialogMockProps {
  action: { availability: string };
  onConfirm: () => Promise<void>;
}

vi.mock("@app/components/skills/SkillsBatchEdit", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@app/components/skills/SkillsBatchEdit")
  >()),
  BatchAvailabilityDialog: ({
    action,
    onConfirm,
  }: BatchAvailabilityDialogMockProps) => (
    <button type="button" onClick={() => void onConfirm()}>
      Confirm {action.availability}
    </button>
  ),
}));

afterEach(() => {
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

async function setup({
  skillStatus = "active",
  role = "admin",
}: {
  skillStatus?: SkillStatus;
  role?: MembershipRoleType;
} = {}) {
  const { authenticator, user } = await createResourceTest({ role });
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
    isFavorite: false,
  };
  const fullSkill = {
    ...resource.toJSON(authenticator),
    name: "Full skill details",
    relations: {
      usage: { count: 0, agents: [], skills: [] },
      editors: [],
      editedByUser: null,
      childSkills: [],
    },
  };
  const context: AuthContextValue = {
    workspace: authenticator.getNonNullableWorkspace(),
    user: user.toJSON(),
    subscription: authenticator.getNonNullableSubscription(),
    isAdmin: role === "admin",
    isManager: false,
    featureFlags: [],
    vizUrl: "http://localhost",
    providersHealth: null,
    workspacePermissions: await authenticator.getWorkspacePermissions(),
  };
  const search = vi
    .fn<() => Promise<SearchSkillsResponseBody>>()
    .mockResolvedValue({
      skills: [skill],
      total: 1,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });
  const fetcherWithBody = vi.fn(async (..._args: unknown[]) => search());
  const mutation = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const serverView = MCPServerViewTypeFactory.build({ name: "Slack" });
  const otherSpaceServerView = MCPServerViewTypeFactory.build({
    name: "Slack",
    spaceId: "sp_2",
    server: serverView.server,
  });
  const facetSearch = vi
    .fn<(body: object) => Promise<SearchSkillsResponseBody>>()
    .mockResolvedValue({
      skills: [],
      total: 1,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {
        availability: SKILL_AVAILABILITIES.map((availability) => ({
          availability,
          count: 1,
        })),
        editors: [{ sId, fullName, image, count: 1 }],
        mcpServerViews: [serverView, otherSpaceServerView].map((view) => ({
          sId: view.sId,
          mcpServerId: view.server.sId,
          name: "Slack",
          icon: view.server.icon,
          count: 1,
        })),
      },
    });
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/mcp")) {
      return {
        success: true,
        servers: [
          { ...serverView.server, views: [serverView, otherSpaceServerView] },
        ],
      };
    }
    if (
      init?.method === "DELETE" ||
      url.endsWith("/restore") ||
      url.endsWith("/skills/availability")
    ) {
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
      return { skill: fullSkill };
    }
    if (url.includes("/skills?")) {
      return { skills: [] };
    }
    if (url.endsWith("/spaces")) {
      return { spaces: [] };
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const mount = (ui = <ManageSkillsPage />) =>
    render(ui, {
      wrapper: ({ children }) => (
        <SWRConfig
          value={{ provider: () => new Map(), shouldRetryOnError: false }}
        >
          <FetcherProvider
            fetcher={fetcher}
            fetcherWithBody={([url, body, method]) =>
              "limit" in body && body.limit === 0
                ? facetSearch(body)
                : fetcherWithBody([url, body, method])
            }
          >
            <AuthContext.Provider value={context}>
              {children}
            </AuthContext.Provider>
          </FetcherProvider>
        </SWRConfig>
      ),
    });
  return {
    skill,
    fullSkill,
    context,
    search,
    fetcher,
    fetcherWithBody,
    facetSearch,
    mutation,
    mount,
    mcpServerViewIds: [serverView.sId, otherSpaceServerView.sId],
  };
}

describe("search-backed Manage Skills", () => {
  it("applies hidden skills from the filter popover and clears the active chip", async () => {
    const { fetcherWithBody, facetSearch, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Hidden skills" })
    );
    await waitFor(() =>
      expect(facetSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          permissionFiltering: "redact_unreadable",
          searchType: "name",
        })
      )
    );
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.objectContaining({ permissionFiltering: undefined }),
      "POST",
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("checkbox", { name: "Hidden skills" })
    ).not.toBeChecked();
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Hidden skills" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          permissionFiltering: "redact_unreadable",
          searchType: "name",
        }),
        "POST",
      ])
    );
    expect(screen.getByText("Hidden skills")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(screen.queryByText("Hidden skills")).not.toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("checkbox", { name: "Hidden skills" })
    ).not.toBeChecked();
  });

  it("does not offer hidden skills to non-admins", async () => {
    const { fetcherWithBody, mount } = await setup({ role: "user" });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.queryByRole("checkbox", { name: "Hidden skills" })
    ).not.toBeInTheDocument();
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.objectContaining({ permissionFiltering: undefined }),
      "POST",
    ]);
  });

  it("sorts Name, Usage and Last edited in both directions without reordering the server page", async () => {
    const { skill, search, fetcherWithBody, mount } = await setup();
    search.mockResolvedValue({
      skills: [
        { ...skill, name: "Zebra" },
        { ...skill, sId: "other-skill", name: "Alpha" },
      ],
      total: 2,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });
    mount();
    await screen.findByRole("button", { name: /Zebra/ });
    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
        .filter(Boolean)
    ).toEqual(["Name", "Availability", "Usage", "Editors", "Last edited"]);
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
            expect.objectContaining({ sortBy, sortOrder, offset: 0 }),
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
      total: 51,
      hasMore: true,
      isFavoritesOnly: false,
      facets: {},
    });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    search.mockResolvedValue({
      skills: [{ ...skill, name: "Second page" }],
      total: 51,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
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
          offset: 0,
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
      total: 1,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });
    await act(async () => {
      pending.resolve({
        skills: [skill],
        total: 1,
        hasMore: false,
        isFavoritesOnly: false,
        facets: {},
      });
    });
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.type(screen.getByLabelText("Search skills"), "report");
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          query: "report",
          searchType: "name",
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
          searchType: "name",
          sortBy: "relevance",
          offset: 0,
        }),
        "POST",
      ])
    );
  });

  it("starts text search at three characters", async () => {
    const { fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    const input = screen.getByLabelText("Search skills");
    await userEvent.type(input, "re");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    for (const [request] of fetcherWithBody.mock.calls) {
      expect(request).toEqual([
        expect.any(String),
        expect.objectContaining({ query: "" }),
        "POST",
      ]);
    }

    await userEvent.type(input, "p");
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({ query: "rep" }),
        "POST",
      ])
    );
  });

  it("applies filters together, keeps them across tabs, and clears the chips", async () => {
    const { context, fetcher, fetcherWithBody, mcpServerViewIds, mount } =
      await setup();
    const editorIds = [context.user.sId];
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    const initialSearchCount = fetcherWithBody.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Members" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Members and agents" })
    );
    await userEvent.click(screen.getByRole("tab", { name: "Editors" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: `${context.user.fullName} (You)` })
    );
    expect(fetcher).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("tab", { name: "Tools" }));
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Slack" })
    );
    expect(fetcherWithBody).toHaveBeenCalledTimes(initialSearchCount);

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          status: ["active"],
          availability: ["workspace_users", "users_and_agents"],
          mcpServerViewIds,
          editorIds,
          offset: 0,
        }),
        "POST",
      ])
    );
    expect(screen.getByText("Tool")).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(
      screen.getByText(`${context.user.fullName} (You)`)
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(3);

    await userEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          status: ["archived"],
          availability: ["workspace_users", "users_and_agents"],
          mcpServerViewIds,
          editorIds,
        }),
        "POST",
      ])
    );

    // The first chip is availability; removing it preserves the other filters.
    await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        {
          query: "",
          searchType: "name",
          status: ["archived"],
          mcpServerViewIds,
          editorIds,
          sortBy: "usage",
          limit: 50,
          offset: 0,
          permissionFiltering: undefined,
        },
        "POST",
      ])
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        {
          query: "",
          searchType: "name",
          status: ["archived"],
          sortBy: "usage",
          limit: 50,
          offset: 0,
          permissionFiltering: undefined,
        },
        "POST",
      ])
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove" })
      ).not.toBeInTheDocument()
    );
    // Clearing the editor filter offers its preset again.
    expect(
      screen.getByRole("button", {
        name: `Editor is ${context.user.fullName} (You)`,
      })
    ).toBeInTheDocument();
  });

  it("lists only the filter options held by matching skills, narrowed by the other selections", async () => {
    const { context, facetSearch, fetcherWithBody, mount } = await setup();
    facetSearch.mockResolvedValue({
      skills: [],
      total: 1,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {
        availability: [{ availability: "workspace_users", count: 1 }],
        editors: [],
        mcpServerViews: [
          {
            sId: "view",
            mcpServerId: "server",
            name: "Slack",
            icon: "SlackLogo",
            count: 1,
          },
        ],
        spaces: [
          { sId: "global", name: "Workspace", kind: "global", count: 1 },
          { sId: "finance", name: "Finance", kind: "regular", count: 1 },
        ],
      },
    });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    await userEvent.type(
      screen.getByPlaceholderText("Search for skills"),
      "Week"
    );

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Members" })
    );
    expect(
      screen.queryByRole("checkbox", { name: "Editors only" })
    ).not.toBeInTheDocument();
    expect(facetSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: "Week",
        searchType: "name",
        status: ["active"],
        facets: ["availability"],
      })
    );
    expect(facetSearch.mock.lastCall?.[0]).not.toHaveProperty("availability");

    await userEvent.click(screen.getByRole("tab", { name: "Editors" }));
    await waitFor(() =>
      expect(facetSearch).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: "Week",
          searchType: "name",
          availability: ["workspace_users"],
          facets: ["editors"],
        })
      )
    );
    expect(
      screen.queryByRole("checkbox", { name: `${context.user.fullName} (You)` })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Tools" }));
    expect(
      await screen.findByRole("checkbox", { name: "Slack" })
    ).toBeInTheDocument();
    expect(facetSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        availability: ["workspace_users"],
        facets: ["mcpServerViews"],
      })
    );

    await userEvent.click(screen.getByRole("tab", { name: "Spaces" }));
    expect(
      await screen.findByRole("checkbox", { name: GLOBAL_SPACE_NAME })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Finance" }));
    expect(facetSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        availability: ["workspace_users"],
        facets: ["spaces"],
      })
    );
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          availability: ["workspace_users"],
          spaceIds: ["finance"],
        }),
        "POST",
      ])
    );
  });

  it("marks retained filter options as updating while their facets reload", async () => {
    const { facetSearch, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("tab", { name: "Tools" }));
    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Slack" })
    );
    let resolveFacets: (response: SearchSkillsResponseBody) => void = () => {};
    facetSearch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFacets = resolve;
        })
    );
    await userEvent.click(screen.getByRole("tab", { name: "Availability" }));

    expect(await screen.findByText("Updating…")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Members" })
    ).toBeInTheDocument();
    await act(async () =>
      resolveFacets({
        skills: [],
        total: 1,
        hasMore: false,
        isFavoritesOnly: false,
        facets: {
          availability: [{ availability: "workspace_users", count: 1 }],
        },
      })
    );
    await waitFor(() =>
      expect(screen.queryByText("Updating…")).not.toBeInTheDocument()
    );
  });

  it("discards unapplied filter selections when the panel is reopened", async () => {
    const { fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    const initialSearchCount = fetcherWithBody.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Editors only" })
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetcherWithBody).toHaveBeenCalledTimes(initialSearchCount);

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("checkbox", { name: "Editors only" })
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Members" })).not.toBeChecked();
  });

  it("resets pagination when filters change", async () => {
    const { skill, search, fetcherWithBody, mount } = await setup();
    search.mockResolvedValue({
      skills: [skill],
      total: 51,
      hasMore: true,
      isFavoritesOnly: false,
      facets: {},
    });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    const [, nextPageButton] = screen
      .getAllByRole("button", { name: "" })
      .slice(-2);
    await userEvent.click(nextPageButton);
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({ offset: 50 }),
        "POST",
      ])
    );

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Members" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          availability: ["workspace_users"],
          offset: 0,
        }),
        "POST",
      ])
    );
  });

  it("loads Workspace by usage and fetches full details only when selected", async () => {
    const { skill, context, fetcherWithBody, fetcher, mount } = await setup();
    const { rerender } = mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    expect(screen.getByRole("tab", { name: "Workspace" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(fetcherWithBody).toHaveBeenCalledWith([
      `/api/w/${context.workspace.sId}/skills/search`,
      {
        query: "",
        searchType: "name",
        sortBy: "usage",
        status: ["active"],
        codeDefinedOnly: false,
        limit: 50,
        offset: 0,
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

  it("requests Dust-provided and archived skills in their own tabs", async () => {
    const { search, fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    search.mockResolvedValue({
      skills: [],
      total: 0,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });
    expect(
      screen.queryByRole("tab", { name: "Editable" })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
    await screen.findByText("No skills to show.");
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.objectContaining({
        status: ["active"],
        codeDefinedOnly: true,
        sortBy: "usage",
        offset: 0,
      }),
      "POST",
    ]);
    await userEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        {
          query: "",
          searchType: "name",
          status: ["archived"],
          sortBy: "usage",
          limit: 50,
          offset: 0,
          permissionFiltering: undefined,
        },
        "POST",
      ])
    );
  });

  it("refreshes Workspace after importing a skill", async () => {
    const { skill, context, search, mutation, mount } = await setup();
    search.mockResolvedValue({
      skills: [],
      total: 0,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });
    mutation.mockImplementation(async () => {
      search.mockResolvedValue({
        skills: [skill],
        total: 1,
        hasMore: false,
        isFavoritesOnly: false,
        facets: {},
      });
    });
    // Test import-driven cache refresh without the dropdown-to-dialog focus transition.
    function PageWithImport() {
      const [isOpen, setIsOpen] = useState(true);

      return (
        <>
          <ManageSkillsPage />
          {isOpen && (
            <ImportSkillsDialog
              owner={context.workspace}
              onClose={() => setIsOpen(false)}
            />
          )}
        </>
      );
    }

    mount(<PageWithImport />);
    await screen.findByText("No skills to show.");
    const dialog = await screen.findByRole("dialog", { name: "Import skills" });
    await userEvent.type(
      within(dialog).getByPlaceholderText("https://github.com/owner/repo"),
      "https://github.com/dust-tt/skills"
    );
    const importButton = within(dialog).getByRole("button", {
      name: "Import",
    });
    await waitFor(() => expect(importButton).toBeEnabled(), {
      timeout: 3_000,
    });
    await userEvent.click(importButton);

    await screen.findByRole("button", { name: /Weekly report/ });
    expect(mutation).toHaveBeenCalledOnce();
  });

  it.each([
    {
      status: "active",
      tab: "Workspace",
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
  }[])(
    "refreshes $tab after $action from the confirmation dialog",
    async ({ status, tab, action, confirm }) => {
      const { fullSkill, context, search, mutation, mount } = await setup({
        skillStatus: status,
      });
      mutation.mockImplementation(async () => {
        search.mockResolvedValue({
          skills: [],
          total: 0,
          hasMore: false,
          isFavoritesOnly: false,
          facets: {},
        });
      });
      const ConfirmationDialog =
        action === "Archive" ? ArchiveSkillDialog : RestoreSkillDialog;

      // Test mutation-driven cache refresh without the nested menu/sheet focus traps.
      function PageWithConfirmation() {
        const [isOpen, setIsOpen] = useState(false);

        return (
          <>
            <ManageSkillsPage />
            <button onClick={() => setIsOpen(true)}>{action}</button>
            <ConfirmationDialog
              owner={context.workspace}
              skill={fullSkill}
              isOpen={isOpen}
              onClose={() => setIsOpen(false)}
            />
          </>
        );
      }

      mount(<PageWithConfirmation />);
      await screen.findByRole("button", { name: /Weekly report/ });
      if (tab === "Archived") {
        await userEvent.click(screen.getByRole("tab", { name: tab }));
      }
      await userEvent.click(screen.getByRole("button", { name: action }));
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
    }
  );

  it("keeps the selection across pages and updates its availability in batch", async () => {
    const { skill, search, fetcher, mutation, mount } = await setup();
    search.mockResolvedValueOnce({
      skills: [skill],
      total: 60,
      hasMore: true,
      isFavoritesOnly: false,
      facets: {},
    });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select Weekly report" })
    );
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set availability" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument();
    expect(screen.queryByText(/Select all/)).not.toBeInTheDocument();

    search.mockResolvedValue({
      skills: [{ ...skill, sId: "second", name: "Second page" }],
      total: 60,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await screen.findByRole("button", { name: /Second page/ });
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select Second page" })
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Set availability" })
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Editors only" })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Confirm editors" })
    );

    await waitFor(() => expect(mutation).toHaveBeenCalled());
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringMatching(/\/skills\/availability$/),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          skillIds: [skill.sId, "second"],
          availability: "editors",
        }),
      })
    );
    await waitFor(() =>
      expect(screen.queryByText(/^\d+ selected$/)).not.toBeInTheDocument()
    );
  });

  it("offers selection only on the active skills the user administrates", async () => {
    const { skill, search, mount } = await setup();
    search.mockResolvedValue({
      skills: [
        skill,
        {
          ...skill,
          sId: "not-mine",
          name: "Not mine",
          canAdministrate: false,
        },
      ],
      total: 2,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    expect(
      screen.getByRole("checkbox", { name: "Select Weekly report" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Select Not mine" })
    ).not.toBeInTheDocument();
  });

  it("requests page offsets from arrows and page numbers, preserves server order and resets pagination when searching", async () => {
    const { skill, search, fetcherWithBody, mount } = await setup();
    const firstPage = {
      skills: [{ ...skill, name: "Zebra" }],
      total: 51,
      hasMore: true,
      isFavoritesOnly: false,
      facets: {},
    };
    const secondPage = {
      skills: [{ ...skill, sId: "next", name: "Alpha" }],
      total: 51,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    };
    search.mockResolvedValueOnce(firstPage);
    mount();
    await screen.findByRole("button", { name: /Zebra/ });
    search.mockResolvedValue(secondPage);
    const [, nextPageButton] = screen
      .getAllByRole("button", { name: "" })
      .slice(-2);
    await userEvent.click(nextPageButton);
    await screen.findByRole("button", { name: /Alpha/ });
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.objectContaining({ offset: 50, sortBy: "usage" }),
      "POST",
    ]);
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Alpha");
    expect(
      screen.queryByRole("button", { name: /Zebra/ })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Showing 51-51 of 51 items")).toBeInTheDocument();
    const [previousPageButton, lastPageButton] = screen
      .getAllByRole("button", { name: "" })
      .slice(-2);
    expect(lastPageButton).toBeDisabled();

    search.mockResolvedValue(firstPage);
    await userEvent.click(previousPageButton);
    await screen.findByRole("button", { name: /Zebra/ });
    expect(
      screen.queryByRole("button", { name: /Alpha/ })
    ).not.toBeInTheDocument();

    search.mockResolvedValue(secondPage);
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await screen.findByRole("button", { name: /Alpha/ });
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.objectContaining({ offset: 50 }),
      "POST",
    ]);
    search.mockResolvedValue({
      skills: [skill],
      total: 1,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });

    const input = screen.getByLabelText("Search skills");
    await userEvent.type(input, "report");
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenLastCalledWith([
        expect.any(String),
        expect.objectContaining({
          query: "report",
          searchType: "name",
          sortBy: "relevance",
          offset: 0,
        }),
        "POST",
      ])
    );
    expect(
      screen.queryByRole("button", { name: /Zebra/ })
    ).not.toBeInTheDocument();
    search.mockResolvedValue(firstPage);
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
    search.mockReturnValue(pending.promise);
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
        total: 1,
        hasMore: false,
        isFavoritesOnly: false,
        facets: {},
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
      total: 0,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("No skills to show.");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("Poke Manage Skills", () => {
  it("uses Poke search without feature flags and opens Poke skill details", async () => {
    const { mount, context, skill, fetcherWithBody } = await setup();
    mount(<SkillsDataTable owner={context.workspace} />);
    await screen.findByText(skill.name);
    expect(fetcherWithBody).toHaveBeenCalledWith([
      `/api/poke/workspaces/${context.workspace.sId}/skills/search`,
      expect.objectContaining({
        sortBy: "usage",
        permissionFiltering: "redact_unreadable",
        limit: 50,
      }),
      "POST",
    ]);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create skill suggestion" })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText(skill.name));
    expect(push).toHaveBeenCalledWith(
      `/poke/${context.workspace.sId}/skills/${skill.sId}`
    );
    expect(screen.queryByText("Full skill details")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenCalledWith([
        `/api/poke/workspaces/${context.workspace.sId}/skills/search`,
        expect.objectContaining({ status: ["archived"] }),
        "POST",
      ])
    );
    expect(window.location.hash).toContain("skillSearch=");
    expect(window.location.hash).not.toContain("agentSearch=");
  });
});
