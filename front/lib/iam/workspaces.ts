import { seedWorkspaceCapabilities } from "@app/lib/api/permissions/governance_seeding";
import { activateCreditPricedFreePlanForWorkspace } from "@app/lib/api/subscription";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { PlanModel } from "@app/lib/models/plan";
import { isCreditPricedFreePlan, isFreePlan } from "@app/lib/plans/plan_codes";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { UTMParams } from "@app/lib/utils/utm";
import { renderLightWorkspaceType } from "@app/lib/workspace";

export async function createWorkspace(
  session: SessionWithUser,
  utmParams?: UTMParams
) {
  const { user: externalUser } = session;

  return createWorkspaceInternal({
    name: externalUser.nickname,
    isBusiness: false,
    planCode: null,
    endDate: null,
    utmParams,
  });
}

export async function createWorkspaceInternal({
  name,
  isBusiness,
  planCode,
  endDate,
  utmParams,
}: {
  name: string;
  isBusiness: boolean;
  planCode: string | null;
  endDate: Date | null;
  utmParams?: UTMParams;
}) {
  // If planCode is provided, it must be a free plan that exists in the database.
  if (planCode) {
    if (!isFreePlan(planCode)) {
      throw new Error(
        `Invalid plan code: ${planCode}. Only free plans are supported.`
      );
    }
    const plan = await PlanModel.findOne({
      where: {
        code: planCode,
      },
    });
    if (!plan) {
      throw new Error(`Plan with code ${planCode} not found.`);
    }
  }

  const metadata: {
    isBusiness: boolean;
    utmTracking?: UTMParams & { capturedAt: number };
  } = {
    isBusiness,
  };

  if (utmParams && Object.keys(utmParams).length > 0) {
    metadata.utmTracking = {
      ...utmParams,
      capturedAt: Date.now(),
    };
  }

  // Core workspace rows + WorkOS org id are created atomically. If WorkOS
  // provisioning fails we roll back so we never leave a workspace without an
  // organization. Post-commit seeding (MCP, plan, governance) can fail without
  // undoing the WorkOS link.
  const workspace = await withTransaction(async (transaction) => {
    const created = await WorkspaceResource.makeNew(
      {
        sId: generateRandomModelSId(),
        name,
        metadata,
      },
      transaction
    );

    const lightWorkspace = renderLightWorkspaceType({ workspace: created });

    const { systemGroup, globalGroup } =
      await GroupResource.makeDefaultsForWorkspace(lightWorkspace, {
        transaction,
      });

    const auth = await Authenticator.internalAdminForWorkspace(
      lightWorkspace.sId,
      { transaction }
    );
    await SpaceResource.makeDefaultsForWorkspace(
      auth,
      {
        systemGroup,
        globalGroup,
      },
      transaction
    );

    const orgRes = await getOrCreateWorkOSOrganization(lightWorkspace, {
      transaction,
    });
    if (orgRes.isErr()) {
      throw orgRes.error;
    }

    const refreshedWorkspace = await WorkspaceResource.fetchByModelId(
      created.id,
      transaction
    );
    if (!refreshedWorkspace?.workOSOrganizationId) {
      throw new Error(
        "WorkOS organization was created but workspace was not updated."
      );
    }

    return refreshedWorkspace;
  });

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Seed default governance capability state (no-op until Phase 2 capabilities register seeders).
  await seedWorkspaceCapabilities(auth);

  // Ensure all auto MCP server views are created for the workspace
  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  if (planCode) {
    if (isCreditPricedFreePlan(planCode)) {
      await activateCreditPricedFreePlanForWorkspace(auth);
    } else {
      await SubscriptionResource.internalSubscribeWorkspaceToFreePlan({
        workspaceId: workspace.sId,
        planCode,
        endDate,
      });
    }
  }

  return workspace;
}

export async function findWorkspaceWithVerifiedDomain(user: {
  email: string;
  email_verified: boolean;
}): Promise<{
  workspace: WorkspaceResource;
  domainAutoJoinEnabled: boolean;
} | null> {
  if (!user.email_verified) {
    return null;
  }

  const [, userEmailDomain] = user.email.split("@");
  const result = await WorkspaceResource.fetchByDomainWithInfo(userEmailDomain);

  if (!result) {
    return null;
  }

  return {
    workspace: result.workspace,
    domainAutoJoinEnabled: result.domainInfo.domainAutoJoinEnabled,
  };
}
