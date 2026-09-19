import { ManageSkillsPage } from "@app/components/pages/builder/skills/ManageSkillsPage";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { FetcherProvider } from "@app/lib/swr/FetcherContext";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/platform", () => {
  const router = {
    isReady: true,
    pathname: "/w/workspace/builder/skills",
    asPath: "/w/workspace/builder/skills",
    query: {},
    push: vi.fn().mockResolvedValue(true),
    replace: vi.fn().mockResolvedValue(true),
    back: vi.fn(),
    reload: vi.fn(),
    events: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  };
  return { useAppRouter: () => router };
});

vi.mock("@app/components/assistant/details/AgentDetailsSheet", () => ({
  AgentDetailsSheet: () => null,
}));

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

async function setup({
  deepLink = false,
  listed = true,
  isAdmin = true,
  skillOverrides = {},
}: {
  deepLink?: boolean;
  listed?: boolean;
  isAdmin?: boolean;
  skillOverrides?: Partial<SkillWithRelationsType>;
} = {}) {
  const { authenticator, user } = await createResourceTest({ role: "admin" });
  const resource = await SkillFactory.create(authenticator, {
    name: "Listed skill",
    availability: "workspace_users",
    instructions: "",
  });
  const skill: SkillWithRelationsType = {
    ...resource.toJSON(authenticator),
    relations: {
      usage: { count: 0, agents: [], skills: [] },
      editors: [],
      editedByUser: null,
      childSkills: [],
    },
    ...skillOverrides,
  };
  const workspace = authenticator.getNonNullableWorkspace();
  const detailUrl = `/api/w/${workspace.sId}/skills/${skill.sId}?withRelations=true`;
  const details = vi.fn().mockResolvedValue({
    skill: {
      ...skill,
      name: "Fetched skill",
      userFacingDescription: "Fetched description",
    },
  });
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === detailUrl) {
      return details();
    }
    if (url.endsWith("/favorite")) {
      details.mockResolvedValue({
        skill: {
          ...skill,
          name: "Fetched skill",
          isFavorite: init?.method === "POST",
        },
      });
      return {};
    }
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === `/api/w/${workspace.sId}/skills`) {
      return {
        skills:
          listed && parsed.searchParams.get("status") === skill.status
            ? [skill]
            : [],
      };
    }
    if (parsed.pathname.endsWith("/spaces")) {
      return { spaces: [] };
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const context: AuthContextValue = {
    workspace,
    user: user.toJSON(),
    subscription: authenticator.getNonNullableSubscription(),
    isAdmin,
    isManager: false,
    featureFlags: [],
    vizUrl: "http://localhost",
    providersHealth: null,
    workspacePermissions: await authenticator.getWorkspacePermissions(),
  };
  window.history.replaceState(
    {},
    "",
    deepLink ? `/#?skillId=${skill.sId}` : "/"
  );

  const mount = () =>
    render(
      <SWRConfig
        value={{ provider: () => new Map(), shouldRetryOnError: false }}
      >
        <FetcherProvider fetcher={fetcher} fetcherWithBody={vi.fn()}>
          <AuthContext.Provider value={context}>
            <ManageSkillsPage />
          </AuthContext.Provider>
        </FetcherProvider>
      </SWRConfig>
    );
  return { skill, detailUrl, details, fetcher, mount };
}

