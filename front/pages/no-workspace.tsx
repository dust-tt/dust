import { BarHeader, DustLogoSquare, Icon, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";

import { UserMenu } from "@app/components/UserMenu";
import WorkspacePicker from "@app/components/WorkspacePicker";
import { fetchRevokedWorkspace } from "@app/lib/api/user";
import {
  getUserFromSession,
  withDefaultUserAuthPaywallWhitelisted,
} from "@app/lib/iam/session";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { WorkspaceHasDomainModel } from "@app/lib/resources/storage/models/workspace_has_domain";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { useUser } from "@app/lib/swr/user";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types";

// Fetch workspace details for scenarios where auto-join is disabled.
async function fetchWorkspaceDetails(
  user: UserTypeWithWorkspaces
): Promise<WorkspaceHasDomainModel | null> {
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

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  workspace: WorkspaceType;
  status: "auto-join-disabled" | "revoked";
  userFirstName: string;
  workspaceVerifiedDomain: string | null;
}>(async (context, auth, session) => {
  const user = await getUserFromSession(session);
  if (!user) {
    return {
      notFound: true,
    };
  }

  const flow =
    context.query.flow && typeof context.query.flow === "string"
      ? context.query.flow
      : null;

  let workspace: WorkspaceResource | null = null;
  let workspaceVerifiedDomain: string | null = null;
  let status: "auto-join-disabled" | "revoked";
  if (flow === "no-auto-join") {
    status = "auto-join-disabled";
    const workspaceHasDomain = await fetchWorkspaceDetails(user);
    workspace = workspaceHasDomain?.workspace
      ? new WorkspaceResource(
          WorkspaceResource.model,
          workspaceHasDomain.workspace.get()
        )
      : null;
    workspaceVerifiedDomain = workspaceHasDomain?.domain ?? null;

    if (!workspace || !workspaceVerifiedDomain) {
      logger.error(
        {
          flow,
          userId: user.id,
          panic: true,
        },
        "Unreachable: workspace not found."
      );
      throw new Error("Workspace not found.");
    }
  } else if (flow === "revoked") {
    status = "revoked";
    const res = await fetchRevokedWorkspace(user);

    if (res.isErr()) {
      logger.error(
        { flow, userId: user.id, panic: true, error: res.error },
        "Unreachable: workspace not found."
      );
      throw new Error("Workspace not found.");
    }
    workspace = res.value;
  } else {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      workspace: renderLightWorkspaceType({ workspace }),
      status,
      userFirstName: user.firstName,
      workspaceVerifiedDomain,
    },
  };
});

export default function NoWorkspace({
  workspace,
  status,
  userFirstName,
  workspaceVerifiedDomain,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { user } = useUser();

  return (
    <Page variant="normal">
      <BarHeader
        title="Joining Dust"
        className="ml-10 lg:ml-0"
        rightActions={
          <div className="flex flex-row items-center">
            {user?.organizations && user.organizations.length > 1 && (
              <WorkspacePicker user={user} workspace={workspace} />
            )}
            <div>
              {user && (
                <UserMenu user={user} owner={workspace} subscription={null} />
              )}
            </div>
          </div>
        }
      />
      <div className="mx-auto mt-40 flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <div className="items-left justify-left flex flex-row">
            <Icon visual={DustLogoSquare} size="md" />
          </div>
          <span className="heading-2xl text-foreground dark:text-foreground-night">
            Hello {userFirstName}!
          </span>
        </div>
        <div>
          {status === "auto-join-disabled" && (
            <div className="flex flex-col gap-4">
              <span className="heading-lg text-muted-foreground dark:text-muted-foreground-night">
                {workspaceVerifiedDomain ?? workspace.name} already has a Dust
                workspace.
              </span>
              <span className="copy-md text-muted-foreground dark:text-muted-foreground-night">
                To join the existing workspace of your company,
                <span className="font-semibold">
                  {" "}
                  please request an invitation from your <br />
                  colleagues,
                </span>{" "}
                then use the link provided in the invitation email to access the
                workspace.
              </span>
            </div>
          )}
          {status === "revoked" && (
            <div className="flex flex-col gap-4">
              <span className="heading-lg text-muted-foreground dark:text-muted-foreground-night">
                You no longer have access to {workspace.name}'s Dust workspace.
              </span>
              <span className="copy-md text-muted-foreground dark:text-muted-foreground-night">
                You may have been removed from the workspace or the workspace
                may have reached its maximum number of users.
                <br />
                Please{" "}
                <span className="font-semibold">
                  contact the administrator in {workspace.name}
                </span>{" "}
                for more informations or to add you again.
              </span>
              <span className="copy-md text-muted-foreground dark:text-muted-foreground-night">
                If you're looking to establish{" "}
                <strong>a new, separate workspace</strong> continue with the
                following step:
              </span>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
