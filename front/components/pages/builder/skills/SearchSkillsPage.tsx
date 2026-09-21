import { SkillDetailsSheet } from "@app/components/skills/SkillDetailsSheet";
import { SkillSearchTable } from "@app/components/skills/SkillSearchTable";
import {
  useSetContentWidth,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { useCursorPaginationForDataTable } from "@app/hooks/useCursorPaginationForDataTable";
import { useDebounce } from "@app/hooks/useDebounce";
import { useHashParam } from "@app/hooks/useHashParams";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useWorkspacePermissions } from "@app/lib/swr/permissions";
import { useSearchSkills } from "@app/lib/swr/skill_configurations";
import { getSkillBuilderRoute } from "@app/lib/utils/router";
import type { SkillSearchFilters } from "@app/types/api/skills";
import {
  Button,
  EmptyCTA,
  Page,
  Plus,
  SearchInput,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";

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

interface SkillSearchResultsProps {
  searchTerm: string;
  filters: SkillSearchFilters;
  isDebouncing: boolean;
  onSelect: (skillId: string) => void;
}

function SkillSearchResults({
  searchTerm,
  filters,
  isDebouncing,
  onSelect,
}: SkillSearchResultsProps) {
  const owner = useWorkspace();
  const { cursorPagination, tablePagination, handlePaginationChange } =
    useCursorPaginationForDataTable(SKILL_SEARCH_PAGE_SIZE);
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
    sortBy: searchTerm.trim() ? "relevance" : "usage",
    disabled: isDebouncing,
  });

  if (isSkillsLoading || isDebouncing) {
    return (
      <div
        className="flex min-h-64 items-center justify-center"
        role="status"
        aria-label="Loading skills"
      >
        <Spinner />
      </div>
    );
  }

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
      (skills.length > 0 || tablePagination.pageIndex > 0) ? (
        <SkillSearchTable
          owner={owner}
          skills={skills}
          onSelect={onSelect}
          onRefresh={mutate}
          pagination={tablePagination}
          setPagination={(pagination) =>
            handlePaginationChange(pagination, nextCursor)
          }
          hasMore={hasMore}
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
  const { inputValue, debouncedValue, isDebouncing, setValue } =
    useDebounce("");
  useSetContentWidth("wide");
  useSetPageTitle("Dust - Manage Skills");

  return (
    <>
      <div className="flex w-full flex-col gap-6 pb-4">
        <Page.Header
          title="Manage Skills"
          description="Reusable packages of instructions and tools that agents can share."
        />
        <div className="flex items-center gap-2">
          <label htmlFor="skill-search" className="sr-only">
            Search skills
          </label>
          <SearchInput
            id="skill-search"
            name="skill-search"
            placeholder="Search skills by name"
            value={inputValue}
            onChange={setValue}
            isLoading={isDebouncing}
            className="flex-1"
          />
          {hasPermission("create", "skill") && (
            <Button
              label="Create skill"
              icon={Plus}
              href={getSkillBuilderRoute(owner.sId, "new")}
            />
          )}
        </div>
        <Tabs defaultValue="all">
          <TabsList>
            {SEARCH_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} label={tab.label} />
            ))}
          </TabsList>
          {SEARCH_TABS.map((tab) => (
            <TabsContent key={tab.id} value={tab.id}>
              <SkillSearchResults
                key={`${owner.sId}:${debouncedValue}`}
                searchTerm={debouncedValue}
                filters={tab.filters}
                isDebouncing={isDebouncing}
                onSelect={setSkillId}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
      <SkillDetailsSheet
        owner={owner}
        user={user}
        skillId={skillId ?? null}
        onClose={() => setSkillId(undefined)}
      />
    </>
  );
}
