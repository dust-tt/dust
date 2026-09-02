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
import type { UTMParams } from "@app/lib/utils/utm";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

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

  const workspace = await WorkspaceResource.makeNew({
    sId: generateRandomModelSId(),
    name,
    metadata,
  });

  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const { systemGroup, globalGroup } =
    await GroupResource.makeDefaultsForWorkspace(lightWorkspace);

  const auth = await Authenticator.internalAdminForWorkspace(
    lightWorkspace.sId
  );
  await SpaceResource.makeDefaultsForWorkspace(auth, {
    systemGroup,
    globalGroup,
  });

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

  // Every workspace gets a WorkOS organization (SSO/SCIM/domains/audit).
  // Failures are logged but do not block workspace creation — callers can
  // still complete signup, and getOrCreateWorkOSOrganization is idempotent.
  const orgRes = await getOrCreateWorkOSOrganization(lightWorkspace);
  if (orgRes.isErr()) {
    logger.error(
      { error: orgRes.error, workspaceId: workspace.sId },
      "Failed to create WorkOS organization during workspace creation"
    );
    return workspace;
  }

  // Re-fetch so the returned resource includes workOSOrganizationId; membership
  // creation immediately after relies on that field to sync to WorkOS.
  const refreshedWorkspace = await WorkspaceResource.fetchByModelId(
    workspace.id
  );
  return refreshedWorkspace ?? workspace;
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
