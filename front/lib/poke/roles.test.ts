import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchFileContent: vi.fn(),
  isDevelopment: vi.fn(() => false),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@app/lib/file_storage", () => ({
  getPokeUserConfigBucket: () => ({
    fetchFileContent: mocks.fetchFileContent,
  }),
}));

vi.mock("@app/types/shared/env", () => ({
  isDevelopment: () => mocks.isDevelopment(),
}));

vi.mock("@app/logger/logger", () => ({
  default: mocks.logger,
}));

import type { AuthenticatedAccessUser } from "@app/lib/api/poke/cloudflare_access";
import {
  clearPokeRolesCacheForTests,
  getPokeRolesForPrincipal,
  hasPokeRole,
} from "@app/lib/poke/roles";

function accessUser(
  overrides: Partial<AuthenticatedAccessUser> & {
    identity: AuthenticatedAccessUser["identity"];
  }
): AuthenticatedAccessUser {
  return {
    subject: "sub-1",
    email: "seb@dust.tt",
    name: "Seb",
    ...overrides,
  };
}

describe("getPokeRolesForPrincipal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPokeRolesCacheForTests();
    mocks.isDevelopment.mockReturnValue(false);
    mocks.fetchFileContent.mockResolvedValue(
      JSON.stringify({
        "seb@dust.tt": ["admin", "billing"],
        "other@dust.tt": ["support"],
      })
    );
  });

  it("maps bare and email-shaped -mdm groups to poke roles", async () => {
    const roles = await getPokeRolesForPrincipal({
      kind: "cloudflare_access",
      user: accessUser({
        identity: {
          kind: "cross_checked",
          groupNames: [
            "engineering-mdm",
            "Billing-MDM@dust.tt",
            "support-mdm",
            "unrelated-group",
            "admin-mdm-extra",
          ],
        },
      }),
    });

    expect(roles).toEqual(["billing", "engineering", "support"]);
    expect(mocks.fetchFileContent).not.toHaveBeenCalled();
  });

  it("grants no roles for an empty cross-checked group list", async () => {
    const roles = await getPokeRolesForPrincipal({
      kind: "cloudflare_access",
      user: accessUser({
        identity: { kind: "cross_checked", groupNames: [] },
      }),
    });

    expect(roles).toEqual([]);
    expect(mocks.fetchFileContent).not.toHaveBeenCalled();
  });

  it("falls back to GCS for jwt_only Access principals", async () => {
    const roles = await getPokeRolesForPrincipal({
      kind: "cloudflare_access",
      user: accessUser({
        identity: { kind: "jwt_only" },
      }),
    });

    expect(roles).toEqual(["admin", "billing"]);
    expect(mocks.fetchFileContent).toHaveBeenCalledTimes(1);
  });

  it("falls back to GCS for email principals", async () => {
    const roles = await getPokeRolesForPrincipal({
      kind: "email",
      email: "other@dust.tt",
    });

    expect(roles).toEqual(["support"]);
  });

  it("returns all roles in development", async () => {
    mocks.isDevelopment.mockReturnValue(true);

    const roles = await getPokeRolesForPrincipal({
      kind: "cloudflare_access",
      user: accessUser({
        identity: { kind: "cross_checked", groupNames: [] },
      }),
    });

    expect(roles).toEqual([
      "admin",
      "billing",
      "engineering",
      "support",
      "talent",
    ]);
  });
});

describe("hasPokeRole", () => {
  it("returns true when any required role is present", () => {
    expect(hasPokeRole(["engineering"], ["billing", "engineering"])).toBe(true);
    expect(hasPokeRole(["support"], ["billing", "engineering"])).toBe(false);
  });
});
