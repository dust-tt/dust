import { PokeFavoritesList } from "@app/components/poke/PokeFavorites";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { useDebounce } from "@app/hooks/useDebounce";
import { useRegionContext } from "@app/lib/auth/RegionContext";
import type { PokePlanTypeFilter } from "@app/lib/plans/plan_codes";
import {
  isEnterprisePlanPrefix,
  isFreePlan,
  isFriendsAndFamilyPlan,
  isOldFreePlan,
  isProPlanPrefix,
  POKE_PLAN_TYPE_FILTERS,
} from "@app/lib/plans/plan_codes";
import { getRegionChipColor, getRegionDisplay } from "@app/lib/poke/regions";
import { usePokeRegion } from "@app/lib/swr/poke";
import { classNames } from "@app/lib/utils";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
import type { PokeWorkspaceWithPlacement } from "@app/poke/swr/search";
import { usePokeWorkspacesAllRegions } from "@app/poke/swr/search";
import type { RegionType } from "@app/types/region";
import { SUPPORTED_REGIONS } from "@app/types/region";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  Button,
  Chip,
  Icon,
  Input,
  LinkWrapper,
  Spinner,
} from "@dust-tt/sparkle";
import { ChevronLeft, ChevronRight, UsersIcon } from "lucide-react";
import moment from "moment";
import type { ChangeEvent } from "react";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useCallback, useState } from "react";

const WORKSPACE_LIMIT = 20;
const SEARCH_MIN_LENGTH = 3;
const SEARCH_DEBOUNCE_MS = 300;

const PLAN_TYPE_FILTER_LABELS: Record<PokePlanTypeFilter, string> = {
  enterprise: "Enterprise",
  legacy_enterprise: "Legacy Enterprise",
  legacy_pro: "Legacy Pro",
  business: "Business",
  free: "Free",
  friends_and_family: "Friends & Family",
  dust: "Dust",
};

interface WorkspaceListProps {
  workspaces: PokeWorkspaceWithPlacement[];
  isWorkspacesLoading?: boolean;
  showCell?: boolean;
  onWorkspaceClick?: (ws: PokeWorkspaceWithPlacement) => void;
}

