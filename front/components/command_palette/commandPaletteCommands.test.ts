import type { BuildCommandsDeps } from "@app/components/command_palette/commandPaletteCommands";
import {
  buildCommandPaletteCommands,
  filterCommands,
} from "@app/components/command_palette/commandPaletteCommands";
import type {
  ConcreteResourceType,
  GrantVerb,
} from "@app/types/group_permissions";
import type { SubscriptionType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it, vi } from "vitest";

const OWNER = {
  sId: "w123",
  name: "Test workspace",
  role: "admin",
} as WorkspaceType;

const SUBSCRIPTION = {
  plan: { code: "TEST_PLAN", limits: { canUseProduct: true } },
} as SubscriptionType;

function makeDeps(overrides: Partial<BuildCommandsDeps> = {}) {
  const deps: BuildCommandsDeps = {
    owner: OWNER,
    subscription: SUBSCRIPTION,
    featureFlags: [],
    hasPermission: () => true,
    currentRoute: "/w/w123/conversation/new",
    navigate: vi.fn(),
    setTheme: vi.fn(),
    openCreatePod: vi.fn(),
    openCreateSpace: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
  return deps;
}

function idsOf(deps: BuildCommandsDeps) {
  return buildCommandPaletteCommands(deps).map((c) => c.id);
}

describe("buildCommandPaletteCommands", () => {
  it("always offers a new conversation and a new pod", () => {
    const ids = idsOf(makeDeps());
    expect(ids).toContain("create.conversation");
    expect(ids).toContain("create.pod");
  });

  it("hides agent and skill creation without the matching permission", () => {
    const hasPermission = (verb: GrantVerb, resource: ConcreteResourceType) =>
      !(verb === "create" && (resource === "agent" || resource === "skill"));

    const ids = idsOf(makeDeps({ hasPermission }));

    expect(ids).not.toContain("create.agent");
    expect(ids).not.toContain("create.agent-from-template");
    expect(ids).not.toContain("create.skill");
    expect(ids).toContain("create.space");
  });

  it("hides space creation without the space create permission", () => {
    const hasPermission = (verb: GrantVerb, resource: ConcreteResourceType) =>
      !(verb === "create" && resource === "space");

    expect(idsOf(makeDeps({ hasPermission }))).not.toContain("create.space");
  });

  it("drops Labs when the plan cannot use the product", () => {
    const subscription = {
      plan: { code: "TEST_PLAN", limits: { canUseProduct: false } },
    } as SubscriptionType;

    const ids = idsOf(makeDeps({ subscription }));

    expect(ids).not.toContain("nav.labs");
    // Navigation and sign-out remain reachable.
    expect(ids).toContain("nav.conversations");
    expect(ids).toContain("account.sign-out");
  });

  it("omits workspace commands entirely for a plain member", () => {
    const owner = { ...OWNER, role: "user" } as WorkspaceType;
    const ids = idsOf(makeDeps({ owner, hasPermission: () => false }));

    expect(ids.some((id) => id.startsWith("workspace."))).toBe(false);
  });

  it("derives workspace commands from the admin navigation for an admin", () => {
    const ids = idsOf(makeDeps());

    expect(ids).toContain("workspace.members");
    expect(ids).toContain("workspace.invite-member");
  });

  it("routes theme commands to setTheme", () => {
    const setTheme = vi.fn();
    const commands = buildCommandPaletteCommands(makeDeps({ setTheme }));

    commands.find((c) => c.id === "appearance.theme-dark")?.run();

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("produces unique command ids", () => {
    const ids = idsOf(makeDeps());
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("filterCommands", () => {
  const commands = buildCommandPaletteCommands(makeDeps());

  it("returns everything for an empty query", () => {
    expect(filterCommands(commands, "   ")).toHaveLength(commands.length);
  });

  it("matches on the label", () => {
    const ids = filterCommands(commands, "new agent").map((c) => c.id);
    expect(ids).toContain("create.agent");
  });

  it("matches on keywords, not just the label", () => {
    const ids = filterCommands(commands, "assistant").map((c) => c.id);
    expect(ids).toContain("nav.agents");

    const logoutIds = filterCommands(commands, "logout").map((c) => c.id);
    expect(logoutIds).toContain("account.sign-out");
  });

  it("is case-insensitive", () => {
    expect(filterCommands(commands, "DARK").map((c) => c.id)).toContain(
      "appearance.theme-dark"
    );
  });

  it("returns nothing for an unmatched query", () => {
    expect(filterCommands(commands, "zzzznotacommand")).toHaveLength(0);
  });
});
