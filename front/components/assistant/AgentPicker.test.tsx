import { AgentPicker } from "@app/components/assistant/AgentPicker";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import type { FetcherWithBodyFn } from "@app/lib/swr/fetcher";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

const remoteAgents = [
  {
    sId: "remote_alpha",
    name: "Alpha",
    description: "Alpha assistant",
    pictureUrl: "/alpha.png",
  },
  {
    sId: "remote_beta",
    name: "Beta",
    description: "Beta assistant",
    pictureUrl: "/beta.png",
  },
];
const searchResponse = {
  agents: remoteAgents,
  total: 2,
  hasMore: false,
  facets: {},
};

async function setup() {
  const { authenticator, user } = await createResourceTest({ role: "admin" });
  const owner = authenticator.getNonNullableWorkspace();
  const legacyAgent = await AgentConfigurationFactory.createTestAgent(
    authenticator,
    {
      name: "Zulu",
    }
  );
  const context: AuthContextValue = {
    workspace: owner,
    user: user.toJSON(),
    subscription: authenticator.getNonNullableSubscription(),
    isAdmin: true,
    isManager: false,
    featureFlags: [],
    vizUrl: "http://localhost",
    providersHealth: null,
    workspacePermissions: await authenticator.getWorkspacePermissions(),
  };
  const fetcher = vi.fn();
  const fetcherWithBody = vi
    .fn<FetcherWithBodyFn>()
    .mockResolvedValue(searchResponse);
  const onItemClick = vi.fn();
  const onDeselect = vi.fn();
  const swrConfig = { provider: () => new Map(), shouldRetryOnError: false };
  const renderPicker = (
    props: Partial<ComponentProps<typeof AgentPicker>> = {}
  ) =>
    render(
      <AuthContext.Provider value={context}>
        <FetcherProvider fetcher={fetcher} fetcherWithBody={fetcherWithBody}>
          <SWRConfig value={swrConfig}>
            <AgentPicker
              owner={owner}
              agents={[legacyAgent]}
              onItemClick={onItemClick}
              onDeselect={onDeselect}
              showFooterButtons={false}
              {...props}
            />
          </SWRConfig>
        </FetcherProvider>
      </AuthContext.Provider>
    );
  return {
    owner,
    legacyAgent,
    fetcherWithBody,
    onItemClick,
    onDeselect,
    renderPicker,
  };
}

describe("AgentPicker", () => {
  it("searches only while open and selects results absent from the supplied list", async () => {
    const { owner, fetcherWithBody, onItemClick, renderPicker } = await setup();
    const user = userEvent.setup();
    renderPicker();
    expect(fetcherWithBody).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Pick an agent" }));
    await screen.findByRole("menuitem", { name: "Alpha" });
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["Alpha", "Beta"]);
    expect(fetcherWithBody).toHaveBeenCalledWith([
      `/api/w/${owner.sId}/assistant/agent_configurations/search`,
      expect.objectContaining({
        query: "",
        sortBy: "name",
        sortOrder: "asc",
        permissionFiltering: "strict",
      }),
      "POST",
    ]);
    await user.click(screen.getByRole("menuitem", { name: "Beta" }));
    expect(onItemClick).toHaveBeenCalledWith(remoteAgents[1]);
    expect(
      screen.queryByPlaceholderText("Search Agents")
    ).not.toBeInTheDocument();
    expect(fetcherWithBody).toHaveBeenCalledTimes(1);
  });

  it("keeps the selected agent first beyond the search page and supports deselection", async () => {
    const { legacyAgent, onDeselect, onItemClick, renderPicker } =
      await setup();
    const user = userEvent.setup();
    renderPicker({ selectedAgentId: legacyAgent.sId });
    await user.click(screen.getByRole("button", { name: "Pick an agent" }));
    await screen.findByRole("menuitem", { name: "Zulu" });
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["Zulu", "Alpha", "Beta"]);
    await user.click(screen.getByRole("menuitem", { name: "Zulu" }));
    expect(onDeselect).toHaveBeenCalledOnce();
    expect(onItemClick).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Search Agents")).toBeInTheDocument();
  });

  it("does not select stale results while a typed query is loading", async () => {
    const { fetcherWithBody, onItemClick, renderPicker } = await setup();
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: "Pick an agent" }));
    await screen.findByRole("menuitem", { name: "Alpha" });
    let resolveSearch: (response: typeof searchResponse) => void = () => {};
    fetcherWithBody.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );
    const input = screen.getByPlaceholderText("Search Agents");
    fireEvent.change(input, { target: { value: "beta" } });
    expect(
      screen.getByRole("status", { name: "Loading agents" })
    ).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onItemClick).not.toHaveBeenCalled();
    await waitFor(() => expect(fetcherWithBody).toHaveBeenCalledTimes(2));
    expect(fetcherWithBody).toHaveBeenLastCalledWith([
      expect.any(String),
      expect.objectContaining({ query: "beta" }),
      "POST",
    ]);
    await act(async () => {
      resolveSearch({ ...searchResponse, agents: [remoteAgents[1]], total: 1 });
    });
    await screen.findByRole("menuitem", { name: "Beta" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onItemClick).toHaveBeenCalledWith(remoteAgents[1]);
  });

  it.each([
    false,
    true,
  ])("distinguishes empty results from a search failure (failure: %s)", async (failure) => {
    const { fetcherWithBody, onItemClick, renderPicker } = await setup();
    if (failure) {
      fetcherWithBody.mockRejectedValue(new Error("Search unavailable"));
    } else {
      fetcherWithBody.mockResolvedValue({
        ...searchResponse,
        agents: [],
        total: 0,
      });
    }
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: "Pick an agent" }));
    expect(
      await screen.findByText(
        failure ? "Unable to load agents" : "No results found"
      )
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByPlaceholderText("Search Agents"), {
      key: "Enter",
    });
    expect(onItemClick).not.toHaveBeenCalled();
  });
});
