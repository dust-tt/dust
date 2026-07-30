import type { SuperuserMutationResult } from "@app/lib/api/poke/superusers";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types/shared/result";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuditLog = vi.fn();

const mockGrantSuperuser = vi.fn();
const mockRevokeSuperuser = vi.fn();
const mockUpdateSuperuserRoles = vi.fn();
const mockRepairSuperuserDrift = vi.fn();

vi.mock("@app/lib/api/poke/superusers", () => ({
  grantSuperuser: (...args: unknown[]) => mockGrantSuperuser(...args),
  revokeSuperuser: (...args: unknown[]) => mockRevokeSuperuser(...args),
  updateSuperuserRoles: (...args: unknown[]) =>
    mockUpdateSuperuserRoles(...args),
  repairSuperuserDrift: (...args: unknown[]) =>
    mockRepairSuperuserDrift(...args),
}));

const fakeAuth = {
  getNonNullableWorkspace: () => ({ sId: "ws-sid-1", name: "Test Workspace" }),
  getNonNullableUser: () => ({
    email: "admin@example.com",
    toJSON: () => ({ sId: "admin-sid-1", email: "admin@example.com" }),
  }),
  clientIp: () => "127.0.0.1",
} as unknown as Authenticator;

vi.mock("@app/lib/api/config", async (importOriginal) => {
  const { createAppConfigMock } = await import(
    "@app/tests/utils/mocks/app_config"
  );
  return createAppConfigMock(importOriginal, {
    getProductionDustWorkspaceId: () => "production-workspace-id",
    getRegion: () => "us-central1",
  });
});

vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    fromSuperUserSession: vi.fn(async () => fakeAuth),
  },
}));

vi.mock("@app/lib/workspace", () => ({
  renderLightWorkspaceType: ({
    workspace,
  }: {
    workspace: { sId: string; name: string };
  }) => workspace,
}));

let mockHasPokeRole = true;
vi.mock("@app/lib/poke/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/poke/roles")>();
  return {
    ...actual,
    hasPokeRole: () => mockHasPokeRole,
    loadRolesWithGeneration: vi.fn(),
  };
});

vi.mock("@app/logger/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  auditLog: (...args: unknown[]) => mockAuditLog(...args),
}));

vi.mock("@app/lib/resources/membership_resource", () => ({
  MembershipResource: { getActiveMemberships: vi.fn() },
}));

const mockFetchById = vi.fn();
vi.mock("@app/lib/resources/user_resource", () => ({
  UserResource: {
    fetchByModelIds: vi.fn(),
    fetchByEmail: vi.fn(),
    fetchById: vi.fn(async (...args: unknown[]) => mockFetchById(...args)),
  },
}));

function makeMutationResult(
  overrides: Partial<SuperuserMutationResult> = {}
): SuperuserMutationResult {
  return {
    email: "alice@example.com",
    targetSId: "user-sid-1",
    targetName: "Alice User",
    previousState: { isDustSuperUser: false, pokeRoles: [] },
    newState: { isDustSuperUser: true, pokeRoles: ["admin"] },
    ...overrides,
  };
}

async function buildTestApp() {
  const { default: superusersApp } = await import(
    "@front-api/routes/poke/superusers"
  );

  const app = new Hono();
  app.use("*", async (ctx, next) => {
    ctx.set("pokeRoles" as never, ["admin"] as never);
    ctx.set(
      "session" as never,
      { user: { email: "admin@example.com" } } as never
    );
    await next();
  });
  app.route("/", superusersApp);
  return app;
}

