import {
  Button,
  Card,
  CardActionButton,
  Checkbox,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  EmptyCTAButton,
  FolderOpen,
  InfoCircle,
  Page,
  Plus,
  PuzzlePiece01,
  SearchInput,
  Spinner,
  Stars02,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  XClose,
} from "@dust-tt/sparkle";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  FleetFilterChips,
  FleetFilterMenu,
} from "../components/manage/FleetFilterBar";
import type { FleetItemFields } from "../components/manage/fleetFilters";
import {
  filterFleet,
  useFleetFilters,
} from "../components/manage/fleetFilters";
import { ManagePageLayout } from "../components/manage/ManagePageLayout";
import { ManageSkillsTable } from "../components/manage/ManageSkillsTable";
import { SKILL_AVAILABILITY_DISPLAY } from "../components/manage/ManageSkillsTable";
import { SkillAvatar } from "../components/manage/skillIcons";
import {
  compareForFuzzySort,
  pluralize,
  subFilter,
} from "../components/manage/utils";
import type { ManagedSkill, SkillAvailability } from "../data/manageSkills";
import {
  mockActiveSkills,
  mockArchivedSkills,
  mockSuggestedSkills,
  SKILL_AVAILABILITIES,
} from "../data/manageSkills";

// ── Tabs and filters ──────────────────────────────────────────────────────────

type SkillManagerTabType =
  | "active"
  | "editable_by_me"
  | "favorites"
  | "archived";

const SKILL_MANAGER_TABS: {
  id: SkillManagerTabType;
  label: string;
  description: string;
}[] = [
  { id: "active", label: "All", description: "All active skills" },
  {
    id: "editable_by_me",
    label: "Editable by me",
    description: "Skills you can edit",
  },
  { id: "favorites", label: "Favorites", description: "Skills you favorited" },
  { id: "archived", label: "Archived", description: "Archived skills" },
];

type AvailabilityFilter = SkillAvailability | "all";

const AVAILABILITY_FILTER_OPTIONS: {
  value: AvailabilityFilter;
  label: string;
}[] = [
  { value: "all", label: "All availabilities" },
  ...SKILL_AVAILABILITIES.map((availability) => ({
    value: availability,
    label: SKILL_AVAILABILITY_DISPLAY[availability].label,
  })),
];

function getAvailabilityFilterLabel(filter: AvailabilityFilter): string {
  return (
    AVAILABILITY_FILTER_OPTIONS.find((o) => o.value === filter)?.label ??
    "All availabilities"
  );
}

function getSkillSearchString(skill: ManagedSkill): string {
  const editorNames = skill.relations.editors?.map((e) => e.fullName) ?? [];
  return [skill.name].concat(editorNames).join(" ").toLowerCase();
}

function sortSkillsByName(skills: ManagedSkill[]) {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
}

function filterByAvailability(
  skills: ManagedSkill[],
  availabilityFilter: AvailabilityFilter
) {
  return availabilityFilter === "all"
    ? skills
    : skills.filter((s) => s.availability === availabilityFilter);
}

function filterBySearch(
  skills: ManagedSkill[],
  searchLower: string,
  isSearchActive: boolean
) {
  if (!isSearchActive) {
    return skills;
  }
  return skills
    .filter((s) => subFilter(searchLower, getSkillSearchString(s)))
    .sort((a, b) =>
      compareForFuzzySort(
        searchLower,
        getSkillSearchString(a),
        getSkillSearchString(b)
      )
    );
}

// ── Suggested skills ──────────────────────────────────────────────────────────

interface SuggestedSkillsSectionProps {
  skills: ManagedSkill[];
  onSkillClick: (skill: ManagedSkill) => void;
  onDismiss: (skill: ManagedSkill) => void;
}

