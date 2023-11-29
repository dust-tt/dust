import { Button } from "@dust-tt/sparkle";
import { UserType, WorkspaceType } from "@dust-tt/types";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator, getSession } from "@app/lib/auth";

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
  owner: WorkspaceType;
  members: UserType[];
}> = async (context) => {
  const wId = context.params?.wId;
  if (!wId || typeof wId !== "string") {
    return {
      notFound: true,
    };
  }

  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const user = auth.user();

  if (!user) {
    return {
      redirect: {
        destination: "/login",
        permanent: false,
      },
    };
  }

  if (!auth.isDustSuperUser()) {
    return {
      notFound: true,
    };
  }

  const owner = auth.workspace();

  if (!owner) {
    return {
      notFound: true,
    };
  }

  const members = await getMembers(auth);

  return {
    props: {
      user,
      owner,
      members,
    },
  };
};

const MembershipsPage = ({
  owner,
  members,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  const onRevoke = async (m: UserType) => {
    console.log(m);
    if (!window.confirm(`Are you sure you want to revoke ${m.username}?`)) {
      return;
    }
    try {
      const r = await fetch(`/api/poke/workspaces/${owner.sId}/revoke`, {
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
        <h1 className="mb-8 text-2xl font-bold">{owner.name}</h1>
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
                    {m.username} ({m.fullName})
                  </h3>
                </div>
                <p>
                  {m.email} ({m.provider})
                </p>
                <div className="flex items-center justify-between">
                  <div>role: {m.workspaces[0].role}</div>
                  <Button
                    label="Revoke"
                    variant="secondaryWarning"
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
