import { FilterSummaryChips } from "@app/components/shared/filter_panel/FilterSummaryChips";
import {
  clearFilterCategory,
  getFilterSummaries,
} from "@app/components/shared/filter_panel/filterState";
import { SEARCH_FILTER_CATEGORY_SINGULAR_LABEL } from "@app/components/shared/filter_panel/searchFilter";
import { CreateSkillButton } from "@app/components/skills/CreateSkillButton";
import { ImportSkillsDialog } from "@app/components/skills/import/ImportSkillsDialog";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { SkillFilterPanel } from "@app/components/skills/SkillFilterPanel";
import { SkillSearchTable } from "@app/components/skills/SkillSearchTable";
import type { BatchAvailabilityAction } from "@app/components/skills/SkillsBatchEdit";
import {
  BatchAvailabilityDialog,
  SkillsBatchEditBar,
} from "@app/components/skills/SkillsBatchEdit";
import type { SkillFilter } from "@app/components/skills/skillFilter";
import {
  SKILL_FILTER_CATEGORIES,
  toSkillSearchFilters,
} from "@app/components/skills/skillFilter";
import {
  useSetContentWidth,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import {
  useSearchSkills,
  useUpdateSkillsAvailability,
} from "@app/lib/swr/skill_configurations";
import type {
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
  SkillSearchSort,
  SkillSearchSortOrder,
} from "@app/types/api/skills";
import type {
  SkillAvailability,
  SkillListItemType,
} from "@app/types/assistant/skill_configuration";
import {
  Button,
  EmptyCTA,
  Page,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import { useState } from "react";

const SKILL_SEARCH_PAGE_SIZE = 50;

const SEARCH_TABS = [
  { id: "all", label: "All", filters: { status: ["active"] } },
  {
    id: "default",
    label: "Default",
    filters: { status: ["active"], codeDefinedOnly: true },
  },
  { id: "archived", label: "Archived", filters: { status: ["archived"] } },
] satisfies { id: string; label: string; filters: SkillSearchFilters }[];

type SearchTabId = (typeof SEARCH_TABS)[number]["id"];

// Batch edits are reserved to the skill's editors and to workspace admins, as for agents;
// Dust-provided skills are never administrable.
function canBatchEditSkill(skill: SkillListItemType) {
  return skill.canAdministrate && skill.status !== "archived";
}

interface SkillsListProps {
  searchTerm: string;
  filters: SkillSearchFilters;
  permissionFiltering?: SkillSearchPermissionFiltering;
  onSelect: (skillId: string) => void;
}

function SkillsList({
  searchTerm,
  filters,
  permissionFiltering,
  onSelect,
}: SkillsListProps) {
  const owner = useWorkspace();
  const { hasPermission } = useWorkspacePermissions();
  const canSetAvailability = hasPermission("publish", "skill");
  const canMakeSkillAutoDiscoverable = hasPermission(
    "make_discoverable",
    "skill"
  );
  // Selected rows are kept by id across pages, with the item needed by batch actions.
  const [selectedSkills, setSelectedSkills] = useState<SkillListItemType[]>([]);
  const [pendingBatchAction, setPendingBatchAction] =
    useState<BatchAvailabilityAction | null>(null);
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const doUpdateAvailability = useUpdateSkillsAvailability({ owner });
  const [tablePagination, setTablePagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: SKILL_SEARCH_PAGE_SIZE,
  });
  const [selectedSort, setSelectedSort] = useState<{
    sortBy: Exclude<SkillSearchSort, "relevance">;
    sortOrder: SkillSearchSortOrder;
  } | null>(null);
  const sortBy =
    selectedSort?.sortBy ?? (searchTerm.trim() ? "relevance" : "usage");
  const sortOrder = selectedSort?.sortOrder;
  const queryKey = JSON.stringify({
    searchTerm,
    filters,
    permissionFiltering,
    sortBy,
    sortOrder,
  });
  const [previousQueryKey, setPreviousQueryKey] = useState(queryKey);

  if (queryKey !== previousQueryKey) {
    setPreviousQueryKey(queryKey);
    setTablePagination({ pageIndex: 0, pageSize: SKILL_SEARCH_PAGE_SIZE });
    setSelectedSkills([]);
  }

  const { skills, total, isSkillsLoading, isSkillsError, mutate } =
    useSearchSkills({
      owner,
      searchTerm,
      filters,
      permissionFiltering,
      offset: tablePagination.pageIndex * SKILL_SEARCH_PAGE_SIZE,
      limit: SKILL_SEARCH_PAGE_SIZE,
      sortBy,
      sortOrder,
    });

  // Prefer the freshly loaded row so batch actions see the skill's current state.
  const pageSkillsById = new Map(skills.map((skill) => [skill.sId, skill]));
  const currentSelectedSkills = selectedSkills.map(
    (selected) => pageSkillsById.get(selected.sId) ?? selected
  );

  const setSelectedSkillIds = (skillIds: string[]) => {
    const knownSkills = new Map(
      [...currentSelectedSkills, ...skills].map((skill) => [skill.sId, skill])
    );
    setSelectedSkills(
      skillIds.flatMap((skillId) => knownSkills.get(skillId) ?? [])
    );
  };

  const clearSelectionAndRefresh = () => {
    setSelectedSkills([]);
    void mutate();
  };

  const handleBatchAvailability = async (availability: SkillAvailability) => {
    if (currentSelectedSkills.length === 0 || isBatchUpdating) {
      return;
    }
    setIsBatchUpdating(true);
    try {
      const success = await doUpdateAvailability(
        currentSelectedSkills.map((skill) => skill.sId),
        availability
      );
      if (success) {
        clearSelectionAndRefresh();
      }
    } finally {
      setIsBatchUpdating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {pendingBatchAction && (
        <BatchAvailabilityDialog
          action={pendingBatchAction}
          selectedCount={currentSelectedSkills.length}
          isUpdating={isBatchUpdating}
          onConfirm={async () => {
            await handleBatchAvailability(pendingBatchAction.availability);
            setPendingBatchAction(null);
          }}
          onCancel={() => setPendingBatchAction(null)}
        />
      )}
      {isSkillsError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 py-4"
        >
          <span>Could not load skills. Please try again.</span>
          <Button
            label="Retry"
            variant="outline"
            onClick={() => void mutate()}
          />
        </div>
      )}
      {!isSkillsError &&
      (isSkillsLoading ||
        skills.length > 0 ||
        tablePagination.pageIndex > 0) ? (
        <SkillSearchTable
          owner={owner}
          skills={skills}
          onSelect={onSelect}
          onRefresh={mutate}
          pagination={tablePagination}
          setPagination={(next) => {
            if (
              next.pageIndex !== tablePagination.pageIndex ||
              next.pageSize !== tablePagination.pageSize
            ) {
              setTablePagination(next);
            }
          }}
          total={total}
          sorting={
            sortBy === "relevance"
              ? []
              : [{ id: sortBy, desc: sortOrder !== "asc" }]
          }
          setSorting={([sort]) => {
            switch (sort?.id) {
              case "name":
              case "usage":
              case "updatedAt":
                setSelectedSort({
                  sortBy: sort.id,
                  sortOrder: sort.desc ? "desc" : "asc",
                });
                break;
              default:
                setSelectedSort(null);
            }
          }}
          isLoading={isSkillsLoading}
          selectedSkillIds={selectedSkills.map((skill) => skill.sId)}
          setSelectedSkillIds={setSelectedSkillIds}
          canSelect={canBatchEditSkill}
        />
      ) : !isSkillsError ? (
        <EmptyCTA
          message={
            searchTerm.trim()
              ? "No skills match your search."
              : "No skills to show."
          }
          action={null}
        />
      ) : null}
      <SkillsBatchEditBar
        selectedSkills={currentSelectedSkills}
        // Search results carry no selectable total, so selection is extended one page at a time.
        totalCount={currentSelectedSkills.length}
        isUpdating={isBatchUpdating}
        canSetAvailability={canSetAvailability}
        canMakeSkillAutoDiscoverable={canMakeSkillAutoDiscoverable}
        owner={owner}
        onClear={clearSelectionAndRefresh}
        onSelectAll={() => undefined}
        onSelectAction={setPendingBatchAction}
      />
    </div>
  );
}

export function SearchSkillsPage() {
  const owner = useWorkspace();
  const { user, isAdmin } = useAuth();
  const { hasPermission } = useWorkspacePermissions();
  const [skillId, setSkillId] = useHashParam("skillId");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState<SearchTabId>("all");
  const [showHiddenSkills, setShowHiddenSkills] = useState(false);
  const [filter, setFilter] = useState<SkillFilter>({});
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const searchFilters = toSkillSearchFilters(filter);
  const activeTab =
    SEARCH_TABS.find((tab) => tab.id === selectedTab) ?? SEARCH_TABS[0];
  const permissionFiltering =
    isAdmin && showHiddenSkills ? "redact_unreadable" : undefined;
  useSetContentWidth("wide");
  useSetPageTitle("Dust - Manage Skills");

  return (
    <>
      <div className="flex w-full flex-col gap-6 pb-4">
        <Page.Header
          title={
            <div className="flex w-full flex-wrap items-center justify-between gap-4">
              <Page.H>Manage Skills</Page.H>
              {hasPermission("create", "skill") && (
                <CreateSkillButton
                  owner={owner}
                  onImport={() => setIsImportDialogOpen(true)}
                />
              )}
            </div>
          }
          description="Reusable packages of instructions and tools that agents can share."
          noTopPadding
        />
        <div className="w-full md:w-1/2">
          <label htmlFor="skill-search" className="sr-only">
            Search skills
          </label>
          <SearchInput
            id="skill-search"
            name="skill-search"
            placeholder="Search skills by name"
            value={searchTerm}
            onChange={setSearchTerm}
            className="w-full"
          />
        </div>
        <Tabs
          value={selectedTab}
          onValueChange={(value) => {
            const tab = SEARCH_TABS.find(({ id }) => id === value);
            if (tab) {
              setSelectedTab(tab.id);
            }
          }}
        >
          <div className="flex flex-col gap-2">
            <TabsList>
              {SEARCH_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} label={tab.label} />
              ))}
              <div className="grow" />
              <div className="flex items-center">
                <SkillFilterPanel
                  owner={owner}
                  searchTerm={searchTerm}
                  tabFilters={activeTab.filters}
                  permissionFiltering={permissionFiltering}
                  filter={filter}
                  onFilterChange={setFilter}
                  hiddenSkills={
                    isAdmin
                      ? {
                          isShown: showHiddenSkills,
                          onChange: setShowHiddenSkills,
                        }
                      : undefined
                  }
                />
              </div>
            </TabsList>
            <FilterSummaryChips
              summaries={getFilterSummaries(
                filter,
                SKILL_FILTER_CATEGORIES,
                SEARCH_FILTER_CATEGORY_SINGULAR_LABEL
              )}
              onClearCategory={(category) =>
                setFilter(clearFilterCategory(filter, category))
              }
              extraChips={
                isAdmin && showHiddenSkills
                  ? [
                      {
                        key: "hidden-skills",
                        label: (
                          <span className="min-w-0 truncate text-xs font-bold">
                            Hidden skills
                          </span>
                        ),
                        onRemove: () => setShowHiddenSkills(false),
                      },
                    ]
                  : []
              }
              onClearAll={() => {
                setFilter({});
                setShowHiddenSkills(false);
              }}
            />
            {SEARCH_TABS.map((tab) => (
              <TabsContent key={tab.id} value={tab.id}>
                <SkillsList
                  key={owner.sId}
                  searchTerm={searchTerm}
                  filters={{ ...tab.filters, ...searchFilters }}
                  permissionFiltering={permissionFiltering}
                  onSelect={setSkillId}
                />
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
      {isImportDialogOpen && (
        <ImportSkillsDialog
          owner={owner}
          onClose={() => setIsImportDialogOpen(false)}
        />
      )}
      <SkillDetailsSheet
        owner={owner}
        user={user}
        skillId={skillId ?? null}
        onClose={() => setSkillId(undefined)}
      />
    </>
  );
}
