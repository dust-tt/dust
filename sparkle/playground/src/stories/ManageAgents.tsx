import {
  Button,
  Chip,
  ContactsRobot,
  CpuChip01,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTagItem,
  DropdownMenuTagList,
  DropdownMenuTrigger,
  EmptyCTA,
  File02,
  FolderOpen,
  ListSelect,
  MagicWand02,
  Page,
  Plus,
  PuzzlePiece01,
  SearchInput,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
  Tag01,
  XClose,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  FleetFilterChips,
  FleetFilterMenu,
} from "../components/manage/FleetFilterBar";
import type { FleetItemFields } from "../components/manage/fleetFilters";
import {
  AGENT_STATUS_OPTIONS,
  filterFleet,
  useFleetFilters,
} from "../components/manage/fleetFilters";
import { ManageAgentsTable } from "../components/manage/ManageAgentsTable";
import { getModelLogoByModelId } from "../components/manage/ManageAgentsTable";
import { ManagePageLayout } from "../components/manage/ManagePageLayout";
import { compareForFuzzySort, subFilter } from "../components/manage/utils";
import type { AgentTag, ManagedAgent } from "../data/manageAgents";
import {
  AGENT_MODELS_BY_ID,
  AGENT_TAGS,
  mockArchivedAgents,
  mockManagedAgents,
} from "../data/manageAgents";

const AGENT_MANAGER_TABS = [
  // default shown tab = earliest in this list with non-empty agents
  { id: "all_custom", label: "All", description: "All custom agents." },
  {
    id: "editable_by_me",
    label: "Editable by me",
    description: "Edited or created by you.",
  },
  {
    id: "global",
    label: "Default",
    description: "Default agents provided by Dust.",
  },
  { id: "archived", label: "Archived", description: "Archived agents." },
] as const;

type AssistantManagerTabsType = (typeof AGENT_MANAGER_TABS)[number]["id"];

type AgentModelFilterType = { modelId: string; displayName: string };

const tagsSorter = (a: AgentTag, b: AgentTag) => {
  if (a.kind !== b.kind) {
    return a.kind.localeCompare(b.kind);
  }
  return a.name.localeCompare(b.name);
};

const getAgentSearchString = (agent: ManagedAgent) =>
  agent.name.toLowerCase() +
  " " +
  agent.editors
    .map((editor) => editor.fullName)
    .join(" ")
    .toLowerCase();

// ── Filter menus ──────────────────────────────────────────────────────────────

interface ModelsFilterMenuProps {
  models: AgentModelFilterType[];
  selectedModels: AgentModelFilterType[];
  setSelectedModels: (models: AgentModelFilterType[]) => void;
}

