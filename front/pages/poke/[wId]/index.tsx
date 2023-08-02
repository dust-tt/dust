import { Button } from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { UserType, WorkspaceType } from "@app/types/user";

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  workspace: WorkspaceType;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);
  const wId = context.params?.wId;

  if (!user) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  if (!user.isDustSuperUser) {
    return {
      notFound: true,
    };
  }

  if (!wId || typeof wId !== "string") {
    return {
      notFound: true,
    };
  }

  const auth = await Authenticator.fromSession(session, wId);
  const workspace = auth.workspace();

  if (!workspace) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      workspace,
    },
  };
};

const WorkspacePage = ({
  workspace,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  const onUpgrade = async () => {
    try {
      const r = await fetch(`/api/poke/workspaces/${workspace.sId}/upgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!r.ok) {
        throw new Error("Failed to upgrade workspace.");
      }
      await router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while upgrading the workspace.");
    }
  };

  const onDowngrade = async () => {
    try {
      const r = await fetch(`/api/poke/workspaces/${workspace.sId}/downgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!r.ok) {
        throw new Error("Failed to downgrade workspace.");
      }
      await router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while downgrading the workspace.");
    }
  };

  const looksFullyUpgraded =
    workspace.plan?.limits.dataSources.count === -1 &&
    workspace.plan?.limits.dataSources.documents.count === -1 &&
    workspace.plan?.limits.dataSources.documents.sizeMb === -1 &&
    workspace.plan?.limits.dataSources.managed === true;

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="flex-grow p-6">
        <>
          <h1 className="mb-4 text-2xl font-bold">{workspace.name}</h1>
          <h2 className="text-md mb-4 font-bold">Plan:</h2>
          {looksFullyUpgraded ? (
            <p className="mb-4 text-green-600">
              This workspace looks fully upgraded.
            </p>
          ) : (
            <p className="mb-4 text-red-600">
              This workspace does not look fully upgraded.
            </p>
          )}
          <JsonViewer value={workspace.plan} rootName={false} />
          <div className="mt-4 flex-row">
            <Button
              label="Downgrade"
              type="secondaryWarning"
              onClick={onDowngrade}
            />
            <Button label="Upgrade" type="secondary" onClick={onUpgrade} />
          </div>
        </>
      </div>
    </div>
  );
};

export default WorkspacePage;
