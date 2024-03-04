import { isGoogleSession } from "@app/lib/iam/session";
import { Workspace, WorkspaceHasDomain } from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";
import { isDisposableEmailDomain } from "@app/lib/utils/disposable_email_domains";

export async function createWorkspace(session: any) {
  const [, emailDomain] = session.user.email.split("@");

  // Use domain only when email is verified on Google Workspace and non-disposable.
  const isEmailVerified =
    isGoogleSession(session) && session.user.email_verified;
  const verifiedDomain =
    isEmailVerified && !isDisposableEmailDomain(emailDomain)
      ? emailDomain
      : null;

  const workspace = await Workspace.create({
    sId: generateModelSId(),
    name: session.user.username,
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
  session: any
): Promise<WorkspaceHasDomain | null> {
  const { user } = session;

  if (!isGoogleSession(session) || !user.email_verified) {
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
