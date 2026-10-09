import { ManageAgentsPage } from "@app/components/pages/builder/agents/ManageAgentsPage";
import { AssistantsDataTable } from "@app/components/poke/assistants/table";
import { serializeFilterHash } from "@app/components/shared/filter_panel/filterHash";
import { getModelFilterDisplayName } from "@app/components/shared/filter_panel/searchFilter";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { i18n } from "@app/lib/i18n/i18n";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { SearchAgentsResponseBody } from "@app/types/agent_search/agent_search";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { MembershipRoleType } from "@app/types/memberships";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

const { push, patch, notify } = vi.hoisted(() => ({
  push: vi.fn(),
  patch: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@app/lib/egress/client", () => ({ clientFetch: patch }));
vi.mock("@app/hooks/useNotification", () => ({
  useSendNotification: () => notify,
  useSendApiErrorNotification: () => vi.fn(),
}));

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    isReady: true,
    pathname: "/w/workspace/builder/agents",
    asPath: "/w/workspace/builder/agents",
    query: {},
    push,
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

vi.mock("@app/components/assistant/SetModelAssistantsDialog", () => ({
  SetModelAssistantsDialog: () => <button type="button">Set model</button>,
}));

vi.mock("@app/components/assistant/CreateAgentDropdown", () => ({
  CreateAgentDropdown: () => null,
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

async function setup({
  role = "admin",
  tagsLoaded,
  globalStatus = "disabled_by_admin",
}: {
  role?: MembershipRoleType;
  tagsLoaded?: Promise<void>;
  globalStatus?: LightAgentConfigurationType["status"];
} = {}) {
  const { authenticator, user } = await createResourceTest({ role });
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    authenticator,
    { name: "Weekly report" }
  );
  const globalAgent: LightAgentConfigurationType = {
    ...agentConfiguration,
    sId: GLOBAL_AGENTS_SID.DUST,
    scope: "global",
    name: "Default Dust",
    status: globalStatus,
  };
  patch.mockImplementation(async () => ({ ok: true }));
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
    userFavorite: false,
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
    .fn<() => Promise<SearchAgentsResponseBody>>()
    .mockResolvedValue({
      agents: [agent],
      total: 1,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });
  const facetsResponse: SearchAgentsResponseBody = {
    agents: [],
    total: 1,
    hasMore: false,
    isFavoritesOnly: false,
    facets: {
      editors: [
        { sId: "other-editor", fullName: "Alice Other", image: null, count: 1 },
        { sId, fullName, image, count: 1 },
      ],
      models: [{ modelId: "claude-sonnet-5", count: 1 }],
      tags: [],
      mcpServerViews: ["slack-view-1", "slack-view-2"].map((sId) => ({
        sId,
        mcpServerId: "slack",
        name: "Slack",
        icon: "SlackLogo",
        count: 1,
      })),
    },
  };
  const fetcherWithBody = vi.fn(
    async ([, body]: [
      string,
      { limit?: number; scope?: string[] },
      string,
    ]) => {
      if (body.limit === 0) {
        return facetsResponse;
      }
      if (body.scope?.length === 1 && body.scope[0] === "global") {
        return {
          agents: [{ ...agent, ...globalAgent, model: agent.model }],
          total: 1,
          hasMore: false,
          isFavoritesOnly: false,
          facets: {},
        };
      }
      return search();
    }
  );
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/tags")) {
      await tagsLoaded;
      return { tags: [] };
    }
    if (url.endsWith(`/agent_configurations/${agent.sId}`)) {
      return { agentConfiguration };
    }
    if (url.includes("/assistant/agent_configurations?")) {
      return { agentConfigurations: [] };
    }
    return {};
  });
  const mount = (ui = <ManageAgentsPage />) =>
    render(ui, {
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
  return {
    agent,
    agentConfiguration,
    globalAgent,
    context,
    editor: { sId, fullName },
    search,
    fetcher,
    fetcherWithBody,
    mount,
  };
}

function fetchedUrls(fetcher: ReturnType<typeof vi.fn>): string[] {
  return fetcher.mock.calls.map(([url]) => url);
}

function lastSearchBody(fetcherWithBody: ReturnType<typeof vi.fn>) {
  return fetcherWithBody.mock.calls
    .map(([[, body]]) => body)
    .filter((body) => body.limit !== 0)
    .at(-1);
}

describe("search-backed Manage Agents", () => {
  it("lets admins enable disabled defaults and disable them again", async () => {
    const { globalAgent, context, mount } = await setup();
    patch.mockImplementation(async (_url: string, options: RequestInit) => {
      globalAgent.status = JSON.parse(String(options.body)).status;
      return { ok: true };
    });
    mount();
    await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
    await screen.findByText("Default Dust");
    const toggle = () => screen.getByRole("switch", { name: "Default Dust" });
    expect(
      screen.getByRole("button", { name: /Default Dust/ })
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
        .filter(Boolean)
    ).toEqual([
      "Name",
      "Access",
      "Model",
      "Usage",
      "Feedback",
      "Editors",
      "Tags",
      "Last edited",
    ]);
    await userEvent.click(toggle());
    await waitFor(() =>
      expect(patch).toHaveBeenLastCalledWith(
        `/api/w/${context.workspace.sId}/assistant/global_agents/${globalAgent.sId}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "active" }),
        })
      )
    );
    await waitFor(() =>
      expect(toggle()).toHaveAttribute("aria-checked", "true")
    );
    expect(
      screen.queryByText(`Details of ${globalAgent.sId}`)
    ).not.toBeInTheDocument();
    toggle().focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(patch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ status: "disabled_by_admin" }),
        })
      )
    );
  });

  it("prevents members from changing default agents", async () => {
    const { mount } = await setup({ role: "user" });
    mount();
    await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
    await screen.findByText("Default Dust");
    const toggle = screen.getByRole("switch", { name: "Default Dust" });
    await userEvent.click(toggle);
    expect(patch).not.toHaveBeenCalled();
  });

  it("keeps the helper enabled and missing-data defaults disabled", async () => {
    const { globalAgent, mount } = await setup({
      globalStatus: "disabled_missing_datasource",
    });
    const { unmount } = mount();
    await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
    const toggle = await screen.findByRole("switch", { name: "Default Dust" });
    expect(toggle).toBeDisabled();
    await userEvent.click(toggle);
    expect(patch).not.toHaveBeenCalled();
    unmount();
    globalAgent.sId = GLOBAL_AGENTS_SID.HELPER;
    globalAgent.status = "active";
    mount();
    await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
    await screen.findByRole("button", { name: /Default Dust/ });
    await waitFor(() =>
      expect(screen.queryByRole("switch")).not.toBeInTheDocument()
    );
  });

  it("keeps paid defaults disabled on free plans", async () => {
    const { mount } = await setup({
      globalStatus: "disabled_free_workspace",
    });
    mount();
    await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
    await screen.findByText("Default Dust");
    const toggle = screen.getByRole("switch", { name: "Default Dust" });
    await userEvent.click(toggle);
    await screen.findByRole("dialog", { name: "Free plan" });
    expect(patch).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  });

  it("reports failed default-agent updates without changing the toggle", async () => {
    const { mount } = await setup();
    mount();
    await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
    const toggle = await screen.findByRole("switch", { name: "Default Dust" });
    patch.mockResolvedValue({ ok: false });
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error" })
      )
    );
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("loads custom agents by usage and opens details on click", async () => {
    const { agent, fetcherWithBody, fetcher, mount } = await setup();
    mount();

    await screen.findByRole("button", { name: /Weekly report/ });
    expect(lastSearchBody(fetcherWithBody)).toEqual({
      query: "",
      searchType: "name",
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
    expect(
      screen
        .getAllByRole("columnheader")
        .map((header) => header.textContent?.trim())
        .filter(Boolean)
    ).toEqual([
      "Name",
      "Access",
      "Model",
      "Usage",
      "Feedback",
      "Editors",
      "Tags",
      "Last edited",
    ]);
    expect(fetchedUrls(fetcher)).not.toContainEqual(
      expect.stringContaining(`/agent_configurations/${agent.sId}`)
    );
  });

  it("requests each tab with its own filters", async () => {
    const { fetcherWithBody, fetcher, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    expect(
      screen.queryByRole("tab", { name: "Editable" })
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
    await screen.findByText("Default Dust");
    expect(lastSearchBody(fetcherWithBody)).toMatchObject({
      scope: ["global"],
      permissionFiltering: "strict",
    });
    expect(fetchedUrls(fetcher)).not.toContainEqual(
      expect.stringContaining("view=global")
    );
    await userEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        status: ["archived"],
        permissionFiltering: "unrestricted",
      })
    );
  });

  it("lets admins show hidden agents with unrestricted search", async () => {
    const { fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Hidden agents" })
    );
    expect(lastSearchBody(fetcherWithBody)).toMatchObject({
      permissionFiltering: "strict",
    });
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        scope: ["visible", "hidden"],
        permissionFiltering: "unrestricted",
      })
    );

    expect(screen.getByText("Hidden agents")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Filters" })
    ).not.toHaveTextContent(/\d/);

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("checkbox", { name: "Hidden agents" })
    ).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(screen.queryByText("Hidden agents")).not.toBeInTheDocument()
    );
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.getByRole("checkbox", { name: "Hidden agents" })
    ).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.queryByRole("checkbox", { name: "Hidden agents" })
    ).not.toBeInTheDocument();
  });

  it("applies the Editor is Me preset and offers it again once removed", async () => {
    const { editor, fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    expect(
      screen.queryByRole("button", { name: "Clear all" })
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: `Editor is ${editor.fullName} (You)` })
    );
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        editorIds: [editor.sId],
      })
    );
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: `Editor is ${editor.fullName} (You)`,
        })
      ).not.toBeInTheDocument()
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(
      await screen.findByRole("button", {
        name: `Editor is ${editor.fullName} (You)`,
      })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove" })
      ).not.toBeInTheDocument()
    );
  });

  it("never requests unrestricted search for non-admins", async () => {
    const { fetcherWithBody, mount } = await setup({ role: "user" });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.queryByRole("checkbox", { name: "Hidden agents" })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        status: ["archived"],
        permissionFiltering: "strict",
      })
    );
  });

  it("starts text search at three characters", async () => {
    const { fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    const input = screen.getByLabelText("Search agents");
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
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({ query: "rep" })
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
        searchType: "name",
        sortBy: "relevance",
      })
    );
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        query: "report",
        searchType: "name",
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

    // Rows re-render once workspace tags load, closing the menu; reopen it until it sticks.
    await waitFor(
      async () => {
        const moreButton = screen
          .getAllByRole("button")
          .filter((button) => button.getAttribute("aria-haspopup") === "menu")
          .at(-1);
        assert(moreButton);
        if (moreButton.getAttribute("aria-expanded") !== "true") {
          await userEvent.click(moreButton);
        }
        expect(
          screen.getByRole("menuitem", { name: "Loading actions…" })
        ).toBeInTheDocument();
      },
      { timeout: CI_RENDER_TIMEOUT_MS }
    );
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

  it("keeps a row checkbox click when tags finish loading mid-click", async () => {
    let releaseTags = () => {};
    const { mount } = await setup({
      tagsLoaded: new Promise((resolve) => {
        releaseTags = resolve;
      }),
    });
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    const checkbox = screen.getByRole("checkbox", {
      name: "Select Weekly report",
    });

    fireEvent.pointerDown(checkbox);
    await act(async () => releaseTags());
    await waitFor(() =>
      expect(screen.queryByLabelText("Loading")).not.toBeInTheDocument()
    );
    fireEvent.click(checkbox);

    expect(await screen.findByText("1 selected")).toBeInTheDocument();
  });

  it("keeps the selection across pages and offers batch actions", async () => {
    const { agent, search, fetcherWithBody, mount } = await setup();
    search.mockResolvedValueOnce({
      agents: [agent],
      total: 30,
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
    for (const action of ["Change tag", "Set model", "Unpublish", "Archive"]) {
      expect(screen.getByRole("button", { name: action })).toBeInTheDocument();
    }
    expect(screen.queryByText(/Select all/)).not.toBeInTheDocument();

    search.mockResolvedValue({
      agents: [{ ...agent, sId: "second", name: "Second page" }],
      total: 30,
      hasMore: false,
      isFavoritesOnly: false,
      facets: {},
    });
    await userEvent.click(screen.getByRole("button", { name: "2" }));
    await screen.findByRole("button", { name: /Second page/ });
    expect(lastSearchBody(fetcherWithBody)).toMatchObject({ offset: 25 });
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select Second page" })
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search agents"), "report");
    await waitFor(() =>
      expect(screen.queryByText(/^\d+ selected$/)).not.toBeInTheDocument()
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
    expect(
      screen.queryByRole("checkbox", { name: "Select Default helper" })
    ).not.toBeInTheDocument();
  });

  it("narrows filter options by the other selections and applies Access, Editors and Models", async () => {
    const { editor, fetcherWithBody, mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });
    expect(
      fetcherWithBody.mock.calls.some(([[, body]]) => body.limit === 0)
    ).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Not published" })
    );
    await userEvent.click(screen.getByRole("tab", { name: "Editors" }));
    const currentUserCheckbox = await screen.findByRole("checkbox", {
      name: `${editor.fullName} (You)`,
    });
    const editorCheckboxes = within(screen.getByRole("dialog"))
      .getAllByRole("checkbox")
      .filter((checkbox) => checkbox.id.startsWith("agent-filter-option-"));
    expect(editorCheckboxes).toHaveLength(2);
    expect(editorCheckboxes[0]).toBe(currentUserCheckbox);
    expect(
      screen.queryByRole("checkbox", { name: editor.fullName })
    ).not.toBeInTheDocument();
    await userEvent.click(currentUserCheckbox);
    await userEvent.click(screen.getByRole("tab", { name: "Models" }));
    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: getModelFilterDisplayName("claude-sonnet-5", (descriptor) =>
          i18n._(descriptor)
        ),
      })
    );
    const facetBodies = fetcherWithBody.mock.calls
      .map(([[, body]]) => body)
      .filter((body) => body.limit === 0);
    expect(facetBodies[0]).toMatchObject({
      facets: ["editors"],
      scope: ["hidden"],
    });
    expect(facetBodies[0]).not.toHaveProperty("editorIds");
    expect(facetBodies.at(-1)).toMatchObject({
      facets: ["models"],
      scope: ["hidden"],
      editorIds: [editor.sId],
    });

    await userEvent.click(screen.getByRole("tab", { name: "Tools" }));
    const toolCheckbox = await screen.findByRole("checkbox", { name: "Slack" });
    await userEvent.click(toolCheckbox);
    const toolFacetBody = fetcherWithBody.mock.calls
      .map(([[, body]]) => body)
      .filter((body) => body.limit === 0)
      .at(-1);
    expect(toolFacetBody).toMatchObject({ facets: ["mcpServerViews"] });
    expect(toolFacetBody).not.toHaveProperty("mcpServerViewIds");

    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByText(`${editor.fullName} (You)`)).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        scope: ["hidden"],
        editorIds: [editor.sId],
        modelIds: ["claude-sonnet-5"],
        mcpServerViewIds: ["slack-view-1", "slack-view-2"],
        offset: 0,
      })
    );
  });

  it.each(["all", "default"] as const)(
    "ignores hidden Dust filters when starting on the %s tab",
    async (tabId) => {
      const { fetcherWithBody, mount } = await setup();
      const hash = serializeFilterHash(
        {
          tabId,
          selection: {
            access: { hidden: "Not published" },
            editor: { "other-editor": "Alice Other" },
            tag: { "workspace-tag": "Workspace tag" },
            skill: { "workspace-skill": "Workspace skill" },
            space: { "workspace-space": "Workspace space" },
            usage: { "1-5": "1–5 active users" },
            model: { "claude-sonnet-5": "Sonnet" },
          },
        },
        "all"
      );
      window.history.replaceState({}, "", `/#?search=${hash}`);
      mount();
      if (tabId === "all") {
        await screen.findByRole("button", { name: /Weekly report/ });
        await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
      }
      await screen.findByRole("switch", { name: "Default Dust" });
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        scope: ["global"],
        modelIds: ["claude-sonnet-5"],
      });
      await userEvent.click(screen.getByRole("button", { name: "Filters" }));
      await userEvent.click(
        await screen.findByRole("checkbox", {
          name: getModelFilterDisplayName("claude-sonnet-5", (descriptor) =>
            i18n._(descriptor)
          ),
        })
      );
      await userEvent.click(screen.getByRole("button", { name: "Apply" }));
      await waitFor(() =>
        expect(lastSearchBody(fetcherWithBody)).not.toHaveProperty("modelIds")
      );

      const dustRequests = fetcherWithBody.mock.calls
        .map(([[, body]]) => body)
        .filter((body) => body.scope?.includes("global"));
      for (const body of dustRequests) {
        for (const key of [
          "editorIds",
          "tagIds",
          "skillIds",
          "spaceIds",
          "activeUsersCount",
        ]) {
          expect(body).not.toHaveProperty(key);
        }
        if (body.limit === 0) {
          expect(body).toMatchObject({ facets: ["models"] });
        }
      }

      await userEvent.click(screen.getByRole("tab", { name: "Workspace" }));
      await waitFor(() =>
        expect(lastSearchBody(fetcherWithBody)).toMatchObject({
          scope: ["hidden"],
          editorIds: ["other-editor"],
          tagIds: ["workspace-tag"],
          skillIds: ["workspace-skill"],
          spaceIds: ["workspace-space"],
          activeUsersCount: { min: 1, max: 5 },
        })
      );
      expect(lastSearchBody(fetcherWithBody)).not.toHaveProperty("modelIds");
    }
  );

  it("only shows model filters on the Dust tab", async () => {
    const { mount } = await setup();
    mount();
    await screen.findByRole("button", { name: /Weekly report/ });

    await userEvent.click(screen.getByRole("tab", { name: "Dust" }));
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(
      screen.queryByRole("tab", { name: "Access" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Editors" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Models" })).toBeInTheDocument();
  });
});

describe("Poke Manage Agents", () => {
  it("uses Poke table and facet requests and navigates to Poke details", async () => {
    const { mount, context, agent, fetcherWithBody } = await setup();
    mount(
      <AssistantsDataTable owner={context.workspace} agentsRetention={{}} />
    );
    await screen.findByText(agent.name);
    expect(fetcherWithBody).toHaveBeenCalledWith([
      `/api/poke/workspaces/${context.workspace.sId}/agent_configurations/search`,
      expect.objectContaining({
        sortBy: "usage",
        permissionFiltering: "unrestricted",
        limit: 25,
      }),
      "POST",
    ]);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Restore an agent/ })
    ).toBeInTheDocument();
    await userEvent.click(screen.getByText(agent.name));
    expect(push).toHaveBeenCalledWith(
      `/poke/${context.workspace.sId}/assistants/${agent.sId}`
    );
    expect(
      screen.queryByText(`Details of ${agent.sId}`)
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("tab", { name: "Editors" }));
    await waitFor(() =>
      expect(fetcherWithBody).toHaveBeenCalledWith([
        `/api/poke/workspaces/${context.workspace.sId}/agent_configurations/search`,
        expect.objectContaining({ limit: 0, facets: ["editors"] }),
        "POST",
      ])
    );
  });

  it("keeps agent tabs separate from skill filters in the hash", async () => {
    const { mount, context, fetcherWithBody } = await setup();
    mount(
      <AssistantsDataTable owner={context.workspace} agentsRetention={{}} />
    );
    await screen.findByText("Weekly report");
    await userEvent.click(screen.getByRole("tab", { name: "Archived" }));
    await waitFor(() =>
      expect(lastSearchBody(fetcherWithBody)).toMatchObject({
        status: ["archived"],
      })
    );
    expect(window.location.hash).toContain("agentSearch=");
    expect(window.location.hash).not.toContain("skillSearch=");
  });
});