describe("Audit event emission from route handlers", () => {
  let app: Hono;

  beforeEach(async () => {
    mockAuditLog.mockReset();
    mockGrantSuperuser.mockReset();
    mockRevokeSuperuser.mockReset();
    mockUpdateSuperuserRoles.mockReset();
    mockRepairSuperuserDrift.mockReset();
    mockFetchById.mockReset();
    mockHasPokeRole = true;
    mockFetchById.mockResolvedValue({
      sId: "user-sid-1",
      email: "alice@example.com",
      fullName: () => "Alice User",
    });
    app = await buildTestApp();
  });

  it("emits superuser.granted with correct targets and metadata", async () => {
    const result = makeMutationResult({
      previousState: { isDustSuperUser: false, pokeRoles: [] },
      newState: { isDustSuperUser: true, pokeRoles: ["admin", "engineering"] },
    });
    mockGrantSuperuser.mockResolvedValue(new Ok(result));

    const res = await app.request("/user-sid-1/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: ["admin", "engineering"], generation: 1 }),
    });

    expect(res.status).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledOnce();

    const call = mockAuditLog.mock.calls[0][0];
    expect(call.action).toBe("superuser.granted");
    expect(call).toEqual({
      author: { sId: "admin-sid-1", email: "admin@example.com" },
      action: "superuser.granted",
      workspaceId: "ws-sid-1",
      targetUserId: "user-sid-1",
      targetUserName: "Alice User",
      previousRoles: [],
      newRoles: ["admin", "engineering"],
      previousIsDustSuperUser: false,
      newIsDustSuperUser: true,
      region: "us-central1",
      outcome: "success",
      rolesWritten: true,
      dbUpdated: true,
      currentDriftState: "ok",
      remediation: "",
    });
    expect(mockAuditLog.mock.calls[0][1]).toBe(
      "[Security] Poke superuser permissions changed"
    );
  });

  it("emits superuser.revoked with correct targets and metadata", async () => {
    const result = makeMutationResult({
      previousState: {
        isDustSuperUser: true,
        pokeRoles: ["admin", "engineering"],
      },
      newState: { isDustSuperUser: false, pokeRoles: [] },
    });
    mockRevokeSuperuser.mockResolvedValue(new Ok(result));

    const res = await app.request("/user-sid-1/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation: 1 }),
    });

    expect(res.status).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledOnce();

    const call = mockAuditLog.mock.calls[0][0];
    expect(call.action).toBe("superuser.revoked");
    expect(call).toMatchObject({
      targetUserId: "user-sid-1",
      targetUserName: "Alice User",
      previousRoles: ["admin", "engineering"],
      newRoles: [],
      previousIsDustSuperUser: true,
      newIsDustSuperUser: false,
      region: "us-central1",
      outcome: "success",
      rolesWritten: true,
      dbUpdated: true,
      currentDriftState: "none",
      remediation: "",
    });
  });

  it("emits superuser.roles_updated with correct targets and metadata", async () => {
    const result = makeMutationResult({
      previousState: { isDustSuperUser: true, pokeRoles: ["admin"] },
      newState: {
        isDustSuperUser: true,
        pokeRoles: ["admin", "engineering", "support"],
      },
    });
    mockUpdateSuperuserRoles.mockResolvedValue(new Ok(result));

    const res = await app.request("/user-sid-1/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roles: ["admin", "engineering", "support"],
        generation: 1,
      }),
    });

    expect(res.status).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledOnce();

    const call = mockAuditLog.mock.calls[0][0];
    expect(call.action).toBe("superuser.roles_updated");
    expect(call).toMatchObject({
      targetUserId: "user-sid-1",
      targetUserName: "Alice User",
      previousRoles: ["admin"],
      newRoles: ["admin", "engineering", "support"],
      previousIsDustSuperUser: true,
      newIsDustSuperUser: true,
      region: "us-central1",
      outcome: "success",
      rolesWritten: true,
      dbUpdated: false,
      currentDriftState: "ok",
      remediation: "",
    });
  });

  it("emits superuser.drift_repaired with db_only drift_state", async () => {
    const result = makeMutationResult({
      previousState: { isDustSuperUser: true, pokeRoles: [] },
      newState: { isDustSuperUser: true, pokeRoles: ["admin"] },
    });
    mockRepairSuperuserDrift.mockResolvedValue(new Ok(result));

    const res = await app.request("/user-sid-1/repair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation: 1 }),
    });

    expect(res.status).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledOnce();

    const call = mockAuditLog.mock.calls[0][0];
    expect(call.action).toBe("superuser.drift_repaired");
    expect(call).toMatchObject({
      previousRoles: [],
      newRoles: ["admin"],
      previousIsDustSuperUser: true,
      newIsDustSuperUser: true,
      region: "us-central1",
      outcome: "success",
      rolesWritten: true,
      dbUpdated: false,
      currentDriftState: "ok",
      remediation: "",
    });
  });

  it("emits drift_repaired with roles_only drift state", async () => {
    const result = makeMutationResult({
      previousState: {
        isDustSuperUser: false,
        pokeRoles: ["admin", "support"],
      },
      newState: { isDustSuperUser: true, pokeRoles: ["admin", "support"] },
    });
    mockRepairSuperuserDrift.mockResolvedValue(new Ok(result));

    const res = await app.request("/user-sid-1/repair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation: 1 }),
    });

    expect(res.status).toBe(200);
    const call = mockAuditLog.mock.calls[0][0];
    expect(call).toMatchObject({
      previousIsDustSuperUser: false,
      newIsDustSuperUser: true,
      rolesWritten: false,
      dbUpdated: true,
      currentDriftState: "ok",
      outcome: "success",
    });
  });

  it("audits a partial grant with the resulting drift and remediation", async () => {
    mockGrantSuperuser.mockResolvedValue(
      new Err({
        type: "partial_failure",
        message: "DB update failed",
        partialFailure: {
          rolesWritten: true,
          dbUpdated: false,
          currentDriftState: "roles_only",
          remediation: "Use repair-drift to sync DB with GCS roles",
          previousState: { isDustSuperUser: false, pokeRoles: [] },
          currentState: {
            isDustSuperUser: false,
            pokeRoles: ["admin"],
          },
        },
      })
    );

    const res = await app.request("/user-sid-1/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: ["admin"], generation: 1 }),
    });

    expect(res.status).toBe(500);
    expect(mockAuditLog).toHaveBeenCalledOnce();
    const call = mockAuditLog.mock.calls[0][0];
    expect(call.action).toBe("superuser.granted");
    expect(call).toMatchObject({
      previousRoles: [],
      newRoles: ["admin"],
      previousIsDustSuperUser: false,
      newIsDustSuperUser: false,
      region: "us-central1",
      outcome: "partial_failure",
      rolesWritten: true,
      dbUpdated: false,
      currentDriftState: "roles_only",
      remediation: "Use repair-drift to sync DB with GCS roles",
    });
  });

  it("audits a partial revoke with the resulting drift and remediation", async () => {
    mockRevokeSuperuser.mockResolvedValue(
      new Err({
        type: "partial_failure",
        message: "GCS update failed",
        partialFailure: {
          rolesWritten: false,
          dbUpdated: true,
          currentDriftState: "roles_only",
          remediation: "Retry revoke to remove stale GCS roles",
          previousState: {
            isDustSuperUser: true,
            pokeRoles: ["admin"],
          },
          currentState: {
            isDustSuperUser: false,
            pokeRoles: ["admin"],
          },
        },
      })
    );

    const res = await app.request("/user-sid-1/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation: 1 }),
    });

    expect(res.status).toBe(500);
    expect(mockAuditLog).toHaveBeenCalledOnce();
    const call = mockAuditLog.mock.calls[0][0];
    expect(call.action).toBe("superuser.revoked");
    expect(call).toMatchObject({
      outcome: "partial_failure",
      rolesWritten: false,
      dbUpdated: true,
      currentDriftState: "roles_only",
      previousIsDustSuperUser: true,
      newIsDustSuperUser: false,
    });
  });

  it("does NOT emit audit event when grant fails", async () => {
    mockGrantSuperuser.mockResolvedValue({
      isOk: () => false,
      isErr: () => true,
      error: { type: "not_found", message: "User not found" },
    });

    const res = await app.request("/user-sid-1/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: ["admin"], generation: 1 }),
    });

    expect(res.status).toBe(404);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it("does NOT emit audit event when revoke fails", async () => {
    mockRevokeSuperuser.mockResolvedValue({
      isOk: () => false,
      isErr: () => true,
      error: { type: "not_superuser", message: "Not a superuser" },
    });

    const res = await app.request("/user-sid-1/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation: 1 }),
    });

    expect(res.status).toBe(400);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it("does NOT emit audit event when update-roles fails", async () => {
    mockUpdateSuperuserRoles.mockResolvedValue({
      isOk: () => false,
      isErr: () => true,
      error: { type: "last_admin", message: "Cannot remove last admin" },
    });

    const res = await app.request("/user-sid-1/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: ["engineering"], generation: 1 }),
    });

    expect(res.status).toBe(400);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it("does NOT emit audit event when repair fails", async () => {
    mockRepairSuperuserDrift.mockResolvedValue({
      isOk: () => false,
      isErr: () => true,
      error: { type: "no_drift", message: "No drift detected" },
    });

    const res = await app.request("/user-sid-1/repair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation: 1 }),
    });

    expect(res.status).toBe(400);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it("repair passes roles from body to business function", async () => {
    const result = makeMutationResult({
      previousState: { isDustSuperUser: true, pokeRoles: [] },
      newState: { isDustSuperUser: true, pokeRoles: ["admin", "support"] },
    });
    mockRepairSuperuserDrift.mockResolvedValue(new Ok(result));

    const res = await app.request("/user-sid-1/repair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generation: 1,
        roles: ["admin", "support"],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockRepairSuperuserDrift).toHaveBeenCalledOnce();
    const callArgs = mockRepairSuperuserDrift.mock.calls[0];
    expect(callArgs[3]).toEqual(["admin", "support"]);
  });
});

describe("Admin authorization (403)", () => {
  let app: Hono;

  beforeEach(async () => {
    mockFetchById.mockReset();
    mockHasPokeRole = false;
    mockFetchById.mockResolvedValue({
      sId: "user-sid-1",
      email: "alice@example.com",
    });
    app = await buildTestApp();
  });

  it("GET / returns 403 when user lacks admin role", async () => {
    const res = await app.request("/", { method: "GET" });
    expect(res.status).toBe(403);
  });

  it("POST /:userSId/grant returns 403 when user lacks admin role", async () => {
    const res = await app.request("/user-sid-1/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: ["admin"], generation: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("POST /:userSId/revoke returns 403 when user lacks admin role", async () => {
    const res = await app.request("/user-sid-1/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("PATCH /:userSId/roles returns 403 when user lacks admin role", async () => {
    const res = await app.request("/user-sid-1/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: ["admin"], generation: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("POST /:userSId/repair returns 403 when user lacks admin role", async () => {
    const res = await app.request("/user-sid-1/repair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generation: 1 }),
    });
    expect(res.status).toBe(403);
  });
});
