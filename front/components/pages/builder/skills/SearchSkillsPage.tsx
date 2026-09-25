import { FilterSummaryChips } from "@app/components/shared/filter_panel/FilterSummaryChips";
import {
  clearFilterCategory,
  getFilterSummaries,
} from "@app/components/shared/filter_panel/filterState";
import { CreateSkillButton } from "@app/components/skills/CreateSkillButton";
import { ImportSkillsDialog } from "@app/components/skills/import/ImportSkillsDialog";
import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { SkillFilterPanel } from "@app/components/skills/SkillFilterPanel";
import {
  SKILL_SEARCH_NAME_COLUMN_WIDTH,
  SkillSearchTable,
} from "@app/components/skills/SkillSearchTable";
import type { SkillFilter } from "@app/components/skills/skillFilter";
import {
  SKILL_FILTER_CATEGORIES,
  SKILL_FILTER_CATEGORY_SINGULAR_LABEL,
  toSkillSearchFilters,
} from "@app/components/skills/skillFilter";
import {
  useSetContentWidth,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { useCursorPaginationForDataTable } from "@app/hooks/useCursorPaginationForDataTable";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useSearchSkills } from "@app/lib/swr/skill_configurations";
import type {
  SkillSearchFilters,
  SkillSearchSort,
  SkillSearchSortOrder,
} from "@app/types/api/skills";
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
import { useState } from "react";

const SKILL_SEARCH_PAGE_SIZE = 50;

const SEARCH_TABS = [
  { id: "all", label: "All", filters: { status: ["active"] } },
  {
    id: "editable",
    label: "Editable",
    filters: { status: ["active"], editedByMe: true },
  },
  {
    id: "default",
    label: "Default",
    filters: { status: ["active"], codeDefinedOnly: true },
  },
  { id: "archived", label: "Archived", filters: { status: ["archived"] } },
] satisfies { id: string; label: string; filters: SkillSearchFilters }[];

interface SkillsListProps {
  searchTerm: string;
  filters: SkillSearchFilters;
  onSelect: (skillId: string) => void;
}

function SkillsList({ searchTerm, filters, onSelect }: SkillsListProps) {
  const owner = useWorkspace();
  const {
    cursorPagination,
    tablePagination,
    handlePaginationChange,
    resetPagination,
  } = useCursorPaginationForDataTable(SKILL_SEARCH_PAGE_SIZE);
  const [selectedSort, setSelectedSort] = useState<{
    sortBy: Exclude<SkillSearchSort, "relevance">;
    sortOrder: SkillSearchSortOrder;
  } | null>(null);
  const sortBy =
    selectedSort?.sortBy ?? (searchTerm.trim() ? "relevance" : "usage");
  const sortOrder = selectedSort?.sortOrder;
  const queryKey = JSON.stringify({ searchTerm, filters, sortBy, sortOrder });
  const [previousQueryKey, setPreviousQueryKey] = useState(queryKey);

  if (queryKey !== previousQueryKey) {
    setPreviousQueryKey(queryKey);
    resetPagination();
  }

  const {
    skills,
    hasMore,
    nextCursor,
    isSkillsLoading,
    isSkillsError,
    mutate,
  } = useSearchSkills({
    owner,
    searchTerm,
    filters,
    cursor: cursorPagination.cursor,
    limit: SKILL_SEARCH_PAGE_SIZE,
    sortBy,
    sortOrder,
  });

  return (
    <div className="flex flex-col gap-4">
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
          setPagination={(pagination) => {
            if (!isSkillsLoading) {
              handlePaginationChange(pagination, nextCursor);
            }
          }}
          hasMore={hasMore}
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
    </div>
  );
}

export function SearchSkillsPage() {
  const owner = useWorkspace();
  const { user } = useAuth();
  const { hasPermission } = useWorkspacePermissions();
  const [skillId, setSkillId] = useHashParam("skillId");
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<SkillFilter>({});
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const searchFilters = toSkillSearchFilters(filter);
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
        <div className={SKILL_SEARCH_NAME_COLUMN_WIDTH}>
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
        <Tabs defaultValue="all">
          <TabsList>
            {SEARCH_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} label={tab.label} />
            ))}
            <div className="grow" />
            <div className="flex items-center">
              <SkillFilterPanel
                owner={owner}
                filter={filter}
                onFilterChange={setFilter}
              />
            </div>
          </TabsList>
          <FilterSummaryChips
            summaries={getFilterSummaries(
              filter,
              SKILL_FILTER_CATEGORIES,
              SKILL_FILTER_CATEGORY_SINGULAR_LABEL
            )}
            onClearCategory={(category) =>
              setFilter(clearFilterCategory(filter, category))
            }
            onClearAll={() => setFilter({})}
          />
          {SEARCH_TABS.map((tab) => (
            <TabsContent key={tab.id} value={tab.id}>
              <SkillsList
                key={owner.sId}
                searchTerm={searchTerm}
                filters={{ ...tab.filters, ...searchFilters }}
                onSelect={setSkillId}
              />
            </TabsContent>
          ))}
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
