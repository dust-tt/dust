import { checkWorkspaceFitsPlanLimits } from "@app/lib/api/plan_compatibility";
import type { Authenticator } from "@app/lib/auth";
import { renderPlanFromModel } from "@app/lib/plans/renderers";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { PlanFactory } from "@app/tests/utils/PlanFactory";
import type { PlanType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

async function planWithConnectionsLimit(count: number): Promise<PlanType> {
  const plan = await PlanFactory.enterprise(`ENT_CONN_LIMIT_${count}`, {
    maxConnectionsCount: count,
  });
  return renderPlanFromModel({ plan });
}

describe("checkWorkspaceFitsPlanLimits - connections limit", () => {
  let auth: Authenticator;
  let workspace: LightWorkspaceType;
  let globalSpace: SpaceResource;
  let user: UserResource;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "admin" });
    auth = setup.authenticator;
    workspace = setup.workspace;
    globalSpace = setup.globalSpace;
    user = setup.user;
  });

  it("fits when the connections limit is unlimited (-1)", async () => {
    await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "slack",
      user
    );
    await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "notion",
      user
    );

    const plan = await planWithConnectionsLimit(-1);
    const res = await checkWorkspaceFitsPlanLimits(auth, plan);

    expect(res.fits).toBe(true);
  });

  it("does not count folders, the web crawler, bots or project connectors toward the connections limit", async () => {
    await DataSourceViewFactory.folder(workspace, globalSpace, user);
    await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "webcrawler",
      user
    );
    await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "slack_bot",
      user
    );
    await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "dust_project",
      user
    );
    await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "slack",
      user
    );

    const plan = await planWithConnectionsLimit(1);
    const res = await checkWorkspaceFitsPlanLimits(auth, plan);

    expect(res.fits).toBe(true);
  });

  it("does not fit when connected data sources exceed the limit", async () => {
    await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "slack",
      user
    );
    await DataSourceViewFactory.fromConnector(
      workspace,
      globalSpace,
      "notion",
      user
    );

    const plan = await planWithConnectionsLimit(1);
    const res = await checkWorkspaceFitsPlanLimits(auth, plan);

    expect(res.fits).toBe(false);
    expect(res.violations.join(" ")).toContain("connected data sources");
  });
});
