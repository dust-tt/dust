import { loadRolesForEditing, writeRoles } from "@app/lib/poke/roles";
import { UserResource } from "@app/lib/resources/user_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(
  (): {
    productionWorkspaceId: string | undefined;
    auditLog: ReturnType<typeof vi.fn>;
  } => ({
    productionWorkspaceId: undefined,
    auditLog: vi.fn(),
  })
);

vi.mock("@app/lib/api/config", async (importOriginal) => {
  const { createAppConfigMock } = await import(
    "@app/tests/utils/mocks/app_config"
  );
  return createAppConfigMock(importOriginal, {
    getProductionDustWorkspaceId: () => state.productionWorkspaceId,
    getRegion: () => "us-central1",
  });
});

vi.mock("@app/types/shared/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/types/shared/env")>();
  return { ...actual, isDevelopment: () => false };
});

vi.mock("@app/logger/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/logger/logger")>();
  return { ...actual, auditLog: state.auditLog };
});

async function authenticateAdmin() {
  const request = await createPrivateApiMockRequest({ isSuperUser: true });
  state.productionWorkspaceId = request.workspace.sId;
  await writeRoles({ [request.user.email]: ["admin"] });
  return request;
}

describe("poke superuser routes", () => {
  beforeEach(() => {
    state.productionWorkspaceId = undefined;
    state.auditLog.mockClear();
    fileStorageMock.reset();
  });

  it("lists active regional members and the shared roles JSON", async () => {
    const { workspace, user: admin } = await authenticateAdmin();
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    await writeRoles({
      [admin.email]: ["admin"],
      [member.email]: ["support"],
      "former@dust.tt": ["talent"],
    });

    const response = await honoApp.request("/api/poke/superusers");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: member.email,
          isDustSuperUser: false,
        }),
      ])
    );
    expect(body.roleEntries).toEqual({
      [admin.email.toLowerCase()]: ["admin"],
      [member.email.toLowerCase()]: ["support"],
      "former@dust.tt": ["talent"],
    });
  });

  it("updates roles for an active member and audits the change", async () => {
    const { workspace } = await authenticateAdmin();
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });

    const response = await honoApp.request("/api/poke/superusers/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: member.email, roles: ["support"] }),
    });

    expect(response.status).toBe(200);
    expect(state.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "poke_roles.updated",
        targetEmail: member.email.toLowerCase(),
        newRoles: ["support"],
      }),
      "[Security] Poke roles changed"
    );
  });

  it("keeps an empty role entry and only removes it for null", async () => {
    const { workspace, user: admin } = await authenticateAdmin();
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });
    await writeRoles({
      [admin.email]: ["admin"],
      [member.email]: ["support"],
    });

    const emptyResponse = await honoApp.request("/api/poke/superusers/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: member.email, roles: [] }),
    });

    expect(emptyResponse.status).toBe(200);
    expect(await loadRolesForEditing()).toHaveProperty(
      member.email.toLowerCase(),
      []
    );

    const removeResponse = await honoApp.request("/api/poke/superusers/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: member.email, roles: null }),
    });

    expect(removeResponse.status).toBe(200);
    expect(await loadRolesForEditing()).not.toHaveProperty(
      member.email.toLowerCase()
    );
  });

  it("toggles isDustSuperUser for an active member", async () => {
    const { workspace } = await authenticateAdmin();
    const member = await UserFactory.basic();
    await MembershipFactory.associate(workspace, member, { role: "user" });

    const response = await honoApp.request(
      `/api/poke/superusers/${member.sId}/superuser`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDustSuperUser: true }),
      }
    );
    const updatedMember = await UserResource.fetchById(member.sId);

    expect(response.status).toBe(200);
    expect(updatedMember?.isDustSuperUser).toBe(true);
    expect(state.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "dust_superuser.toggled",
        targetUserId: member.sId,
        newValue: true,
      }),
      "[Security] Dust superuser flag changed"
    );
  });

  it("requires a fresh admin role from the JSON file", async () => {
    const { user } = await authenticateAdmin();
    await writeRoles({ [user.email]: ["support"] });

    const response = await honoApp.request("/api/poke/superusers");

    expect(response.status).toBe(403);
  });

  it("does not grant roles to someone outside the regional workspace", async () => {
    await authenticateAdmin();
    const outsider = await UserFactory.basic();

    const response = await honoApp.request("/api/poke/superusers/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: outsider.email, roles: ["support"] }),
    });

    expect(response.status).toBe(400);
    expect(state.auditLog).not.toHaveBeenCalled();
  });

  it("does not toggle someone outside the regional workspace", async () => {
    await authenticateAdmin();
    const outsider = await UserFactory.basic();

    const response = await honoApp.request(
      `/api/poke/superusers/${outsider.sId}/superuser`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDustSuperUser: true }),
      }
    );

    expect(response.status).toBe(400);
    expect(state.auditLog).not.toHaveBeenCalled();
  });
});
