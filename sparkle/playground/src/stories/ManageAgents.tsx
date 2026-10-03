import {
  Button,
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

import type { FleetFilterOption } from "../components/manage/FleetFilterBar";
import {
  FleetFilterChips,
  FleetFilterMenu,
} from "../components/manage/FleetFilterBar";
import type { FleetItemFields } from "../components/manage/fleetFilters";
import {
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

// ── Filter menus ──────────────────────────────────────────────────────────────

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

// Protected tags sort after standard ones, as in the product.
const tagsSorter = (a: AgentTag, b: AgentTag) => {
  if (a.kind !== b.kind) {
    return a.kind.localeCompare(b.kind);
  }
  return a.name.localeCompare(b.name);
};

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
    tools: agent.tools,
    // Independent of archived-ness: the Archived tab owns that dimension, so
    // an archived agent still has a publication state to filter on.
    publication: agent.scope === "hidden" ? "unpublished" : "published",
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
  const [selection, setSelection] = useState<string[]>([]);
  // Rows always carry a checkbox; ticking one is what opens batch mode.
  const isBatchEdit = selection.length > 0;
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

  const isSearchActive = assistantSearch.trim() !== "";
  const isFilterActive =
    isSearchActive ||
    filters.tags.length > 0 ||
    filters.models.length > 0 ||
    filters.tools.length > 0 ||
    filters.publication.length > 0 ||
    filters.editors.length > 0 ||
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

  const modelOptions = useMemo<FleetFilterOption[]>(() => {
    const options = agents.map((a) => ({
      value: a.modelId,
      label: AGENT_MODELS_BY_ID.get(a.modelId)?.displayName ?? a.modelId,
      icon: getModelLogoByModelId(a.modelId),
    }));
    return Array.from(
      new Map(options.map((option) => [option.value, option])).values()
    ).sort((a, b) => a.label.localeCompare(b.label));
  }, [agents]);

  const tagOptions = useMemo<FleetFilterOption[]>(
    () => uniqueTags.map((tag) => ({ value: tag.sId, label: tag.name })),
    [uniqueTags]
  );

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
  // Default agents and archived ones can't be batch-edited, so those tabs get
  // no checkbox column at all.
  const showSelection = activeAgents.some(
    (agent) => agent.status !== "archived" && agent.scope !== "global"
  );

  return (
    <ManagePageLayout>
      <div className="flex w-full flex-col gap-8 pb-4">
        <Page.Header title="Manage Agents" noTopPadding />
        <Page.Vertical gap="md" align="stretch">
          <div className="flex flex-row items-center gap-2">
            {/* Bounded, not full-width: a fleet is filtered far more often than
                it is keyword-searched, so the input should not dominate. */}
            <SearchInput
              ref={searchBarRef}
              className="w-full max-w-md"
              name="search"
              placeholder="Search (Name, Editors)"
              value={assistantSearch}
              onChange={setAssistantSearch}
            />
            <div className="ml-auto flex gap-2">
              <FleetFilterMenu
                filters={filters}
                people={people}
                showPublication
                models={modelOptions}
                tags={tagOptions}
                onToggle={toggleValue}
                onUpdate={updateFilters}
              />
              <CreateDropdown />
            </div>
          </div>
          <FleetFilterChips
            filters={filters}
            peopleById={peopleById}
            onRemove={updateFilters}
            onClear={clearFilters}
            models={modelOptions}
            tags={tagOptions}
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
                onClose={() => setSelection([])}
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
                showSelection={showSelection}
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
