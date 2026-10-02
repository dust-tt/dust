import type * as workosAudit from "@app/lib/api/audit/workos_audit";
import { emitAuditLogEvent } from "@app/lib/api/audit/workos_audit";
import { removeWorkOSOrganizationDomain } from "@app/lib/api/workos/organization_primitives";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual<typeof workosAudit>(
    "@app/lib/api/audit/workos_audit"
  );
  return {
    ...actual,
    emitAuditLogEvent: vi.fn(),
  };
});

vi.mock("@app/lib/api/workos/organization_primitives", async () => {
  const actual = await vi.importActual(
    "@app/lib/api/workos/organization_primitives"
  );
  return {
    ...actual,
    listWorkOSOrganizationsWithDomain: vi.fn().mockResolvedValue([]),
    removeWorkOSOrganizationDomain: vi.fn(),
  };
});

async function setup(role: MembershipRoleType = "admin") {
  return createPrivateApiMockRequest({ method: "POST", role });
}

function post(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/domains`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function del(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/domains`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedDomain(workspaceId: string, domain: string) {
  const resource = await WorkspaceResource.fetchById(workspaceId);
  const res = await resource?.upsertWorkspaceDomain({ domain });
  expect(res?.isOk()).toBe(true);
}

function expectDomainRemovedAuditedOnce(domain: string) {
  expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(emitAuditLogEvent)).toHaveBeenCalledWith(
    expect.objectContaining({ action: "domain.removed", metadata: { domain } })
  );
}

async function verifiedDomains(workspaceId: string) {
  const resource = await WorkspaceResource.fetchById(workspaceId);
  return resource?.getVerifiedDomains() ?? [];
}

describe("POST /api/w/:wId/domains (auto-join)", () => {
  it("updates auto-join for a single named domain", async () => {
    const { workspace } = await setup();
    await seedDomain(workspace.sId, "acme.com");

    const response = await post(workspace, {
      domain: "acme.com",
      domainAutoJoinEnabled: true,
    });

    expect(response.status).toBe(200);
    expect((await response.json()).workspace.sId).toBe(workspace.sId);

    const domains = await verifiedDomains(workspace.sId);
    expect(domains).toEqual([
      { domain: "acme.com", domainAutoJoinEnabled: true },
    ]);
  });

  it("updates auto-join across all domains when no domain is provided", async () => {
    const { workspace } = await setup();
    await seedDomain(workspace.sId, "acme.com");
    await seedDomain(workspace.sId, "acme.io");

    const response = await post(workspace, { domainAutoJoinEnabled: true });

    expect(response.status).toBe(200);

    const domains = await verifiedDomains(workspace.sId);
    expect(domains).toHaveLength(2);
    expect(domains.every((d) => d.domainAutoJoinEnabled)).toBe(true);
  });

  it("applies per-domain updates in batch mode", async () => {
    const { workspace } = await setup();
    await seedDomain(workspace.sId, "acme.com");
    await seedDomain(workspace.sId, "acme.io");

    const response = await post(workspace, {
      domainUpdates: [
        { domain: "acme.com", domainAutoJoinEnabled: true },
        { domain: "acme.io", domainAutoJoinEnabled: false },
      ],
    });

    expect(response.status).toBe(200);

    const domains = await verifiedDomains(workspace.sId);
    expect(
      domains.find((d) => d.domain === "acme.com")?.domainAutoJoinEnabled
    ).toBe(true);
    expect(
      domains.find((d) => d.domain === "acme.io")?.domainAutoJoinEnabled
    ).toBe(false);
  });

  it("lets a member with the admin:security permission update auto-join", async () => {
    const { workspace, user } = await setup("user");
    await seedDomain(workspace.sId, "acme.com");

    await grantWorkspacePermission(workspace, user, {
      grantType: "admin",
      resourceType: "security",
    });

    const response = await post(workspace, {
      domain: "acme.com",
      domainAutoJoinEnabled: true,
    });

    expect(response.status).toBe(200);

    const domains = await verifiedDomains(workspace.sId);
    expect(domains[0]?.domainAutoJoinEnabled).toBe(true);
  });

  it("returns 403 for a member without the admin:security permission", async () => {
    const { workspace } = await setup("user");

    const response = await post(workspace, { domainAutoJoinEnabled: true });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message:
          "You do not have permission to manage identity and provisioning settings.",
      },
    });
  });
});

describe("DELETE /api/w/:wId/domains", () => {
  it("deletes the local domain and removes it from WorkOS", async () => {
    vi.mocked(removeWorkOSOrganizationDomain).mockResolvedValueOnce(
      new Ok(undefined)
    );
    const { workspace } = await setup();
    await seedDomain(workspace.sId, "acme.com");
    await seedDomain(workspace.sId, "acme.io");

    const response = await del(workspace, { domain: "acme.com" });

    expect(response.status).toBe(204);
    expect(await verifiedDomains(workspace.sId)).toEqual([
      { domain: "acme.io", domainAutoJoinEnabled: false },
    ]);
    expect(removeWorkOSOrganizationDomain).toHaveBeenCalledWith(
      expect.objectContaining({ sId: workspace.sId }),
      { domain: "acme.com" }
    );
    expectDomainRemovedAuditedOnce("acme.com");
  });

  it("revokes the local domain even when the WorkOS removal fails", async () => {
    vi.mocked(removeWorkOSOrganizationDomain).mockResolvedValueOnce(
      new Err(new Error("WorkOS unavailable"))
    );
    const { workspace } = await setup();
    await seedDomain(workspace.sId, "acme.com");

    const response = await del(workspace, { domain: "acme.com" });

    expect(response.status).toBe(400);
    expect(await verifiedDomains(workspace.sId)).toEqual([]);
    expectDomainRemovedAuditedOnce("acme.com");
  });

  it("does not audit when a WorkOS-only removal fails", async () => {
    vi.mocked(removeWorkOSOrganizationDomain).mockResolvedValueOnce(
      new Err(new Error("WorkOS unavailable"))
    );
    const { workspace } = await setup();

    const response = await del(workspace, { domain: "pending.com" });

    expect(response.status).toBe(400);
    expect(vi.mocked(emitAuditLogEvent)).not.toHaveBeenCalled();
  });

  it("removes a domain that only exists in WorkOS", async () => {
    vi.mocked(removeWorkOSOrganizationDomain).mockResolvedValueOnce(
      new Ok(undefined)
    );
    const { workspace } = await setup();

    const response = await del(workspace, { domain: "pending.com" });

    expect(response.status).toBe(204);
    expect(removeWorkOSOrganizationDomain).toHaveBeenCalledWith(
      expect.objectContaining({ sId: workspace.sId }),
      { domain: "pending.com" }
    );
    expectDomainRemovedAuditedOnce("pending.com");
  });

  it("returns 403 for a member without the admin:security permission", async () => {
    const { workspace } = await setup("user");
    await seedDomain(workspace.sId, "acme.com");

    const response = await del(workspace, { domain: "acme.com" });

    expect(response.status).toBe(403);
    expect(await verifiedDomains(workspace.sId)).toHaveLength(1);
    expect(vi.mocked(emitAuditLogEvent)).not.toHaveBeenCalled();
  });
});
