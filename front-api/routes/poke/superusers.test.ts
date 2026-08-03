import type { Authenticator } from "@app/lib/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockList = vi.fn();
const mockSetRoles = vi.fn();
const mockSetDustSuperUser = vi.fn();
const mockAuditLog = vi.fn();

vi.mock("@app/lib/api/poke/superusers", () => ({
  listSuperuserMembers: (...args: unknown[]) => mockList(...args),
  setPokeRoles: (...args: unknown[]) => mockSetRoles(...args),
  setDustSuperUser: (...args: unknown[]) => mockSetDustSuperUser(...args),
  SuperuserAdminError: class SuperuserAdminError extends Error {},
}));

const fakeAuth = {
  getNonNullableWorkspace: () => ({ sId: "ws-1", name: "Dust" }),
  getNonNullableUser: () => ({
    email: "admin@dust.tt",
    toJSON: () => ({ sId: "admin-1", email: "admin@dust.tt" }),
  }),
} as unknown as Authenticator;

vi.mock("@app/lib/api/config", async (importOriginal) => {
  const { createAppConfigMock } = await import(
    "@app/tests/utils/mocks/app_config"
  );
  return createAppConfigMock(importOriginal, {
    getProductionDustWorkspaceId: () => "ws-1",
    getRegion: () => "us-central1",
  });
});

vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    fromSuperUserSession: vi.fn(async () => fakeAuth),
  },
}));

let isAdmin = true;
vi.mock("@app/lib/poke/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/poke/roles")>();
  return { ...actual, hasPokeRole: () => isAdmin };
});

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  auditLog: (...args: unknown[]) => mockAuditLog(...args),
}));

async function buildApp() {
  const { default: routes } = await import("./superusers");
  const app = new Hono();
  app.use("*", async (ctx, next) => {
    ctx.set("pokeRoles" as never, ["admin"] as never);
    ctx.set("session" as never, {} as never);
    await next();
  });
  app.route("/", routes);
  return app;
}

describe("poke superuser routes", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.clearAllMocks();
    isAdmin = true;
    app = await buildApp();
  });

  it("lists workspace members and orphaned JSON entries", async () => {
    mockList.mockResolvedValue({ members: [], orphanedRoleEntries: [] });

    const response = await app.request("/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      members: [],
      orphanedRoleEntries: [],
    });
  });

  it("updates a JSON role entry and records an internal audit log", async () => {
    mockSetRoles.mockResolvedValue({
      email: "user@dust.tt",
      previousRoles: ["support"],
      newRoles: ["admin"],
    });

    const response = await app.request("/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@dust.tt", roles: ["admin"] }),
    });

    expect(response.status).toBe(200);
    expect(mockSetRoles).toHaveBeenCalledWith(fakeAuth, "user@dust.tt", [
      "admin",
    ]);
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "poke_roles.updated",
        targetEmail: "user@dust.tt",
        previousRoles: ["support"],
        newRoles: ["admin"],
      }),
      "[Security] Poke roles changed"
    );
  });

  it("toggles isDustSuperUser and records an internal audit log", async () => {
    mockSetDustSuperUser.mockResolvedValue({
      email: "user@dust.tt",
      userSId: "user-1",
      previousValue: false,
      newValue: true,
    });

    const response = await app.request("/user-1/superuser", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDustSuperUser: true }),
    });

    expect(response.status).toBe(200);
    expect(mockSetDustSuperUser).toHaveBeenCalledWith(fakeAuth, "user-1", true);
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "dust_superuser.toggled",
        previousValue: false,
        newValue: true,
      }),
      "[Security] Dust superuser flag changed"
    );
  });

  it.each([
    ["GET", "/", undefined],
    ["PATCH", "/roles", { email: "user@dust.tt", roles: ["admin"] }],
    ["PATCH", "/user-1/superuser", { isDustSuperUser: true }],
  ])("rejects non-admins: %s %s", async (method, path, body) => {
    isAdmin = false;
    const response = await app.request(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    expect(response.status).toBe(403);
  });
});
