import { sendUserOperationMessage } from "@dust-tt/types";

import type { SessionWithUser } from "@app/lib/iam/provider";
import { Workspace, WorkspaceHasDomain } from "@app/lib/models/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { isDisposableEmailDomain } from "@app/lib/utils/disposable_email_domains";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export async function createWorkspace(session: SessionWithUser) {
  const { user: externalUser } = session;

  return createWorkspaceInternal({
    email: externalUser.email,
    name: externalUser.nickname,
    isVerified: externalUser.email_verified,
  });
}

export async function createWorkspaceInternal({
  email,
  name,
  isVerified,
}: {
  email: string;
  name: string;
  isVerified: boolean;
}) {
  const [, emailDomain] = email.split("@");

  // Use domain only when email is verified and non-disposable.
  const verifiedDomain =
    isVerified && !isDisposableEmailDomain(emailDomain) ? emailDomain : null;

  const workspace = await Workspace.create({
    sId: generateLegacyModelSId(),
    name: name,
  });

  const lightWorkspace = renderLightWorkspaceType({ workspace });

  const { systemGroup, globalGroup } =
    await GroupResource.makeDefaultsForWorkspace(lightWorkspace);

  await VaultResource.makeDefaultsForWorkspace(lightWorkspace, {
    systemGroup,
    globalGroup,
  });

  sendUserOperationMessage({
    message: `<@U055XEGPR4L> +signupRadar User ${email} has created a new workspace.`,
    logger,
    channel: "C075LJ6PUFQ",
  }).catch((err) => {
    logger.error(
      { error: err },
      "Failed to send user operation message to Slack (signup)."
    );
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

  return workspace;
}

export async function findWorkspaceWithVerifiedDomain(
  session: SessionWithUser
): Promise<WorkspaceHasDomain | null> {
  const { user } = session;

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
