import { GetServerSideProps, InferGetServerSidePropsType } from "next";
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
  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="flex-grow p-6">
        <>
          <h1 className="mb-4 text-2xl font-bold">{workspace.name}</h1>
        </>
      </div>
    </div>
  );
};

export default WorkspacePage;
