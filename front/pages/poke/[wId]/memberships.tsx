import { Button } from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { UserType, WorkspaceType } from "@app/types/user";

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  workspace: WorkspaceType;
  members: UserType[];
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

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const workspace = auth.workspace();

  if (!workspace) {
    return {
      notFound: true,
    };
  }

  const members = await getMembers(auth);

  return {
    props: {
      user,
      workspace,
      members,
    },
  };
};

const MembershipsPage = ({
  workspace,
  members,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  const onRevoke = async (m: UserType) => {
    console.log(m);
    if (!window.confirm(`Are you sure you want to revoke ${m.username}?`)) {
      return;
    }
    try {
      const r = await fetch(`/api/poke/workspaces/${workspace.sId}/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: m.id,
        }),
      });
      if (!r.ok) {
        throw new Error("Failed to revoke user.");
      }
      await router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while revoking the user.");
    }
  };

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="flex-grow p-6">
        <h1 className="mb-8 text-2xl font-bold">{workspace.name}</h1>
        <div className="flex justify-center">
          <div className="mx-2 w-1/3">
            <h2 className="text-md mb-4 font-bold">Members:</h2>
            {members.map((m) => (
              <div
                key={m.id}
                className="my-4 rounded-lg border border-structure-200 p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="mb-2 text-lg font-semibold">
                    {m.username} ({m.name})
                  </h3>
                </div>
                <p>
                  {m.email} ({m.provider})
                </p>
                <div className="flex items-center justify-between">
                  <div>role: {m.workspaces[0].role}</div>
                  <Button
                    label="Revoke"
                    type="secondaryWarning"
                    disabled={m.workspaces[0].role === "none"}
                    onClick={() => onRevoke(m)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MembershipsPage;
