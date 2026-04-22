import { PokeFavoritesList } from "@app/components/poke/PokeFavorites";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { useDebounce } from "@app/hooks/useDebounce";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { useRegionContext } from "@app/lib/auth/RegionContext";
import {
  isEntreprisePlanPrefix,
  isFreePlan,
  isFriendsAndFamilyPlan,
  isOldFreePlan,
  isProPlanPrefix,
} from "@app/lib/plans/plan_codes";
import { getRegionChipColor, getRegionDisplay } from "@app/lib/poke/regions";
import { usePokeRegion } from "@app/lib/swr/poke";
import { classNames } from "@app/lib/utils";
import type { PokeWorkspaceWithRegion } from "@app/poke/swr/search";
import { usePokeWorkspacesAllRegions } from "@app/poke/swr/search";
import { pluralize } from "@app/types/shared/utils/string_utils";
import { Chip, Icon, Input, LinkWrapper, Spinner } from "@dust-tt/sparkle";
import { UsersIcon } from "lucide-react";
import moment from "moment";
import type { ChangeEvent } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useCallback } from "react";

const WORKSPACE_LIMIT = 20;
const SEARCH_MIN_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 300;

interface WorkspaceListProps {
  workspaces: PokeWorkspaceWithRegion[];
  isWorkspacesLoading?: boolean;
  showRegion?: boolean;
  onWorkspaceClick?: (ws: PokeWorkspaceWithRegion) => void;
}

function WorkspaceList({
  workspaces,
  isWorkspacesLoading = false,
  showRegion = false,
  onWorkspaceClick,
}: WorkspaceListProps) {
  return isWorkspacesLoading ? (
    <div className="flex h-44 w-80 items-center justify-center">
      <Spinner size="lg" variant="color" />
    </div>
  ) : workspaces.length === 0 ? (
    <p className="text-muted-foreground dark:text-muted-foreground-night">
      No workspaces found.
    </p>
  ) : (
    <ul className="flex flex-wrap gap-4">
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
                    <PokeTableCell className="space-x-2" colSpan={3}>
                      <div className="flex items-center gap-1.5">
                        <Icon visual={UsersIcon} size="xs" />
                        <span>
                          {ws.membersCount}&nbsp; member
                          {pluralize(ws.membersCount)}
                        </span>
                      </div>
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
  );
}

/**
 * Entry point that renders the appropriate dashboard based on mode.
 */
export function DashboardPage() {
  return <DashboardPageSPA />;
}

/**
 * SPA mode: Search workspaces across all regions.
 */
function DashboardPageSPA() {
  useDocumentTitle("Poke - Home");

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

  const {
    inputValue: searchTerm,
    debouncedValue: debouncedSearchTerm,
    isDebouncing,
    setValue: setSearchTerm,
  } = useDebounce("", {
    delay: SEARCH_DEBOUNCE_MS,
    minLength: SEARCH_MIN_LENGTH,
  });
  const searchDisabled = !isDebouncing && !debouncedSearchTerm;

  const {
    workspaces: searchResults,
    isWorkspacesLoading: isSearchResultsLoading,
    isWorkspacesError: isSearchResultsError,
  } = usePokeWorkspacesAllRegions({
    search: debouncedSearchTerm,
    disabled: searchDisabled,
    limit: WORKSPACE_LIMIT,
    regionUrls,
  });

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleWorkspaceClick = useCallback(
    (ws: PokeWorkspaceWithRegion) => {
      if (ws.region && ws.region !== regionInfo.name && regionUrls) {
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
      <h1 className="mb-4 mt-8 text-2xl font-bold">Search Results</h1>
      {searchDisabled ? (
        <p className="text-muted-foreground dark:text-muted-foreground-night">
          Type at least {SEARCH_MIN_LENGTH} characters to search.
        </p>
      ) : isSearchResultsError ? (
        <p className="text-muted-foreground dark:text-muted-foreground-night">
          An error occurred while fetching search results.
        </p>
      ) : (
        <WorkspaceList
          workspaces={searchResults}
          isWorkspacesLoading={isSearchResultsLoading || isDebouncing}
          showRegion
          onWorkspaceClick={handleWorkspaceClick}
        />
      )}
      <h1 className="mb-4 mt-8 text-2xl font-bold">
        Last {WORKSPACE_LIMIT} Upgraded Workspaces
      </h1>
      {isUpgradedWorkspacesError ? (
        <p className="text-muted-foreground dark:text-muted-foreground-night">
          An error occurred while fetching upgraded workspaces.
        </p>
      ) : (
        <WorkspaceList
          workspaces={upgradedWorkspaces}
          isWorkspacesLoading={isUpgradedWorkspacesLoading}
          showRegion
          onWorkspaceClick={handleWorkspaceClick}
        />
      )}
    </>
  );
}
