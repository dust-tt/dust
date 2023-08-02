import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import React, { ChangeEvent, useState } from "react";

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
  const {
    workspaces: upgradedWorkspaces,
    isWorkspacesLoading: isUpgradedWorkspacesLoading,
    isWorkspacesError: isUpgradedWorkspacesError,
  } = useSuperUserWorkspaces({ upgraded: true });

  const [searchTerm, setSearchTerm] = useState("");

  const searchDisabled = searchTerm.trim().length < 3;

  const {
    workspaces: searchResults,
    isWorkspacesLoading: isSearchResultsLoading,
    isWorkspacesError: isSearchResultsError,
  } = useSuperUserWorkspaces({
    search: searchTerm,
    upgraded: false,
    disabled: searchDisabled,
    limit: 10,
  });

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  return (
    <div className="min-h-screen bg-structure-50">
      <SuperUserNavbar />
      <div className="flex-grow p-6">
        <>
          <h1 className="mb-4 text-2xl font-bold">Upgraded Workspaces</h1>
          <ul className="space-y-4">
            {!isUpgradedWorkspacesLoading &&
              !isUpgradedWorkspacesError &&
              upgradedWorkspaces.map((ws) => (
                <li
                  key={ws.id}
                  className="rounded-lg bg-white p-4 shadow transition-colors duration-200 hover:bg-gray-100"
                >
                  <h2 className="text-xl font-semibold">{ws.name}</h2>
                  <p className="text-sm text-gray-500">ID: {ws.id}</p>
                </li>
              ))}
          </ul>
          <h1 className="mb-4 mt-8 text-2xl font-bold">Free Workspaces</h1>
          <input
            className="w-full rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={handleSearchChange}
          />
          {isSearchResultsLoading && !searchDisabled && (
            <p>Loading search results...</p>
          )}
          {isSearchResultsError && (
            <p>An error occurred while fetching search results.</p>
          )}
          {!isSearchResultsLoading && !isSearchResultsError && (
            <ul className="mt-4 space-y-4">
              {searchResults.map((ws) => (
                <li
                  key={ws.id}
                  className="rounded-lg bg-white p-4 shadow transition-colors duration-200 hover:bg-gray-100"
                >
                  <h2 className="text-xl font-semibold">{ws.name}</h2>
                  <p className="text-sm text-gray-500">ID: {ws.id}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      </div>
    </div>
  );
};

export default Dashboard;
