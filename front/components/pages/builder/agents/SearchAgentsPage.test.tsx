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
import assert from "assert";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The full table renders slower on shared CI runners than the default 1s wait.
const CI_RENDER_TIMEOUT_MS = 5_000;

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

interface AgentDetailsSheetMockProps {
  agentId: string | null;
}

vi.mock("@app/components/assistant/details/AgentDetailsSheet", async () => {
  const actual = await vi.importActual<
    typeof import("@app/components/assistant/details/AgentDetailsSheet")
  >("@app/components/assistant/details/AgentDetailsSheet");
  return {
    ...actual,
    AgentDetailsSheet: ({ agentId }: AgentDetailsSheetMockProps) =>
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

vi.mock("@app/components/assistant/SetModelAssistantsDialog", () => ({
  SetModelAssistantsDialog: () => <button type="button">Set model</button>,
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
    model: {
      providerId: "anthropic",
      modelId: "claude-sonnet-5",
      reasoningEffort: "medium",
    },
    feedbacks: { up: 4, down: 1 },
    tags: [],
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
    .mockResolvedValue({
      agents: [agent],
      total: 1,
      hasMore: false,
      facets: {},
    });
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

    await screen.findByRole("button", { name: /Weekly report/ });
    expect(lastSearchBody(fetcherWithBody)).toEqual({
      query: "",
      status: ["active"],
      scope: ["visible", "hidden"],
      sortBy: "usage",
      limit: 25,
      offset: 0,
      permissionFiltering: "strict",
    });
    // Rows re-render once workspace tags load; click the current row until the details open.
    await waitFor(
      async () => {
        await userEvent.click(
          screen.getByRole("button", { name: /Weekly report/ })
        );
        expect(screen.getByText(`Details of ${agent.sId}`)).toBeInTheDocument();
      },
      { timeout: CI_RENDER_TIMEOUT_MS }
    );
    for (const header of [
      "Name",
      "Model",
      "Access",
      "Editors",
      "Tags",
      "Usage",
      "Feedback",
      "Last edited",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: header })
      ).toBeInTheDocument();
    }
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
        offset: 0,
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

    const moreButton = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-haspopup") === "menu")
      .at(-1);
    assert(moreButton);
    await userEvent.click(moreButton);

    expect(
      await screen.findByRole(
        "menuitem",
        { name: "Loading actions…" },
        { timeout: CI_RENDER_TIMEOUT_MS }
      )
    ).toBeInTheDocument();
    await act(async () => {
      pendingAgent.resolve({ agentConfiguration });
    });
    expect(
      await screen.findByRole(
        "menuitem",
        { name: "Archive" },
        { timeout: CI_RENDER_TIMEOUT_MS }
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Loading actions…" })
    ).not.toBeInTheDocument();
    expect(fetchedUrls(fetcher)).toContainEqual(
      expect.stringContaining(`/agent_configurations/${agent.sId}`)
    );
  });

  it("keeps the selection across pages and offers batch actions", async () => {
    const { agent, search, fetcherWithBody, mount } = await setup();
    search.mockResolvedValueOnce({
      agents: [agent],
      total: 30,
      hasMore: true,
      facets: {},
    });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select Weekly report" })
    );
    expect(screen.getByText("1 selected.")).toBeInTheDocument();
    for (const action of ["Change tag", "Set model", "Unpublish", "Archive"]) {
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    }
    expect(screen.queryByText(/Select all/)).not.toBeInTheDocument();

    search.mockResolvedValue({
      agents: [{ ...agent, sId: "second", name: "Second page" }],
      total: 30,
      hasMore: false,
      facets: {},
    });
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await screen.findByRole("button", { name: /Second page/ });
    expect(lastSearchBody(fetcherWithBody)).toMatchObject({ offset: 25 });
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select Second page" })
    );
    expect(screen.getByText("2 selected.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search agents"), "report");
    await waitFor(() =>
      expect(screen.queryByText(/selected\./)).not.toBeInTheDocument()
    );
  });

  it("only lets non-admins select the custom agents they edit", async () => {
    const { agent, search, mount } = await setup({ role: "user" });
    search.mockResolvedValue({
      agents: [
        agent,
        { ...agent, sId: "not-mine", name: "Not mine", editorIds: [] },
        {
          ...agent,
          sId: "helper",
          name: "Default helper",
          scope: "global",
          editorIds: [],
        },
      ],
      total: 3,
      hasMore: false,
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
    expect(
      screen.queryByRole("checkbox", { name: "Select Default helper" })
    ).not.toBeInTheDocument();
  });
});