function WorkspaceList({
  workspaces,
  isWorkspacesLoading = false,
  showCell = false,
  onWorkspaceClick,
}: WorkspaceListProps) {
  return isWorkspacesLoading ? (
    <div className="flex h-44 w-80 items-center justify-center">
      <Spinner size="lg" />
    </div>
  ) : workspaces.length === 0 ? (
    <p className="text-muted-foreground">No workspaces found.</p>
  ) : (
    <ul className="flex flex-wrap gap-4">
      {workspaces.map((ws) => (
        <div key={`${ws.cell}-${ws.id}`} onClick={() => onWorkspaceClick?.(ws)}>
          <LinkWrapper href={`/poke/${ws.sId}`}>
            <li className="border-material-100 w-80 rounded-lg border p-4 transition-colors duration-200 hover:bg-primary-100">
              <div className="flex items-center justify-between pb-2">
                <h2 className="text-md flex-grow font-bold">{ws.name}</h2>
                {showCell && (
                  <Chip size="xs" color={getRegionChipColor(ws.region)}>
                    {ws.cell} · {getRegionDisplay(ws.region)}
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
                            isEnterprisePlanPrefix(ws.subscription.plan.code) &&
                              "bg-red-500",
                            isFriendsAndFamilyPlan(ws.subscription.plan.code) &&
                              "bg-pink-500",
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
 * SPA mode: Search workspaces across all cells.
 */
function DashboardPageSPA() {
  usePokePageMetadata({ name: "Home" });

  const { regionInfo, setRegionInfo } = useRegionContext();
  const { regionData } = usePokeRegion();
  const regionUrls = regionData?.regionUrls ?? null;
  const cells = regionData?.cells ?? null;

  const [planTypeFilter, setPlanTypeFilter] = useState<
    PokePlanTypeFilter | undefined
  >(undefined);
  const [upgradedRegionFilter, setUpgradedRegionFilter] = useState<RegionType>(
    regionInfo.name
  );
  const [upgradedPage, setUpgradedPage] = useState(0);

  const handlePlanTypeFilterChange = useCallback(
    (filter: PokePlanTypeFilter | undefined) => {
      setPlanTypeFilter(filter);
      setUpgradedPage(0);
    },
    []
  );

  const handleUpgradedRegionFilterChange = useCallback((region: RegionType) => {
    setUpgradedRegionFilter(region);
    setUpgradedPage(0);
  }, []);

  const {
    workspaces: upgradedWorkspaces,
    isWorkspacesLoading: isUpgradedWorkspacesLoading,
    isWorkspacesError: isUpgradedWorkspacesError,
    hasMoreWorkspaces: hasMoreUpgradedWorkspaces,
  } = usePokeWorkspacesAllRegions({
    upgraded: true,
    planType: planTypeFilter,
    region: upgradedRegionFilter,
    limit: WORKSPACE_LIMIT,
    offset: upgradedPage * WORKSPACE_LIMIT,
    cells,
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

  const searchQuery = debouncedSearchTerm.trim();
  const isSearchInputTooShort = searchTerm.trim().length < SEARCH_MIN_LENGTH;

  const {
    workspaces: searchResults,
    isWorkspacesLoading: isSearchResultsLoading,
    isWorkspacesError: isSearchResultsError,
  } = usePokeWorkspacesAllRegions({
    search: searchQuery,
    disabled: !searchQuery,
    planType: planTypeFilter,
    limit: WORKSPACE_LIMIT,
    cells,
  });

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleWorkspaceClick = useCallback(
    (ws: PokeWorkspaceWithPlacement) => {
      if (ws.region !== regionInfo.name && regionUrls) {
        setRegionInfo({ name: ws.region, url: regionUrls[ws.region] });
      }
    },
    [regionInfo, setRegionInfo, regionUrls]
  );

  return (
    <>
      <PokeFavoritesList />
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip
          size="xs"
          label="All"
          color={planTypeFilter === undefined ? "highlight" : "primary"}
          onClick={() => handlePlanTypeFilterChange(undefined)}
        />
        {POKE_PLAN_TYPE_FILTERS.map((filter) => (
          <Chip
            key={filter}
            size="xs"
            label={PLAN_TYPE_FILTER_LABELS[filter]}
            color={planTypeFilter === filter ? "highlight" : "primary"}
            onClick={() =>
              handlePlanTypeFilterChange(
                planTypeFilter === filter ? undefined : filter
              )
            }
          />
        ))}
      </div>
      <h1 className="mb-4 text-2xl font-bold">Search in Workspaces</h1>
      <Input
        type="text"
        placeholder="Search"
        value={searchTerm}
        onChange={handleSearchChange}
      />
      <h1 className="mb-4 mt-8 text-2xl font-bold">Search Results</h1>
      {isSearchInputTooShort ? (
        <p className="text-muted-foreground">
          Type at least {SEARCH_MIN_LENGTH} characters to search.
        </p>
      ) : isSearchResultsError ? (
        <p className="text-muted-foreground">
          An error occurred while fetching search results.
        </p>
      ) : (
        <WorkspaceList
          workspaces={searchResults}
          isWorkspacesLoading={isSearchResultsLoading || isDebouncing}
          showCell
          onWorkspaceClick={handleWorkspaceClick}
        />
      )}
      <div className="mb-4 mt-8 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">
          Upgraded Workspaces
          {upgradedWorkspaces.length > 0 &&
            ` (${upgradedPage * WORKSPACE_LIMIT + 1}–${
              upgradedPage * WORKSPACE_LIMIT + upgradedWorkspaces.length
            })`}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {SUPPORTED_REGIONS.map((region) => (
            <Chip
              key={region}
              size="xs"
              label={getRegionDisplay(region)}
              color={
                upgradedRegionFilter === region
                  ? getRegionChipColor(region)
                  : "primary"
              }
              onClick={() => handleUpgradedRegionFilterChange(region)}
            />
          ))}
          <Button
            variant="outline"
            size="xs"
            icon={ChevronLeft}
            label="Previous"
            disabled={upgradedPage === 0 || isUpgradedWorkspacesLoading}
            onClick={() => setUpgradedPage((page) => Math.max(0, page - 1))}
          />
          <Button
            variant="outline"
            size="xs"
            icon={ChevronRight}
            label="Next"
            disabled={!hasMoreUpgradedWorkspaces || isUpgradedWorkspacesLoading}
            onClick={() => setUpgradedPage((page) => page + 1)}
          />
        </div>
      </div>
      {isUpgradedWorkspacesError ? (
        <p className="text-muted-foreground">
          An error occurred while fetching upgraded workspaces.
        </p>
      ) : (
        <WorkspaceList
          workspaces={upgradedWorkspaces}
          isWorkspacesLoading={isUpgradedWorkspacesLoading}
          showCell
          onWorkspaceClick={handleWorkspaceClick}
        />
      )}
    </>
  );
}
