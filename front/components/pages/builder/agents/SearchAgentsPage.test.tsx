import { ManageAgentsPage } from "@app/components/pages/builder/agents/ManageAgentsPage";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import type { MembershipRoleType } from "@app/types/memberships";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
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

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    isReady: true,
    pathname: "/w/workspace/builder/agents",
    asPath: "/w/workspace/builder/agents",
    query: {},
    push: vi.fn(),
    replace: vi.fn(),
    events: { on: vi.fn(), off: vi.fn() },
  }),
}));

vi.mock("@app/components/assistant/details/AgentDetailsSheet", async () => {
  const actual = await vi.importActual<
    typeof import("@app/components/assistant/details/AgentDetailsSheet")
  >("@app/components/assistant/details/AgentDetailsSheet");
  return {
    ...actual,
    AgentDetailsSheet: ({ agentId }: { agentId: string | null }) =>
      agentId ? <div>Details of {agentId}</div> : null,
  };
});

vi.mock("@app/components/sparkle/ThemeContext", () => ({
  useTheme: () => ({ isDark: false }),
}));

vi.mock("@app/components/assistant/ModelsFilterMenu", () => ({
  ModelsFilterMenu: () => null,
}));

vi.mock("@app/components/assistant/TagsFilterMenu", () => ({
  TagsFilterMenu: () => null,
}));

