import { BookOpenIcon, Icon, Spinner } from "@dust-tt/sparkle";
import { UsersIcon } from "lucide-react";
import moment from "moment";
import Link from "next/link";
import type { ChangeEvent } from "react";
import React, { useState } from "react";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import {
  isEntreprisePlan,
  isFreePlan,
  isFriendsAndFamilyPlan,
  isOldFreePlan,
  isProPlan,
} from "@app/lib/plans/plan_codes";
import { usePokeWorkspaces } from "@app/lib/swr/poke";
import { classNames } from "@app/lib/utils";
import type { PokeWorkspaceType } from "@app/pages/api/poke/workspaces";

const limit: number = 20;

export const getServerSideProps = withSuperUserAuthRequirements<object>(
  async () => {
    return {
      props: {},
    };
  }
);

const renderWorkspaces = (title: string, workspaces: PokeWorkspaceType[]) => (
  <>
    <h1 className="mb-4 mt-8 text-2xl font-bold">{title}</h1>
    <ul className="flex flex-wrap gap-4">
      {workspaces.length === 0 && <p>No workspaces found.</p>}
      {workspaces.map((ws) => (
        <Link href={`/poke/${ws.sId}`} key={ws.id}>
          <li className="border-material-100 w-80 rounded-lg border bg-white p-4 transition-colors duration-200 hover:bg-gray-100">
            <h2 className="text-md flex-grow pb-2 font-bold">{ws.name}</h2>
            <PokeTable>
              <PokeTableBody>
                <PokeTableRow>
                  <PokeTableCell className="space-x-2" colSpan={3}>
                    <label>
                      Created: {moment(ws.createdAt).format("DD-MM-YYYY")}
                    </label>
                  </PokeTableCell>
                </PokeTableRow>
                <PokeTableRow>
                  <PokeTableCell className="max-w-[200px] overflow-hidden text-ellipsis">
                    {ws.adminEmail}{" "}
                    {ws.workspaceDomain && (
                      <label>({ws.workspaceDomain.domain})</label>
                    )}
                  </PokeTableCell>
                  <PokeTableCell align="center">
                    <label>
                      <Icon visual={UsersIcon} /> {ws.membersCount}
                    </label>
                  </PokeTableCell>
                  <PokeTableCell align="center">
                    <label>
                      <Icon visual={BookOpenIcon} /> {ws.dataSourcesCount}
                    </label>
                  </PokeTableCell>
                </PokeTableRow>
                <PokeTableRow>
                  <PokeTableCell className="space-x-2" colSpan={3}>
                    <label className="rounded bg-green-500 px-1 text-sm text-white">
                      {ws.sId}
                    </label>
                    {ws.subscription && (
                      <label
                        className={classNames(
                          "rounded px-1 text-sm text-gray-500 text-white",
                          isEntreprisePlan(ws.subscription.plan.code) &&
                            "bg-red-500",
                          isFriendsAndFamilyPlan(ws.subscription.plan.code) &&
                            "bg-pink-500",
                          isProPlan(ws.subscription.plan.code) &&
                            "bg-orange-500",
                          isFreePlan(ws.subscription.plan.code) &&
                            "bg-blue-500",
                          isOldFreePlan(ws.subscription.plan.code) &&
                            "bg-gray-300"
                        )}
                      >
                        {ws.subscription.plan.name}
                      </label>
                    )}
                  </PokeTableCell>
                </PokeTableRow>
              </PokeTableBody>
            </PokeTable>
          </li>
        </Link>
      ))}
    </ul>
  </>
);

const Dashboard = () => {
  const {
    workspaces: upgradedWorkspaces,
    isWorkspacesLoading: isUpgradedWorkspacesLoading,
    isWorkspacesError: isUpgradedWorkspacesError,
  } = usePokeWorkspaces({ upgraded: true, limit });

  const [searchTerm, setSearchTerm] = useState("");

  const searchDisabled = searchTerm.trim().length < 3;

  const {
    workspaces: searchResults,
    isWorkspacesLoading: isSearchResultsLoading,
    isWorkspacesError: isSearchResultsError,
  } = usePokeWorkspaces({
    search: searchTerm,
    disabled: searchDisabled,
    limit,
  });

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="flex-grow p-6">
        <>
          <h1 className="mb-4 text-2xl font-bold">Search in Workspaces</h1>
          <input
            className="w-full rounded-lg border border-gray-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-600"
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={handleSearchChange}
          />
          {isSearchResultsError && (
            <p>An error occurred while fetching search results.</p>
          )}
          {!isSearchResultsLoading &&
            !isSearchResultsError &&
            renderWorkspaces("Search Results", searchResults)}
          {isSearchResultsLoading && !searchDisabled && (
            <Spinner size="lg" variant="color" />
          )}
          {!isUpgradedWorkspacesLoading &&
            !isUpgradedWorkspacesError &&
            renderWorkspaces(
              `Last ${limit} Upgraded Workspaces`,
              upgradedWorkspaces
            )}
          {isUpgradedWorkspacesLoading && <Spinner size="lg" variant="color" />}
        </>
      </div>
    </div>
  );
};

export default Dashboard;
