import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { literal, Op } from "sequelize";
import { describe, expect, it } from "vitest";

describe("WorkspaceResource.listAll where", () => {
  it("filters workspaces missing a WorkOS organization id", async () => {
    const withOrg = await WorkspaceFactory.basic();
    await WorkspaceResource.updateWorkOSOrganizationId(
      withOrg.id,
      "org_list_all_filter"
    );
    const withoutOrg = await WorkspaceFactory.basic();
    await WorkspaceResource.updateWorkOSOrganizationId(withoutOrg.id, null);

    const workspaces = await WorkspaceResource.listAll("ASC", {
      where: { workOSOrganizationId: { [Op.is]: null } },
    });

    const ids = new Set(workspaces.map((w) => w.id));
    expect(ids.has(withoutOrg.id)).toBe(true);
    expect(ids.has(withOrg.id)).toBe(false);
  });
});

describe("runOnAllWorkspaces where", () => {
  it("applies SQL where and fromWorkspaceId before invoking the worker", async () => {
    const relocated = await WorkspaceFactory.basic();
    await WorkspaceResource.updateWorkOSOrganizationId(relocated.id, null);
    await WorkspaceResource.updateMetadata(relocated.id, {
      maintenance: "relocation-done",
    });

    const withOrg = await WorkspaceFactory.basic();
    await WorkspaceResource.updateWorkOSOrganizationId(
      withOrg.id,
      "org_run_all_filter"
    );

    const withoutOrg = await WorkspaceFactory.basic();
    await WorkspaceResource.updateWorkOSOrganizationId(withoutOrg.id, null);

    const seen: number[] = [];
    await runOnAllWorkspaces(
      async (workspace) => {
        seen.push(workspace.id);
      },
      {
        fromWorkspaceId: Math.min(relocated.id, withOrg.id, withoutOrg.id),
        where: {
          [Op.and]: [
            { workOSOrganizationId: { [Op.is]: null } },
            literal(
              `(metadata->>'maintenance') IS DISTINCT FROM 'relocation-done'`
            ),
          ],
        },
      }
    );

    expect(seen).toContain(withoutOrg.id);
    expect(seen).not.toContain(withOrg.id);
    expect(seen).not.toContain(relocated.id);
  });
});
