import * as workosAudit from "@app/lib/api/audit/workos_audit";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { processWorkOSEventActivity } from "@app/temporal/workos_events_queue/activities";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { OrganizationDomainDeletedEvent } from "@workos-inc/node";
import {
  OrganizationDomainState,
  OrganizationDomainVerificationStrategy,
} from "@workos-inc/node";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/audit/workos_audit", async () => {
  const actual = await vi.importActual("@app/lib/api/audit/workos_audit");
  return { ...actual, emitAuditLogEventDirect: vi.fn() };
});

vi.mock("@app/lib/api/workos/organization_primitives", async () => {
  const actual = await vi.importActual(
    "@app/lib/api/workos/organization_primitives"
  );
  return {
    ...actual,
    listWorkOSOrganizationsWithDomain: vi.fn().mockResolvedValue([]),
  };
});

describe("processWorkOSEventActivity", () => {
  it("idempotently deletes the workspace domain when WorkOS deletes it", async () => {
    const workspace = await WorkspaceFactory.basic();
    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource || !workspace.workOSOrganizationId) {
      throw new Error("Expected a workspace with a WorkOS organization");
    }

    const domain = "deleted.example.com";
    const upsertResult = await workspaceResource.upsertWorkspaceDomain({
      domain,
    });
    expect(upsertResult.isOk()).toBe(true);

    const now = new Date().toISOString();
    const event: OrganizationDomainDeletedEvent = {
      id: "evt_domain_deleted",
      event: "organization_domain.deleted",
      context: undefined,
      createdAt: now,
      data: {
        object: "organization_domain",
        id: "org_domain_deleted",
        organizationId: workspace.workOSOrganizationId,
        domain,
        state: OrganizationDomainState.Verified,
        verificationStrategy: OrganizationDomainVerificationStrategy.Manual,
        createdAt: now,
        updatedAt: now,
      },
    };

    await processWorkOSEventActivity({ eventPayload: event });
    await processWorkOSEventActivity({ eventPayload: event });

    await expect(workspaceResource.getVerifiedDomains()).resolves.toEqual([]);
    expect(workosAudit.emitAuditLogEventDirect).toHaveBeenCalledTimes(1);
    expect(workosAudit.emitAuditLogEventDirect).toHaveBeenCalledWith({
      workspace: expect.objectContaining({
        sId: workspace.sId,
        name: workspace.name,
      }),
      action: "domain.removed",
      actor: { type: "system", id: "workos", name: "WorkOS" },
      targets: [{ type: "workspace", id: workspace.sId, name: workspace.name }],
      context: { location: "system" },
      metadata: { domain },
    });
  });
});
