import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React from "react";

import SuperUserNavbar from "@app/components/super-user/SuperUserNavbar";
import { getSession, getUserFromSession } from "@app/lib/auth";
import { useSuperUserWorkspaces } from "@app/lib/swr";
import { UserType } from "@app/types/user";

export const getServerSideProps: GetServerSideProps<{
  user: UserType;
}> = async (context) => {
  const session = await getSession(context.req, context.res);
  const user = await getUserFromSession(session);

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

  return {
    props: {
      user,
    },
  };
};

const Dashboard = (
  _props: InferGetServerSidePropsType<typeof getServerSideProps>
) => {
  const { workspaces, isWorkspacesLoading, isWorkspacesError } =
    useSuperUserWorkspaces();

  return (
    <div className="min-h-screen bg-structure-50">
      <SuperUserNavbar />
      <div className="flex-grow p-6">
        <>
          <h1 className="text-2xl font-bold">Workspaces</h1>
          <table className="mt-4 min-w-full text-left text-sm font-light">
            <thead className="items-center border font-medium">
              <tr>
                <th scope="col" className="border px-4 py-4">
                  Workspace Name
                </th>
                <th scope="col" className="border px-4 py-4">
                  Workspace ID
                </th>
                <th scope="col" className="border px-4 py-4">
                  Plan
                </th>
              </tr>
            </thead>
            <tbody>
              {!isWorkspacesLoading &&
                workspaces.map((ws) => (
                  <tr key={ws.id} className="border">
                    <td className="border px-4 py-4 text-sm text-gray-500">
                      {ws.name}
                    </td>
                    <td className="border px-4 py-4 text-sm text-gray-500">
                      {ws.id}
                    </td>
                    <td className="border px-4 py-4 text-sm text-gray-500">
                      {`${JSON.stringify(ws.plan, null, 2)}`}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      </div>
    </div>
  );
};

export default Dashboard;