describe("Manage Skills detail loading", () => {
  it("fetches only the selected skill and uses its response for the whole sheet", async () => {
    const { skill, detailUrl, details, fetcher, mount } = await setup();
    const pending = Promise.withResolvers<{ skill: SkillWithRelationsType }>();
    details.mockReturnValue(pending.promise);
    mount();

    await screen.findByText("Listed skill");
    expect(details).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("Listed skill"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith(detailUrl));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByText("Listed skill")).not.toBeInTheDocument();

    await act(async () =>
      pending.resolve({
        skill: {
          ...skill,
          name: "Fetched skill",
          userFacingDescription: "Fetched description",
        },
      })
    );
    expect(
      await dialog.findByRole("heading", { name: "Fetched skill" })
    ).toBeInTheDocument();
    expect(dialog.getByText("Fetched description")).toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter(([url]) => url.includes(`/skills/${skill.sId}`))
    ).toEqual([[detailUrl]]);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(window.location.hash).not.toContain("skillId"));
    expect(details).toHaveBeenCalledTimes(1);
  });

  it.each([
    "active",
    "archived",
  ] as const)("resolves a deep link to an %s skill without requiring it in the listing", async (status) => {
    const { details, mount } = await setup({
      deepLink: true,
      listed: false,
      skillOverrides: { status },
    });
    mount();
    expect(
      await screen.findByRole("heading", { name: "Fetched skill" })
    ).toBeInTheDocument();
    expect(details).toHaveBeenCalledTimes(1);
  });

  it("does not reuse the previous skill while resolving another selection", async () => {
    const { skill, details, mount } = await setup({ deepLink: true });
    mount();
    await screen.findByRole("heading", { name: "Fetched skill" });

    act(() => {
      window.history.replaceState({}, "", "/#?skillId=missing-skill");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(await screen.findByText("Unable to load skill")).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog")).queryByText("Fetched skill")
    ).not.toBeInTheDocument();
    expect(window.location.hash).not.toContain(skill.sId);
    expect(details).toHaveBeenCalledTimes(1);
  });

  it("shows not-found for a deleted skill rather than its stale listing", async () => {
    const { details, mount } = await setup();
    details.mockRejectedValue({
      error: { type: "skill_not_found", message: "Deleted" },
    });
    mount();
    await userEvent.click(await screen.findByText("Listed skill"));
    const dialog = within(screen.getByRole("dialog"));
    expect(await dialog.findByText("Skill not found")).toBeInTheDocument();
    expect(dialog.queryByText("Listed skill")).not.toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Retry" })
    ).not.toBeInTheDocument();
  });

  it("shows a detail error instead of falling back to a listed skill, and supports retry", async () => {
    const { details, mount } = await setup();
    details.mockRejectedValueOnce(new Error("Unavailable"));
    mount();
    await userEvent.click(await screen.findByText("Listed skill"));
    const dialog = within(screen.getByRole("dialog"));
    expect(await dialog.findByText("Unable to load skill")).toBeInTheDocument();
    expect(dialog.queryByText("Listed skill")).not.toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Retry" }));
    expect(
      await dialog.findByRole("heading", { name: "Fetched skill" })
    ).toBeInTheDocument();
    expect(details).toHaveBeenCalledTimes(2);
  });

  it("refreshes the selected skill after updating its favorite state", async () => {
    const { details, fetcher, mount } = await setup({ deepLink: true });
    mount();
    await screen.findByRole("heading", { name: "Fetched skill" });
    await userEvent.click(
      screen.getByRole("button", { name: "Add to favorites" })
    );
    await waitFor(() => expect(details).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole("button", { name: "Remove from favorites" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      fetcher.mock.calls.some(
        ([url, init]) => url.endsWith("/favorite") && init?.method === "POST"
      )
    ).toBe(true);
  });

  it("uses the fetched redaction state for admin details and actions", async () => {
    const { skill, details, mount } = await setup();
    details.mockResolvedValue({ skill: { ...skill, canRead: false } });
    mount();
    await userEvent.click(await screen.findByText("Listed skill"));
    const dialog = within(screen.getByRole("dialog"));
    expect(await dialog.findByText("Restricted access")).toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Add to favorites" })
    ).not.toBeInTheDocument();
    expect(
      dialog.queryByRole("link", { name: "Edit skill" })
    ).not.toBeInTheDocument();
  });

  it.each([
    { isAdmin: false, status: "active", visible: false },
    { isAdmin: true, status: "active", visible: true },
    { isAdmin: false, status: "suggested", visible: true },
  ] as const)("preserves editor visibility for admin=$isAdmin / $status", async ({
    isAdmin,
    status,
    visible,
  }) => {
    const { mount } = await setup({
      deepLink: true,
      isAdmin,
      skillOverrides: {
        status,
        availability: "editors",
        canWrite: false,
        canAdministrate: true,
      },
    });
    mount();
    if (visible) {
      expect(
        await screen.findByRole("heading", { name: "Fetched skill" })
      ).toBeInTheDocument();
    } else {
      expect(
        await screen.findByText("Skill not available")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("heading", { name: "Fetched skill" })
      ).not.toBeInTheDocument();
    }
  });
});
