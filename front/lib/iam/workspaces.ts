import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { PlanModel } from "@app/lib/models/plan";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

export async function createWorkspace(session: SessionWithUser) {
  const { user: externalUser } = session;

  return createWorkspaceInternal({
    name: externalUser.nickname,
    isBusiness: false,
    planCode: null,
    endDate: null,
  });
}

export async function createWorkspaceInternal({
  name,
  isBusiness,
  planCode,
  endDate,
}: {
  name: string;
  isBusiness: boolean;
  planCode: string | null;
  endDate: Date | null;
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

  const workspace = await WorkspaceModel.create({
    sId: generateRandomModelSId(),
    name,
    metadata: {
      isBusiness,
    },
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

  // Ensure all auto MCP server views are created for the workspace
  await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

  if (planCode) {
    await SubscriptionResource.internalSubscribeWorkspaceToFreePlan({
      workspaceId: workspace.sId,
      planCode,
      endDate,
    });
  }

  return workspace;
}

export async function findWorkspaceWithVerifiedDomain(user: {
  email: string;
  email_verified: boolean;
}): Promise<WorkspaceHasDomainModel | null> {
  if (!user.email_verified) {
    return null;
  }

  const [, userEmailDomain] = user.email.split("@");
  const workspaceWithVerifiedDomain = await WorkspaceHasDomainModel.findOne({
    where: {
      domain: userEmailDomain,
    },
    include: [
      {
        model: WorkspaceModel,
        as: "workspace",
        required: true,
      },
    ],
  });

  return workspaceWithVerifiedDomain;
}
