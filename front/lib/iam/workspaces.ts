import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { Workspace } from "@app/lib/models/workspace";
import { WorkspaceHasDomain } from "@app/lib/models/workspace_has_domain";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { isDisposableEmailDomain } from "@app/lib/utils/disposable_email_domains";
import { renderLightWorkspaceType } from "@app/lib/workspace";

export async function createWorkspace(session: SessionWithUser) {
  const { user: externalUser } = session;

  return createWorkspaceInternal({
    email: externalUser.email,
    name: externalUser.nickname,
    isVerified: externalUser.email_verified,
    isBusiness: false,
    planCode: null,
    endDate: null,
  });
}

export async function createWorkspaceInternal({
  email,
  name,
  isVerified,
  isBusiness,
  planCode,
  endDate,
}: {
  email: string;
  name: string;
  isVerified: boolean;
  isBusiness: boolean;
  planCode: string | null;
  endDate: Date | null;
}) {
  const [, emailDomain] = email.split("@");

  // Use domain only when email is verified and non-disposable.
  const verifiedDomain =
    isVerified && !isDisposableEmailDomain(emailDomain) ? emailDomain : null;

  const workspace = await Workspace.create({
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

  if (verifiedDomain) {
    try {
      await WorkspaceHasDomain.create({
        domain: verifiedDomain,
        domainAutoJoinEnabled: false,
        workspaceId: workspace.id,
      });
    } catch (err) {
      // `WorkspaceHasDomain` table has a unique constraint on the domain column.
      // Suppress any creation errors to prevent disruption of the login process.
    }
  }

  if (planCode) {
    if (!isFreePlan(planCode)) {
      throw new Error(
        `Invalid plan code: ${planCode}. Only free plans are supported.`
      );
    }
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
}): Promise<WorkspaceHasDomain | null> {
  if (!user.email_verified) {
    return null;
  }

  const [, userEmailDomain] = user.email.split("@");
  const workspaceWithVerifiedDomain = await WorkspaceHasDomain.findOne({
    where: {
      domain: userEmailDomain,
    },
    include: [
      {
        model: Workspace,
        as: "workspace",
        required: true,
      },
    ],
  });

  return workspaceWithVerifiedDomain;
}