function SuggestedSkillsSection({
  skills,
  onSkillClick,
  onDismiss,
}: SuggestedSkillsSectionProps) {
  if (skills.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 flex flex-col gap-3 pb-6">
      <h4 className="heading-sm flex items-center gap-1.5 text-foreground">
        Suggested skills
        <Stars02 className="h-4 w-4" />
      </h4>
      <div className="flex gap-2 overflow-x-auto">
        {skills.map((skill) => (
          <div key={skill.sId} className="max-w-80 flex-shrink-0">
            <Card
              variant="primary"
              onClick={() => onSkillClick(skill)}
              action={
                <CardActionButton
                  size="icon"
                  icon={XClose}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(skill);
                  }}
                />
              }
            >
              <div className="flex h-full w-full flex-col justify-between gap-3">
                <div className="flex flex-col">
                  <div className="mb-2 flex items-center gap-2">
                    <SkillAvatar icon={skill.icon} size="sm" />
                    <span className="truncate text-sm font-medium">
                      {skill.name}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {skill.userFacingDescription}
                  </p>
                </div>
                <div>
                  <Button
                    size="xs"
                    variant="outline"
                    icon={Plus}
                    label="Add skill"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Batch edition ─────────────────────────────────────────────────────────────

type BatchAvailabilityAction = {
  label: string;
  description?: string;
  availability: SkillAvailability;
  getDialogTitle: (count: number) => string;
  dialogDescription: (count: number) => string;
};

const BATCH_AVAILABILITY_ACTIONS: BatchAvailabilityAction[] = [
  {
    label: "Editors only",
    availability: "editors",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} editors only`,
    dialogDescription: (count) => {
      const pronoun = count === 1 ? "it" : "them";
      const subject = count === 1 ? "The skill remains" : "The skills remain";
      return `Only editors can find ${pronoun} via the input bar and agent builder. ${subject} available through agents and skills that use ${pronoun}.`;
    },
  },
  {
    label: "Members",
    availability: "workspace_users",
    getDialogTitle: (count) =>
      `Make ${count} skill${pluralize(count)} available to all members`,
    dialogDescription: (count) => {
      const pronoun = count === 1 ? "it" : "them";
      return `All members can find ${pronoun} via the input bar and agent builder.`;
    },
  },
  {
    label: "Members and agents",
    description: "Available to all members and agents with Discover Skills",
    availability: "users_and_agents",
    getDialogTitle: () => "This affects your entire workspace",
    dialogDescription: (count) => {
      const pronoun = count === 1 ? "it" : "them";
      return `All members can find ${pronoun} via the input bar and agent builder. Agents with Discover Skills, including Dust, can use ${pronoun} automatically.`;
    },
  },
];

interface SkillsBatchEditBarProps {
  selectedSkills: ManagedSkill[];
  canMakeSkillAutoDiscoverable: boolean;
  onClose: () => void;
  onSelectAction: (action: BatchAvailabilityAction) => void;
  onArchive: () => void;
}

function SkillsBatchEditBar({
  selectedSkills,
  canMakeSkillAutoDiscoverable,
  onClose,
  onSelectAction,
  onArchive,
}: SkillsBatchEditBarProps) {
  const selectedCount = selectedSkills.length;

  return (
    <div className="flex flex-row items-center justify-between gap-2 rounded-xl bg-muted-background px-2 py-2 dark:bg-muted-background-night">
      <Button
        variant="outline"
        size="xs"
        icon={XClose}
        label="Close edition"
        onClick={onClose}
      />
      <div className="flex flex-row items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              label="Set availability"
              isSelect
              disabled={selectedCount === 0}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {BATCH_AVAILABILITY_ACTIONS.map((action) => {
              const isActionDisabled =
                action.availability === "users_and_agents" &&
                !canMakeSkillAutoDiscoverable;
              return (
                <DropdownMenuItem
                  key={action.availability}
                  label={action.label}
                  description={
                    isActionDisabled
                      ? "You don’t have permission to make skills auto-discoverable"
                      : action.description
                  }
                  disabled={isActionDisabled}
                  onClick={() => onSelectAction(action)}
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="warning"
          size="xs"
          label="Archive"
          disabled={selectedCount === 0}
          onClick={onArchive}
        />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// The mock fleet is generated around a fixed "today" so relative filters
// ("not used in 60 days") stay stable across renders.
const NOW_MS = new Date("2026-08-10T10:00:00Z").getTime();

function skillFilterFields(skill: ManagedSkill): FleetItemFields {
  return {
    name: skill.name,
    editorIds: (skill.relations.editors ?? []).map((editor) => editor.sId),
    editorNames: (skill.relations.editors ?? []).map(
      (editor) => editor.fullName
    ),
    tools: skill.tools,
    // Skills express publication through availability, which keeps its own
    // control next to the tabs; status is already the Archived tab.
    publication: null,
    modelId: null,
    tagIds: [],
    updatedAt: skill.updatedAt,
    usage: skill.messageUsage,
  };
}

export default function ManageSkills() {
  const [activeSkills, setActiveSkills] =
    useState<ManagedSkill[]>(mockActiveSkills);
  const [archivedSkills, setArchivedSkills] =
    useState<ManagedSkill[]>(mockArchivedSkills);
  const [suggestedSkills, setSuggestedSkills] =
    useState<ManagedSkill[]>(mockSuggestedSkills);

  const [selectedTab, setSelectedTab] = useState<SkillManagerTabType>("active");
  const [bypassEditorVisibility, setBypassEditorVisibility] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pendingBatchAction, setPendingBatchAction] =
    useState<BatchAvailabilityAction | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<ManagedSkill | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // The availability dropdown keeps its own query param, exactly as it does
  // today; the rest of the dimensions live in the shared filter state.
  const { filters, updateFilters, toggleValue, clearFilters } =
    useFleetFilters();
  const availabilityFilter = (filters.availability[0] ??
    "all") as AvailabilityFilter;
  const setAvailabilityFilter = (value: AvailabilityFilter) =>
    updateFilters({ availability: value === "all" ? [] : [value] });

  const skillSearch = filters.search;
  const setSkillSearch = (search: string) => updateFilters({ search });

  // The real page renders a spinner while the skills load.
  useEffect(() => {
    const timeout = window.setTimeout(() => setIsLoading(false), 350);
    return () => window.clearTimeout(timeout);
  }, []);

  const canMakeSkillAutoDiscoverable = true;

  const isSearchActive = skillSearch.trim() !== "";
  const isFilterActive =
    isSearchActive ||
    availabilityFilter !== "all" ||
    filters.tools.length > 0 ||
    filters.editors.length > 0 ||
    filters.editedWithin !== null ||
    filters.notUsedFor !== null;

  // Switching tabs resets the availability filter to avoid carrying it across
  // lists.
  const handleTabChange = (tabId: SkillManagerTabType) => {
    setSelectedTab(tabId);
    setAvailabilityFilter("all");
  };

  const handleShowHiddenChange = (checked: boolean) => {
    setBypassEditorVisibility(checked);
    setAvailabilityFilter(checked ? "editors" : "all");
  };

  const sortedActiveSkills = useMemo(
    () => sortSkillsByName(activeSkills),
    [activeSkills]
  );
  const sortedArchivedSkills = useMemo(
    () => sortSkillsByName(archivedSkills),
    [archivedSkills]
  );

  // Everyone who edits something in the fleet — the option list for the
  // Editors and Last editor filters.
  const people = useMemo(() => {
    const byId = new Map<string, { sId: string; fullName: string }>();
    for (const skill of [...activeSkills, ...archivedSkills]) {
      for (const editor of skill.relations.editors ?? []) {
        byId.set(editor.sId, { sId: editor.sId, fullName: editor.fullName });
      }
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }, [activeSkills, archivedSkills]);

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.sId, person.fullName])),
    [people]
  );

  const skillsByTab = useMemo<
    Record<SkillManagerTabType, ManagedSkill[]>
  >(() => {
    const editableByMeSkills = sortedActiveSkills.filter((s) =>
      s.relations.editors?.some((e) => e.sId === "1")
    );
    const favoriteSkills = sortSkillsByName(
      activeSkills.filter((s) => s.isFavorite)
    );

    // Availability keeps its dedicated control; every other dimension goes
    // through the shared predicate so they all combine.
    const filteredList = (list: ManagedSkill[]) =>
      filterFleet(
        filterByAvailability(list, availabilityFilter),
        filters,
        skillFilterFields,
        NOW_MS
      );

    return {
      active: filteredList(sortedActiveSkills),
      editable_by_me: filteredList(editableByMeSkills),
      favorites: filteredList(favoriteSkills),
      archived: filteredList(sortedArchivedSkills),
    };
  }, [
    sortedActiveSkills,
    sortedArchivedSkills,
    activeSkills,
    filters,
    availabilityFilter,
  ]);

  const selectedSkillIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([sId]) => sId),
    [rowSelection]
  );
  const selectedSkills = useMemo(
    () => activeSkills.filter((skill) => rowSelection[skill.sId]),
    [activeSkills, rowSelection]
  );

  const closeBatchEdition = () => {
    setRowSelection({});
  };

  const handleBatchAvailability = (availability: SkillAvailability) => {
    setActiveSkills((current) =>
      current.map((skill) =>
        selectedSkillIds.includes(skill.sId)
          ? { ...skill, availability }
          : skill
      )
    );
    setRowSelection({});
  };

  const handleArchiveSkill = useCallback((skill: ManagedSkill) => {
    setActiveSkills((current) => current.filter((s) => s.sId !== skill.sId));
    setArchivedSkills((current) => [
      ...current,
      { ...skill, status: "archived" },
    ]);
  }, []);

  const handleSkillClick = useCallback((skill: ManagedSkill) => {
    setSelectedSkill(skill);
  }, []);

  const handleAgentClick = useCallback(() => {}, []);

  const handleUsedBySkillClick = useCallback(
    (skillId: string) => {
      const skill = activeSkills.find((s) => s.sId === skillId);
      if (skill) {
        setSelectedSkill(skill);
      }
    },
    [activeSkills]
  );

  const searchBarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchBarRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === "/") {
        event.preventDefault();
        searchBarRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, []);

  // Archived skills have nothing to batch-edit, so they keep no checkboxes.
  const isBatchEditionAvailable = selectedTab !== "archived";
  const isBatchEditing = selectedSkillIds.length > 0;
  const isActiveTabEmpty = skillsByTab[selectedTab].length === 0;

  const renderEmptyTabState = () => {
    if (isFilterActive) {
      return (
        <EmptyCTA
          message="No skill matches your search or filters."
          action={null}
        />
      );
    }
    // Nothing to create into from the archived tab.
    if (selectedTab === "archived") {
      return null;
    }
    return (
      <EmptyCTA
        action={
          <EmptyCTAButton
            label="Create a skill"
            icon={Plus}
            variant="primary"
          />
        }
      />
    );
  };

  return (
    <ManagePageLayout>
      {pendingBatchAction && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPendingBatchAction(null);
            }
          }}
        >
          <DialogContent size="md" isAlertDialog>
            <DialogHeader hideButton>
              <DialogTitle>
                {pendingBatchAction.getDialogTitle(selectedSkillIds.length)}
              </DialogTitle>
            </DialogHeader>
            <DialogContainer className="text-sm">
              {pendingBatchAction.dialogDescription(selectedSkillIds.length)}
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{ label: "Cancel", variant: "outline" }}
              rightButtonProps={{
                label: "Update",
                onClick: () => {
                  handleBatchAvailability(pendingBatchAction.availability);
                  setPendingBatchAction(null);
                },
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      <div className="flex w-full flex-col gap-8 pb-4">
        <Page.Header
          title="Manage Skills"
          description="Reusable packages of instructions and tools that agents can share."
          noTopPadding
        />
        <Page.Vertical gap="md" align="stretch">
          <div className="flex flex-row items-center gap-2">
            {/* Bounded, not full-width: a fleet is filtered far more often than
                it is keyword-searched, so the input should not dominate. */}
            <SearchInput
              ref={searchBarRef}
              className="w-full max-w-md"
              name="search"
              placeholder="Search (Name, Editors)"
              value={skillSearch}
              onChange={setSkillSearch}
            />
            <div className="ml-auto flex gap-2">
              <FleetFilterMenu
                filters={filters}
                people={people}
                showPublication={false}
                onToggle={toggleValue}
                onUpdate={updateFilters}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button label="Create skill" icon={Plus} isSelect />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem label="From scratch" icon={PuzzlePiece01} />
                  <DropdownMenuItem label="From existing" icon={FolderOpen} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <FleetFilterChips
            filters={filters}
            peopleById={peopleById}
            onRemove={updateFilters}
            onClear={clearFilters}
          />
          {isFilterActive && (
            <div className="text-sm text-muted-foreground">
              {skillsByTab[selectedTab].length} skill
              {skillsByTab[selectedTab].length === 1 ? "" : "s"} match
              {skillsByTab[selectedTab].length === 1 ? "es" : ""} the current
              filters.
            </div>
          )}
          {isBatchEditionAvailable && isBatchEditing && (
            <SkillsBatchEditBar
              selectedSkills={selectedSkills}
              canMakeSkillAutoDiscoverable={canMakeSkillAutoDiscoverable}
              onClose={closeBatchEdition}
              onSelectAction={setPendingBatchAction}
              onArchive={() => {
                selectedSkills.forEach(handleArchiveSkill);
                closeBatchEdition();
              }}
            />
          )}
          <div className="flex flex-col pt-3">
            <Tabs value={selectedTab}>
              <TabsList>
                {SKILL_MANAGER_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    label={tab.label}
                    onClick={() => handleTabChange(tab.id)}
                    tooltip={tab.description}
                    isCounter={tab.id !== "archived"}
                    counterValue={`${skillsByTab[tab.id].length}`}
                  />
                ))}
                <div className="ml-auto flex flex-row items-center gap-3 self-center text-sm text-muted-foreground">
                  <span className="flex gap-1">
                    <label className="flex cursor-pointer flex-row items-center gap-2 whitespace-nowrap">
                      <Checkbox
                        checked={bypassEditorVisibility}
                        onCheckedChange={(checked) =>
                          handleShowHiddenChange(checked === true)
                        }
                      />
                      Show hidden skills
                    </label>
                    <Tooltip
                      label="Shows skills you can access as an admin, even if you’re not an editor"
                      trigger={
                        <InfoCircle className="h-4 w-4 text-muted-foreground" />
                      }
                    />
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        isSelect
                        className="w-44 justify-between"
                        label={getAvailabilityFilterLabel(availabilityFilter)}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {AVAILABILITY_FILTER_OPTIONS.map((option) => (
                        <DropdownMenuItem
                          key={option.value}
                          label={option.label}
                          onClick={() => setAvailabilityFilter(option.value)}
                        />
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TabsList>
            </Tabs>
            {isLoading ? (
              <div className="mt-8 flex justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <>
                {selectedTab === "active" &&
                  !isFilterActive &&
                  suggestedSkills.length > 0 && (
                    <SuggestedSkillsSection
                      skills={sortSkillsByName(suggestedSkills)}
                      onSkillClick={handleSkillClick}
                      onDismiss={(skill) =>
                        setSuggestedSkills((current) =>
                          current.filter((s) => s.sId !== skill.sId)
                        )
                      }
                    />
                  )}
                {isActiveTabEmpty ? (
                  <div className="pt-2">{renderEmptyTabState()}</div>
                ) : (
                  <ManageSkillsTable
                    skills={skillsByTab[selectedTab]}
                    nowMs={NOW_MS}
                    onSkillClick={handleSkillClick}
                    onAgentClick={handleAgentClick}
                    onUsedBySkillClick={handleUsedBySkillClick}
                    onArchiveSkill={handleArchiveSkill}
                    canMakeSkillAutoDiscoverable={canMakeSkillAutoDiscoverable}
                    {...(isBatchEditionAvailable
                      ? { rowSelection, setRowSelection }
                      : {})}
                  />
                )}
              </>
            )}
          </div>
        </Page.Vertical>
      </div>
      {selectedSkill && (
        <SkillDetailsPlaceholder
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
        />
      )}
    </ManagePageLayout>
  );
}

// The details sheet is out of scope for this playground; a minimal panel keeps
// the row click meaningful.
function SkillDetailsPlaceholder({
  skill,
  onClose,
}: {
  skill: ManagedSkill;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/20"
      onClick={onClose}
    >
      <div
        className="flex h-full w-96 flex-col gap-3 bg-background p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <SkillAvatar
              icon={skill.icon}
              isDustProvided={skill.editedBy === null}
            />
            <span className="heading-lg text-foreground">{skill.name}</span>
          </div>
          <Button size="xs" variant="ghost" icon={XClose} onClick={onClose} />
        </div>
        <p className="text-sm text-muted-foreground">
          {skill.userFacingDescription}
        </p>
      </div>
    </div>
  );
}
