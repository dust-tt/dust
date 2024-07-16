import {
  BarHeader,
  Button,
  Icon,
  LogoSquareColorLogo,
  Page,
} from "@dust-tt/sparkle";
import type { UserTypeWithWorkspaces } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import { fetchRevokedWorkspace } from "@app/lib/api/user";
import {
  getUserFromSession,
  withDefaultUserAuthPaywallWhitelisted,
} from "@app/lib/iam/session";
import { Workspace, WorkspaceHasDomain } from "@app/lib/models/workspace";
import logger from "@app/logger/logger";

// Fetch workspace details for scenarios where auto-join is disabled.
async function fetchWorkspaceDetails(
  user: UserTypeWithWorkspaces
): Promise<WorkspaceHasDomain | null> {
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

export const getServerSideProps = withDefaultUserAuthPaywallWhitelisted<{
  status: "auto-join-disabled" | "revoked";
  userFirstName: string;
  workspaceName: string;
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

  let workspace: Workspace | null = null;
  let workspaceVerifiedDomain: string | null = null;
  let status: "auto-join-disabled" | "revoked";

  if (flow === "no-auto-join") {
    status = "auto-join-disabled";
    const workspaceHasDomain = await fetchWorkspaceDetails(user);
    workspace = workspaceHasDomain?.workspace ?? null;
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
    workspace = await fetchRevokedWorkspace(user);

    if (!workspace) {
      logger.error(
        { flow, userId: user.id, panic: true },
        "Unreachable: workspace not found."
      );
      throw new Error("Workspace not found.");
    }
  } else {
    throw new Error("No workspace found.");
  }

  return {
    props: {
      status,
      userFirstName: user.firstName,
      workspaceName: workspace.name,
      workspaceVerifiedDomain,
    },
  };
});

export default function NoWorkspace({
  status,
  userFirstName,
  workspaceName,
  workspaceVerifiedDomain,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  const onCreateWorkspace = async () => {
    const res = await fetch("/api/create-new-workspace", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      console.error("Failed to create new workspace");
      return;
    }
    const { sId } = await res.json();
    await router.push(`/w/${sId}/welcome`);
  };

  return (
    <Page variant="normal">
      <BarHeader
        title="Joining Dust"
        rightActions={
          <Button
            size="sm"
            label="Create a new workspace"
            variant="primaryWarning"
            onClick={onCreateWorkspace}
          />
        }
      />
      <div className="mx-auto mt-40 flex max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <div className="items-left justify-left flex flex-row">
            <Icon visual={LogoSquareColorLogo} size="md" />
          </div>
          <span className="text-2xl font-bold text-element-900">
            Hello {userFirstName}!
          </span>
        </div>
        <div>
          {status === "auto-join-disabled" && (
            <div className="flex flex-col gap-4">
              <span className="text-lg font-bold text-element-700">
                {workspaceVerifiedDomain ?? workspaceName} already has a Dust
                workspace.
              </span>
              <span className="text-md text-element-700">
                To join the existing workspace of your company,
                <span className="font-semibold">
                  {" "}
                  please request an invitation from your <br />
                  colleagues,
                </span>{" "}
                then use the link provided in the invitation email to access the
                workspace.
              </span>
              <span className="text-md text-element-700">
                If you're looking to establish{" "}
                <span className="font-semibold">
                  {" "}
                  a new, separate workspace
                </span>{" "}
                continue with the following step:
              </span>
            </div>
          )}
          {status === "revoked" && (
            <div className="flex flex-col gap-4">
              <span className="text-lg font-semibold text-element-700">
                You no longer have access to {workspaceName}'s Dust workspace.
              </span>
              <span className="text-md text-element-700">
                You may have been removed from the workspace or the workspace
                may have reached its maximum number of users.
                <br />
                Please{" "}
                <span className="font-semibold">
                  contact the administrator in {workspaceName}
                </span>{" "}
                for more informations or to add you again.
              </span>
              <span className="text-md text-element-700">
                If you're looking to establish{" "}
                <span className="font-semibold">
                  {" "}
                  a new, separate workspace
                </span>{" "}
                continue with the following step:
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-row justify-end">
          <Button
            size="sm"
            label="Create a new workspace"
            variant="primaryWarning"
            onClick={onCreateWorkspace}
          />
        </div>
      </div>
    </Page>
  );
}