vi.mock("@app/components/assistant/CreateAgentDropdown", () => ({
  CreateAgentDropdown: () => null,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

async function setup({
  role = "admin",
  pageEnabled = true,
}: {
  role?: MembershipRoleType;
  pageEnabled?: boolean;
} = {}) {
  const { authenticator, user } = await createResourceTest({ role });
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    authenticator,
    { name: "Weekly report" }
  );
  const { sId, fullName, image } = user.toJSON();
  const agent: SearchAgentsResponseBody["agents"][number] = {
    sId: agentConfiguration.sId,
    status: "active",
    scope: "visible",
    name: agentConfiguration.name,
    description: "Writes the weekly report",
    pictureUrl: agentConfiguration.pictureUrl,
    requestedSpaceIds: [],
    tagIds: [],
    editorIds: [sId],
    editors: [{ sId, fullName, image }],
    editedBy: sId,
    activeUsersCount: 3,
    updatedAt: Date.now(),
  };
  const context: AuthContextValue = {
    workspace: authenticator.getNonNullableWorkspace(),
    user: user.toJSON(),
    subscription: authenticator.getNonNullableSubscription(),
    isAdmin: role === "admin",
    isManager: false,
    featureFlags: pageEnabled ? ["new_manage_agents_page"] : [],
    vizUrl: "http://localhost",
    providersHealth: null,
    workspacePermissions: await authenticator.getWorkspacePermissions(),
  };
  const search = vi
    .fn<() => Promise<SearchAgentsResponseBody>>()
    .mockResolvedValue({ agents: [agent], hasMore: false, nextCursor: null });
  const fetcherWithBody = vi.fn(async () => search());
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith(`/agent_configurations/${agent.sId}`)) {
      return { agentConfiguration };
    }
    if (url.includes("/assistant/agent_configurations?")) {
      return { agentConfigurations: [] };
    }
    return {};
  });
  const mount = () =>
    render(<ManageAgentsPage />, {
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
  return { agent, agentConfiguration, search, fetcher, fetcherWithBody, mount };
}

function fetchedUrls(fetcher: ReturnType<typeof vi.fn>): string[] {
  return fetcher.mock.calls.map(([url]) => url);
}

function lastSearchBody(fetcherWithBody: ReturnType<typeof vi.fn>) {
  return fetcherWithBody.mock.lastCall?.[0][1];
}

describe("search-backed Manage Agents", () => {
  it("keeps the legacy page when the flag is off", async () => {
    const { fetcherWithBody, fetcher, mount } = await setup({
      pageEnabled: false,
    });
    mount();

    expect(
      await screen.findByPlaceholderText("Search (Name, Editors)")
    ).toBeInTheDocument();
    expect(fetchedUrls(fetcher)).toContainEqual(
      expect.stringContaining("/assistant/agent_configurations?view=manage")
    );
    expect(fetcherWithBody).not.toHaveBeenCalled();
  });

  it("loads custom agents by usage and opens details on click", async () => {
    const { agent, fetcherWithBody, fetcher, mount } = await setup();
    mount();

    await userEvent.click(
      await screen.findByRole("button", { name: /Weekly report/ })
    );
    expect(lastSearchBody(fetcherWithBody)).toEqual({
      query: "",
      status: ["active"],
      scope: ["visible", "hidden"],
      sortBy: "usage",
      limit: 50,
      cursor: null,
      permissionFiltering: "strict",
    });
    expect(
      await screen.findByText(`Details of ${agent.sId}`)
    ).toBeInTheDocument();
    expect(fetchedUrls(fetcher)).not.toContainEqual(
      expect.stringContaining(`/agent_configurations/${agent.sId}`)
    );
  });

  it("requests each tab with its own filters", async () => {
    const { fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    for (const { tab, filters } of [
      {
        tab: "Editable by me",
        filters: {
          status: ["active"],
          editedByMe: true,
          permissionFiltering: "strict",
        },
      },
      {
        tab: "Default",
        filters: {
          status: ["active"],
          scope: ["global"],
          permissionFiltering: "strict",
        },
      },
      {
        tab: "Archived",
        filters: { status: ["archived"], permissionFiltering: "unrestricted" },
      },
    ]) {
      await userEvent.click(screen.getByRole("tab", { name: tab }));
      await waitFor(() =>
        expect(lastSearchBody(fetcherWithBody)).toMatchObject(filters)
      );
    }
  });

  it("lets admins show hidden agents with unrestricted search", async () => {
    const { fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Show hidden agents" })
    );
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        scope: ["visible", "hidden"],
        permissionFiltering: "unrestricted",
      })
    );
  });

  it("never requests unrestricted search for non-admins", async () => {
    const { fetcherWithBody, mount } = await setup({ role: "user" });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    expect(
      screen.queryByRole("checkbox", { name: "Show hidden agents" })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        status: ["archived"],
        permissionFiltering: "strict",
      })
    );
  });

  it("searches by relevance and sorts on the server", async () => {
    const { fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.type(screen.getByLabelText("Search agents"), "report");
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        query: "report",
        sortBy: "relevance",
      })
    );
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        query: "report",
        sortBy: "name",
        sortOrder: "asc",
        cursor: null,
      })
    );
  });

  it("loads the agent only when its actions menu opens", async () => {
    const { agent, agentConfiguration, fetcher, mount } = await setup();
    const pendingAgent = Promise.withResolvers<{
      agentConfiguration: typeof agentConfiguration;
    }>();
    fetcher.mockImplementation(async (url: string) =>
      url.endsWith(`/agent_configurations/${agent.sId}`)
        ? pendingAgent.promise
        : {}
    );
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    expect(fetchedUrls(fetcher)).not.toContainEqual(
      expect.stringContaining(`/agent_configurations/${agent.sId}`)
    );

    const [moreButton] = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-haspopup") === "menu");
    await userEvent.click(moreButton);

    expect(
      await screen.findByRole("menuitem", { name: "Loading actions…" })
    ).toBeInTheDocument();
    await act(async () => {
      pendingAgent.resolve({ agentConfiguration });
    });
    expect(
      await screen.findByRole("menuitem", { name: "Archive" })
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Loading actions…" })
    ).not.toBeInTheDocument();
    expect(fetchedUrls(fetcher)).toContainEqual(
      expect.stringContaining(`/agent_configurations/${agent.sId}`)
    );
  });
});
