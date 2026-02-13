import { PokeFavoritesList } from "@app/components/poke/PokeFavorites";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import {
  useRegionContext,
  useRegionContextSafe,
} from "@app/lib/auth/RegionContext";
import {
  isEntreprisePlanPrefix,
  isFreePlan,
  isFriendsAndFamilyPlan,
  isOldFreePlan,
  isProPlanPrefix,
} from "@app/lib/plans/plan_codes";
import { getRegionChipColor, getRegionDisplay } from "@app/lib/poke/regions";
import { usePokeRegion, usePokeWorkspaces } from "@app/lib/swr/poke";
import { classNames } from "@app/lib/utils";
import type { PokeWorkspaceWithRegion } from "@app/poke/swr/search";
import { usePokeWorkspacesAllRegions } from "@app/poke/swr/search";
import {
  BookOpenIcon,
  Chip,
  Icon,
  Input,
  LinkWrapper,
  Spinner,
} from "@dust-tt/sparkle";
import { UsersIcon } from "lucide-react";
import moment from "moment";
import type { ChangeEvent } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useCallback, useState } from "react";

const WORKSPACE_LIMIT = 20;

interface WorkspaceListProps {
  title: string;
  workspaces: PokeWorkspaceWithRegion[];
  showRegion?: boolean;
  onWorkspaceClick?: (ws: PokeWorkspaceWithRegion) => void;
}

function WorkspaceList({
  title,
  workspaces,
  showRegion = false,
  onWorkspaceClick,
}: WorkspaceListProps) {
  return (
    <>
      <h1 className="mb-4 mt-8 text-2xl font-bold">{title}</h1>
      <ul className="flex flex-wrap gap-4">
        {workspaces.length === 0 && <p>No workspaces found.</p>}
        {workspaces.map((ws) => (
          <div
            key={`${ws.region ?? "default"}-${ws.id}`}
            onClick={() => onWorkspaceClick?.(ws)}
          >
            <LinkWrapper href={`/poke/${ws.sId}`}>
              <li className="border-material-100 w-80 rounded-lg border p-4 transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-800">
                <div className="flex items-center justify-between pb-2">
                  <h2 className="text-md flex-grow font-bold">{ws.name}</h2>
                  {showRegion && ws.region && (
                    <Chip size="xs" color={getRegionChipColor(ws.region)}>
                      {getRegionDisplay(ws.region)}
                    </Chip>
                  )}
                </div>
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
                        {ws.workspaceDomains && (
                          <label>
                            (
                            {ws.workspaceDomains
                              .map((d) => d.domain)
                              .join(", ")}
                            )
                          </label>
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
                              isEntreprisePlanPrefix(
                                ws.subscription.plan.code
                              ) && "bg-red-500",
                              isFriendsAndFamilyPlan(
                                ws.subscription.plan.code
                              ) && "bg-pink-500",
                              isProPlanPrefix(ws.subscription.plan.code) &&
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
            </LinkWrapper>
          </div>
        ))}
      </ul>
    </>
  );
}

/**
 * Entry point that renders the appropriate dashboard based on mode.
 */
export function DashboardPage() {
  const regionContext = useRegionContextSafe();

  if (regionContext) {
    return <DashboardPageSPA />;
  }

  return <DashboardPageLegacy />;
}

/**
 * SPA mode: Search workspaces across all regions.
 */
function DashboardPageSPA() {
  useSetPokePageTitle("Home");

  const { regionInfo, setRegionInfo } = useRegionContext();
  const { regionData } = usePokeRegion();
  const regionUrls = regionData?.regionUrls ?? null;

  const {
    workspaces: upgradedWorkspaces,
    isWorkspacesLoading: isUpgradedWorkspacesLoading,
    isWorkspacesError: isUpgradedWorkspacesError,
  } = usePokeWorkspacesAllRegions({
    upgraded: true,
    limit: WORKSPACE_LIMIT,
    regionUrls,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const searchDisabled = searchTerm.trim().length < 3;

  const {
    workspaces: searchResults,
    isWorkspacesLoading: isSearchResultsLoading,
    isWorkspacesError: isSearchResultsError,
  } = usePokeWorkspacesAllRegions({
    search: searchTerm,
    disabled: searchDisabled,
    limit: WORKSPACE_LIMIT,
    regionUrls,
  });

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleWorkspaceClick = useCallback(
    (ws: PokeWorkspaceWithRegion) => {
      if (ws.region && ws.region !== regionInfo?.name && regionUrls) {
        setRegionInfo({ name: ws.region, url: regionUrls[ws.region] });
      }
    },
    [regionInfo, setRegionInfo, regionUrls]
  );

  return (
    <>
      <PokeFavoritesList />
      <h1 className="mb-4 text-2xl font-bold">Search in Workspaces</h1>
      <Input
        type="text"
        placeholder="Search"
        value={searchTerm}
        onChange={handleSearchChange}
      />
      {isSearchResultsError && (
        <p>An error occurred while fetching search results.</p>
      )}
      {!isSearchResultsLoading && !isSearchResultsError && (
        <WorkspaceList
          title="Search Results"
          workspaces={searchResults}
          showRegion
          onWorkspaceClick={handleWorkspaceClick}
        />
      )}
      {isSearchResultsLoading && !searchDisabled && (
        <Spinner size="lg" variant="color" />
      )}
      {!isUpgradedWorkspacesLoading && !isUpgradedWorkspacesError && (
        <WorkspaceList
          title={`Last ${WORKSPACE_LIMIT} Upgraded Workspaces`}
          workspaces={upgradedWorkspaces}
          showRegion
          onWorkspaceClick={handleWorkspaceClick}
        />
      )}
      {isUpgradedWorkspacesLoading && <Spinner size="lg" variant="color" />}
    </>
  );
}

/**
 * NextJS mode: Single-region search (legacy).
 */
function DashboardPageLegacy() {
  useSetPokePageTitle("Home");

  const {
    workspaces: upgradedWorkspaces,
    isWorkspacesLoading: isUpgradedWorkspacesLoading,
    isWorkspacesError: isUpgradedWorkspacesError,
  } = usePokeWorkspaces({ upgraded: true, limit: WORKSPACE_LIMIT });

  const [searchTerm, setSearchTerm] = useState("");
  const searchDisabled = searchTerm.trim().length < 3;

  const {
    workspaces: searchResults,
    isWorkspacesLoading: isSearchResultsLoading,
    isWorkspacesError: isSearchResultsError,
  } = usePokeWorkspaces({
    search: searchTerm,
    disabled: searchDisabled,
    limit: WORKSPACE_LIMIT,
  });

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  return (
    <>
      <PokeFavoritesList />
      <h1 className="mb-4 text-2xl font-bold">Search in Workspaces</h1>
      <Input
        type="text"
        placeholder="Search"
        value={searchTerm}
        onChange={handleSearchChange}
      />
      {isSearchResultsError && (
        <p>An error occurred while fetching search results.</p>
      )}
      {!isSearchResultsLoading && !isSearchResultsError && (
        <WorkspaceList title="Search Results" workspaces={searchResults} />
      )}
      {isSearchResultsLoading && !searchDisabled && (
        <Spinner size="lg" variant="color" />
      )}
      {!isUpgradedWorkspacesLoading && !isUpgradedWorkspacesError && (
        <WorkspaceList
          title={`Last ${WORKSPACE_LIMIT} Upgraded Workspaces`}
          workspaces={upgradedWorkspaces}
        />
      )}
      {isUpgradedWorkspacesLoading && <Spinner size="lg" variant="color" />}
    </>
  );
}