function ModelsFilterMenu({
  models,
  selectedModels,
  setSelectedModels,
}: ModelsFilterMenuProps) {
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  const selectedModelIds = new Set(selectedModels.map((m) => m.modelId));

  const searchLower = modelSearch.toLowerCase();
  const filteredModels = models
    .filter((m) => subFilter(searchLower, m.displayName.toLowerCase()))
    .sort((a, b) => {
      if (modelSearch) {
        return compareForFuzzySort(searchLower, a.displayName, b.displayName);
      }
      return a.displayName.localeCompare(b.displayName);
    });

  return (
    <DropdownMenu
      open={isDropdownOpen}
      onOpenChange={(open) => {
        setDropdownOpen(open);
        if (!open) {
          setModelSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          icon={CpuChip01}
          label="Models"
          counterValue={selectedModels.length.toString()}
          isCounter={selectedModels.length > 0}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-96"
        dropdownHeaders={
          <DropdownMenuSearchbar
            name="modelSearch"
            placeholder="Search models"
            value={modelSearch}
            onChange={setModelSearch}
          />
        }
      >
        {filteredModels.length === 0 && (
          <div className="flex items-center justify-center py-4 text-sm">
            No models found
          </div>
        )}
        {filteredModels.map((model) => (
          <DropdownMenuCheckboxItem
            key={model.modelId}
            label={model.displayName}
            icon={getModelLogoByModelId(model.modelId)}
            truncateText
            checked={selectedModelIds.has(model.modelId)}
            onCheckedChange={() => {
              setSelectedModels(
                selectedModelIds.has(model.modelId)
                  ? selectedModels.filter((m) => m.modelId !== model.modelId)
                  : [...selectedModels, model]
              );
            }}
            // Keep the menu open so several models can be toggled in a row.
            onSelect={(event) => event.preventDefault()}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface TagsFilterMenuProps {
  tags: AgentTag[];
  selectedTags: AgentTag[];
  setSelectedTags: (tags: AgentTag[]) => void;
}

function TagsFilterMenu({
  tags,
  selectedTags,
  setSelectedTags,
}: TagsFilterMenuProps) {
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  const filteredTags = tags
    .filter((t) => subFilter(tagSearch, t.name.toLowerCase()))
    .sort((a, b) => {
      if (tagSearch) {
        return compareForFuzzySort(
          tagSearch,
          a.name.toLowerCase(),
          b.name.toLowerCase()
        );
      }
      return tagsSorter(a, b);
    });

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          icon={Tag01}
          label="Tags"
          counterValue={selectedTags.length.toString()}
          isCounter={selectedTags.length > 0}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-96"
        dropdownHeaders={
          <DropdownMenuSearchbar
            name="tagSearch"
            placeholder="Search tags"
            value={tagSearch}
            onChange={setTagSearch}
            button={<Button variant="primary" label="Manage tags" />}
          />
        }
      >
        {filteredTags.length === 0 && (
          <div className="flex items-center justify-center py-4 text-sm">
            No tags found
          </div>
        )}
        <DropdownMenuTagList>
          {filteredTags
            .filter((tag) => !selectedTags.includes(tag))
            .map((tag) => (
              <DropdownMenuTagItem
                key={tag.sId}
                label={tag.name}
                color="info"
                className="m-0.5"
                onClick={() => setSelectedTags([...selectedTags, tag])}
              />
            ))}
        </DropdownMenuTagList>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreateDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="primary"
          icon={Plus}
          label="Create"
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel label="Agents" />
        <DropdownMenuItem label="agent from scratch" icon={File02} />
        <DropdownMenuItem label="agent from template" icon={MagicWand02} />
        <DropdownMenuItem label="agent from YAML" icon={FolderOpen} />
        <DropdownMenuLabel label="Skills" />
        <DropdownMenuItem label="skill from scratch" icon={PuzzlePiece01} />
        <DropdownMenuItem label="skill from existing" icon={FolderOpen} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Batch edit bar ────────────────────────────────────────────────────────────

interface AgentEditBarProps {
  onClose: () => void;
  selectedAgents: ManagedAgent[];
  tags: AgentTag[];
  onToggleTag: (tag: AgentTag) => void;
}

function AgentEditBar({
  onClose,
  selectedAgents,
  tags,
  onToggleTag,
}: AgentEditBarProps) {
  const [tagSearch, setTagSearch] = useState("");

  const filteredTags = tags
    .filter((t) => subFilter(tagSearch, t.name.toLowerCase()))
    .sort((a, b) => {
      if (tagSearch) {
        return compareForFuzzySort(
          tagSearch,
          a.name.toLowerCase(),
          b.name.toLowerCase()
        );
      }
      return tagsSorter(a, b);
    });

  const isEmptySelection = selectedAgents.length === 0;

  return (
    <div className="border-1 mb-2 flex flex-row items-center gap-2 rounded-xl bg-muted-background p-2">
      <Button
        size="xs"
        variant="outline"
        label="Close edition"
        icon={XClose}
        onClick={onClose}
      />
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="xs"
            variant="outline"
            isSelect
            icon={Tag01}
            label="Tag selection"
            disabled={isEmptySelection}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-60"
          dropdownHeaders={
            <>
              <DropdownMenuSearchbar
                name="tagSearch"
                placeholder="Search tags"
                value={tagSearch}
                onChange={setTagSearch}
              />
              <DropdownMenuSeparator />
            </>
          }
        >
          <DropdownMenuTagList>
            {filteredTags.map((tag) => (
              <DropdownMenuTagItem
                key={tag.sId}
                label={tag.name}
                color="info"
                onClick={() => onToggleTag(tag)}
              />
            ))}
          </DropdownMenuTagList>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        size="xs"
        variant="outline"
        label="Set model"
        disabled={isEmptySelection}
      />
      <Button
        size="xs"
        variant="outline"
        label="Unpublish"
        disabled={isEmptySelection}
      />
      <Button
        size="xs"
        variant="warning"
        label="Archive"
        disabled={isEmptySelection}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// The mock fleet is generated around a fixed "today" so relative filters
// ("not used in 60 days") stay stable across renders.
const NOW_MS = new Date("2026-08-10T10:00:00Z").getTime();

function agentFilterFields(agent: ManagedAgent): FleetItemFields {
  return {
    name: agent.name,
    editorIds: agent.editors.map((editor) => editor.sId),
    editorNames: agent.editors.map((editor) => editor.fullName),
    lastEditorId: agent.lastEditedBy?.sId ?? null,
    tools: agent.tools,
    status:
      agent.status === "archived"
        ? "archived"
        : agent.scope === "hidden"
          ? "unpublished"
          : "published",
    visibility: agent.visibility,
    modelId: agent.modelId,
    tagIds: agent.tags.map((tag) => tag.sId),
    updatedAt: agent.lastUpdate,
    usage: agent.usage,
  };
}

export default function ManageAgents() {
  const [agents, setAgents] = useState<ManagedAgent[]>(mockManagedAgents);
  const [archivedAgents] = useState<ManagedAgent[]>(mockArchivedAgents);
  const [selectedTab, setSelectedTab] =
    useState<AssistantManagerTabsType>("all_custom");
  const [isBatchEdit, setIsBatchEdit] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [detailedAgentId, setDetailedAgentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { filters, updateFilters, toggleValue, clearFilters } =
    useFleetFilters();

  // The real page renders a spinner while the agent configurations load.
  useEffect(() => {
    const timeout = window.setTimeout(() => setIsLoading(false), 350);
    return () => window.clearTimeout(timeout);
  }, []);

  const assistantSearch = filters.search;
  const setAssistantSearch = (search: string) => updateFilters({ search });

  const selectedTags = useMemo(
    () => AGENT_TAGS.filter((tag) => filters.tags.includes(tag.sId)),
    [filters.tags]
  );
  const selectedModels = useMemo<AgentModelFilterType[]>(
    () =>
      filters.models.map((modelId) => ({
        modelId,
        displayName: AGENT_MODELS_BY_ID.get(modelId)?.displayName ?? modelId,
      })),
    [filters.models]
  );

  // The two pre-existing menus keep their own shapes; they just write into the
  // shared filter state so every dimension composes.
  const setSelectedTags = (tags: AgentTag[]) =>
    updateFilters({ tags: tags.map((tag) => tag.sId) });
  const setSelectedModels = (models: AgentModelFilterType[]) =>
    updateFilters({ models: models.map((model) => model.modelId) });

  const isSearchActive = assistantSearch.trim() !== "";
  const isFilterActive =
    isSearchActive ||
    filters.tags.length > 0 ||
    filters.models.length > 0 ||
    filters.tools.length > 0 ||
    filters.status.length > 0 ||
    filters.visibility.length > 0 ||
    filters.editors.length > 0 ||
    filters.lastEditors.length > 0 ||
    filters.editedWithin !== null ||
    filters.notUsedFor !== null;

  const selectedAgents = agents.filter((a) => selection.includes(a.sId));

  const agentsByTab = useMemo(() => {
    // Every dimension is a plain AND over the same list, which is what makes
    // "published agents using Salesforce, not used in 60 days" expressible.
    const byName = (list: ManagedAgent[]) =>
      [...list].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase())
      );

    const filteredList = (list: ManagedAgent[]) =>
      filterFleet(byName(list), filters, agentFilterFields, NOW_MS);

    return {
      all_custom: filteredList(agents.filter((a) => a.scope !== "global")),
      editable_by_me: filteredList(agents.filter((a) => a.canEdit)),
      global: filteredList(agents.filter((a) => a.scope === "global")),
      archived: filteredList(archivedAgents),
    };
  }, [agents, archivedAgents, filters]);

  const uniqueTags = useMemo(() => {
    const tags = agents.flatMap((a) => a.tags);
    return Array.from(new Map(tags.map((tag) => [tag.sId, tag])).values()).sort(
      (a, b) => a.name.localeCompare(b.name)
    );
  }, [agents]);

  const uniqueModels = useMemo(() => {
    const models = agents.map((a) => ({
      modelId: a.modelId,
      displayName: AGENT_MODELS_BY_ID.get(a.modelId)?.displayName ?? a.modelId,
    }));
    return Array.from(
      new Map(models.map((model) => [model.modelId, model])).values()
    ).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [agents]);

  // Everyone who edits something in the fleet — the option list for the
  // Editors and Last editor filters.
  const people = useMemo(() => {
    const byId = new Map<string, { sId: string; fullName: string }>();
    for (const agent of [...agents, ...archivedAgents]) {
      for (const editor of agent.editors) {
        byId.set(editor.sId, { sId: editor.sId, fullName: editor.fullName });
      }
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName)
    );
  }, [agents, archivedAgents]);

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.sId, person.fullName])),
    [people]
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

  const updateAgent = (sId: string, update: Partial<ManagedAgent>) => {
    setAgents((current) =>
      current.map((agent) =>
        agent.sId === sId ? { ...agent, ...update } : agent
      )
    );
  };

  const handleToggleAgentStatus = (agent: ManagedAgent) => {
    updateAgent(agent.sId, {
      status:
        agent.status === "disabled_by_admin" ? "active" : "disabled_by_admin",
    });
  };

  const handleBatchToggleTag = (tag: AgentTag) => {
    const allHaveTag = selectedAgents.every((agent) =>
      agent.tags.some((t) => t.sId === tag.sId)
    );
    setAgents((current) =>
      current.map((agent) => {
        if (!selection.includes(agent.sId)) {
          return agent;
        }
        const hasTag = agent.tags.some((t) => t.sId === tag.sId);
        if (allHaveTag) {
          return {
            ...agent,
            tags: agent.tags.filter((t) => t.sId !== tag.sId),
          };
        }
        return hasTag ? agent : { ...agent, tags: [...agent.tags, tag] };
      })
    );
  };

  const activeAgents = agentsByTab[selectedTab];

  return (
    <ManagePageLayout>
      <div className="flex w-full flex-col gap-8 pb-4">
        <Page.Header title="Manage Agents" icon={ContactsRobot} />
        <Page.Vertical gap="md" align="stretch">
          <div className="flex flex-row gap-2">
            <SearchInput
              ref={searchBarRef}
              className="flex-grow"
              name="search"
              placeholder="Search (Name, Editors)"
              value={assistantSearch}
              onChange={setAssistantSearch}
            />
            {!isBatchEdit && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  icon={ListSelect}
                  label="Batch edit"
                  onClick={() => setIsBatchEdit(true)}
                />
                <ModelsFilterMenu
                  models={uniqueModels}
                  selectedModels={selectedModels}
                  setSelectedModels={setSelectedModels}
                />
                <TagsFilterMenu
                  tags={uniqueTags}
                  selectedTags={selectedTags}
                  setSelectedTags={setSelectedTags}
                />
                <FleetFilterMenu
                  filters={filters}
                  statusOptions={AGENT_STATUS_OPTIONS}
                  people={people}
                  showVisibility
                  onToggle={toggleValue}
                  onUpdate={updateFilters}
                />
                <CreateDropdown />
              </div>
            )}
          </div>
          <FleetFilterChips
            filters={filters}
            statusOptions={AGENT_STATUS_OPTIONS}
            peopleById={peopleById}
            onRemove={updateFilters}
            onClear={clearFilters}
            hasLeadingChips={
              selectedModels.length > 0 || selectedTags.length > 0
            }
            leadingChips={
              <>
                {selectedModels.map((model) => (
                  <Chip
                    key={model.modelId}
                    label={model.displayName}
                    size="xs"
                    color="primary"
                    icon={getModelLogoByModelId(model.modelId)}
                    onRemove={() =>
                      setSelectedModels(
                        selectedModels.filter(
                          (m) => m.modelId !== model.modelId
                        )
                      )
                    }
                  />
                ))}
                {selectedTags.map((tag) => (
                  <Chip
                    key={tag.sId}
                    label={tag.name}
                    size="xs"
                    color="info"
                    onRemove={() =>
                      setSelectedTags(selectedTags.filter((t) => t !== tag))
                    }
                  />
                ))}
              </>
            }
          />
          {isFilterActive && (
            <div className="text-sm text-muted-foreground">
              {activeAgents.length} agent
              {activeAgents.length === 1 ? "" : "s"} match
              {activeAgents.length === 1 ? "es" : ""} the current filters.
            </div>
          )}
          <div className="flex flex-col pt-3">
            {isBatchEdit ? (
              <AgentEditBar
                onClose={() => {
                  setIsBatchEdit(false);
                  setSelection([]);
                }}
                selectedAgents={selectedAgents}
                tags={AGENT_TAGS}
                onToggleTag={handleBatchToggleTag}
              />
            ) : (
              <Tabs value={selectedTab}>
                <TabsList>
                  {AGENT_MANAGER_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      label={tab.label}
                      onClick={() => setSelectedTab(tab.id)}
                      tooltip={tab.description}
                      isCounter={tab.id !== "archived"}
                      counterValue={`${agentsByTab[tab.id].length}`}
                    />
                  ))}
                </TabsList>
              </Tabs>
            )}
            {isLoading ? (
              <div className="mt-8 flex justify-center">
                <Spinner size="lg" />
              </div>
            ) : isFilterActive && activeAgents.length === 0 ? (
              <div className="pt-2">
                <EmptyCTA
                  message="No agent matches your search or filters."
                  action={null}
                />
              </div>
            ) : (
              <ManageAgentsTable
                isBatchEdit={isBatchEdit}
                selection={selection}
                setSelection={setSelection}
                agents={activeAgents}
                tags={AGENT_TAGS}
                nowMs={NOW_MS}
                setDetailedAgentId={setDetailedAgentId}
                onToggleAgentStatus={handleToggleAgentStatus}
                onTagsChange={(agentId, tags) => updateAgent(agentId, { tags })}
                onArchiveAgent={(agent) =>
                  setAgents((current) =>
                    current.filter((a) => a.sId !== agent.sId)
                  )
                }
              />
            )}
          </div>
        </Page.Vertical>
      </div>
      {detailedAgentId && (
        <AgentDetailsPlaceholder
          agent={agents.find((a) => a.sId === detailedAgentId) ?? null}
          onClose={() => setDetailedAgentId(null)}
        />
      )}
    </ManagePageLayout>
  );
}

// The details sheet is out of scope for this playground; a minimal panel keeps
// the row click meaningful.
function AgentDetailsPlaceholder({
  agent,
  onClose,
}: {
  agent: ManagedAgent | null;
  onClose: () => void;
}) {
  if (!agent) {
    return null;
  }
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
          <span className="heading-lg text-foreground">@{agent.name}</span>
          <Button size="xs" variant="ghost" icon={XClose} onClick={onClose} />
        </div>
        <p className="text-sm text-muted-foreground">{agent.description}</p>
      </div>
    </div>
  );
}
