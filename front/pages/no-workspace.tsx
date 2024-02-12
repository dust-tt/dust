import {
  BarHeader,
  Button,
  Icon,
  LogoSquareColorLogo,
  Page,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import { getSession, getUserFromSession } from "@app/lib/auth";
import { Membership, Workspace } from "@app/lib/models";
import logger from "@app/logger/logger";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";

export const getServerSideProps = withGetServerSidePropsLogging<{
  revokedWorkspaceName?: string;
  userFirstName: string;
}>(async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

  if (!user) {
    return {
      notFound: true,
    };
  }

  const memberships = await Membership.findAll({
    where: { userId: user.id },
  });

  if (!memberships.length) {
    const message = "Unreachable: user has no memberships";
    logger.error({ userId: user.id, panic: true }, message);
    throw new Error(message);
  }

  if (user.workspaces.length) {
    const message = "Unreachable: user already has a workspace";
    logger.error({ userId: user.id, panic: true }, message);
    return {
      notFound: true,
    };
  }

  const revokedWorkspaceId = memberships[0].workspaceId;

  const workspace = await Workspace.findByPk(revokedWorkspaceId);

  if (!workspace) {
    const message = "Unreachable: workspace not found";
    logger.error(
      { userId: user.id, workspaceId: revokedWorkspaceId, panic: true },
      message
    );
    throw new Error(message);
  }

  return {
    props: {
      revokedWorkspaceName: workspace.name,
      userFirstName: user.firstName,
    },
  };
});

export default function NoWorkspace({
  revokedWorkspaceName,
  userFirstName,
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
          <div className="flex flex-col gap-4">
            <span className="text-lg font-semibold text-element-700">
              You no longer have access to {revokedWorkspaceName}'s Dust
              workspace.
            </span>
            <span className="text-md text-element-700">
              You may have been removed from the workspace or the workspace may
              have reached its maximum number of users.
              <br />
              Please{" "}
              <span className="font-semibold">
                contact the administrator in {revokedWorkspaceName}
              </span>{" "}
              for more informations or to add you again.
            </span>
            <span className="text-md text-element-700">
              If you're looking to establish a new, separate workspace, continue
              with the following step:
            </span>
          </div>
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
