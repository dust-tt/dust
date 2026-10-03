// Port of front's input bar "/" menu:
//   editor/extensions/input_bar/InputBarSlashSuggestionDropdown.tsx (+ Items, Types)
//   editor/extensions/shared/slash_suggestion/{AttachContextSubMenuDropdown,
//   PickModelSubMenuDropdown,knowledgeBrowserSlashCommands,buildPickModelSlashCommandItems,
//   slashStaticCommands,slashMenuNavigation}.ts(x)
//   editor/extensions/shared/SlashCommandCapabilitiesItems.ts
// SWR fetches are replaced by the mock catalog in data/composer.ts, with short simulated
// loading so the skeleton rows show like they do in the product.

import {
  Avatar,
  BookOpen01,
  Check,
  Brain,
  Breadcrumbs,
  ChevronRight,
  DoubleIcon,
  DustLogoSquare,
  File02,
  Folder,
  Globe01,
  Icon,
  Image01,
  LayersThree01,
  MessageChatSquare,
  Minimize01,
  Planet,
  PuzzlePiece01,
  Table,
  Command,
  UploadCloud02,
} from "@dust-tt/sparkle";
import type { BreadcrumbsItem } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  ComposerCategory,
  ComposerContextFile,
  ComposerDataSource,
  ComposerModel,
  ComposerNode,
  ComposerSkill,
  ComposerSpace,
  ComposerTool,
  ReasoningEffort,
} from "../../data/composer";
import {
  CATEGORY_DETAILS,
  COMPOSER_CONTEXT_FILES,
  COMPOSER_DATA_SOURCES,
  COMPOSER_MODELS,
  COMPOSER_NODES,
  COMPOSER_SKILLS,
  COMPOSER_SPACES,
  COMPOSER_TOOLS,
  getModelMaker,
  getNodeChildren,
  getNodePath,
  getSpaceIcon,
  MODEL_TIERS,
  REASONING_EFFORT_LABELS,
} from "../../data/composer";
import type { ModelSelection } from "./ComposerModelPicker";
import { getInitialEffort } from "./ComposerModelPicker";
import type {
  SlashCommand,
  SlashCommandDropdownRef,
  SlashCommandSearchbarProps,
  SlashCommandSection,
} from "./SlashCommandDropdown";
import {
  SLASH_COMMAND_CAPABILITIES_SECTION_LABEL,
  SlashCommandDropdown,
} from "./SlashCommandDropdown";

// ---------------------------------------------------------------------------
// Actions & selections
// ---------------------------------------------------------------------------

export const INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION = "insert-knowledge-node";
export const PICK_MODEL_SLASH_COMMAND_ACTION = "pick-model";
export const SELECT_SPACES_SLASH_COMMAND_ACTION = "select-spaces";
export const RUN_COMMAND_SLASH_COMMAND_ACTION = "run-command";
export const SELECT_SKILL_SLASH_COMMAND_ACTION = "select-skill";
export const SELECT_TOOL_SLASH_COMMAND_ACTION = "select-tool";
const SELECT_MODEL_SLASH_COMMAND_ACTION = "select-model";
const SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION = "select-attach-context";
const NAVIGATE_KNOWLEDGE_BROWSER_ACTION = "navigate-knowledge-browser";

export type SubMenuId = "attach-context" | "pick-model" | "select-spaces";

export interface SubMenuFrame {
  subMenuId: SubMenuId;
  label: string;
}

export type AttachSelection =
  | { kind: "knowledge"; node: ComposerNode; label: string }
  | { kind: "data_source"; dataSource: ComposerDataSource; label: string }
  | { kind: "file"; file: ComposerContextFile };

export const ATTACH_CONTEXT_QUERY_PLACEHOLDER = "Type to search";

// ---------------------------------------------------------------------------
// Fuzzy helpers (front/lib/utils.ts)
// ---------------------------------------------------------------------------

function subFilter(a: string, b: string) {
  let j = 0;
  for (let i = 0; i < b.length && j < a.length; i++) {
    if (a[j] === b[i]) {
      j++;
    }
  }
  return j === a.length;
}

function getAutocompleteRank(query: string, candidate: string) {
  if (candidate === query) {
    return { rank: 0, start: 0 };
  }
  if (candidate.startsWith(query)) {
    return { rank: 1, start: 0 };
  }
  const start = candidate.indexOf(query);
  if (start !== -1) {
    return { rank: 2, start };
  }
  return { rank: subFilter(query, candidate) ? 3 : 4, start: null };
}

function compareForAutocompleteSort(query: string, a: string, b: string) {
  const q = query.toLowerCase();
  if (q.length === 0) {
    return a.localeCompare(b);
  }
  const ma = getAutocompleteRank(q, a.toLowerCase());
  const mb = getAutocompleteRank(q, b.toLowerCase());
  if (ma.rank !== mb.rank) {
    return ma.rank - mb.rank;
  }
  if (ma.start !== null && mb.start !== null && ma.start !== mb.start) {
    return ma.start - mb.start;
  }
  return a.length - b.length || a.localeCompare(b);
}

// ---------------------------------------------------------------------------
// Avatars (front getSkillAvatarIcon / getAvatar / ResourceAvatar)
// ---------------------------------------------------------------------------

function ResourceAvatar({
  icon,
  iconColor = "text-foreground",
  backgroundColor = "bg-muted-background",
}: {
  icon: ComponentType;
  iconColor?: string;
  backgroundColor?: string;
}) {
  return (
    <Avatar
      size="sm"
      icon={icon}
      iconColor={iconColor}
      backgroundColor={backgroundColor}
    />
  );
}

export function SkillAvatar({ skill }: { skill: ComposerSkill }) {
  const avatar = (
    <ResourceAvatar
      icon={PuzzlePiece01}
      backgroundColor="bg-highlight-50"
      iconColor="text-highlight"
    />
  );
  if (!skill.isDustProvided) {
    return avatar;
  }
  return (
    <div className="relative inline-flex overflow-visible">
      {avatar}
      <span className="pointer-events-none absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-sm bg-background shadow-sm ring-1 ring-border">
        <DustLogoSquare className="h-3 w-3" />
      </span>
    </div>
  );
}

const TOOL_ICONS: Record<string, ComponentType> = {
  globe: Globe01,
  image: Image01,
  table: Table,
};

export function getToolIcon(tool: ComposerTool): ComponentType {
  return tool.logo ?? TOOL_ICONS[tool.iconName ?? ""] ?? Command;
}

function slashCommandAvatarIcon(icon: ComponentType) {
  return () => <ResourceAvatar icon={icon} />;
}

// ---------------------------------------------------------------------------
// Root menu items
// ---------------------------------------------------------------------------

function getRootCommandItems({
  hasConversation,
}: {
  hasConversation: boolean;
}): SlashCommand[] {
  // INPUT_BAR_SLASH_COMMAND_ORDER
  const items: SlashCommand[] = [
    {
      action: INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION,
      description: "Search knowledge and reference conversation or pod files",
      icon: slashCommandAvatarIcon(BookOpen01),
      id: "attach-knowledge",
      label: "Attach",
      tooltip: {
        description: "Use company knowledge or reference files for context.",
        media: (
          <img
            alt="Knowledge Search Interface"
            className="aspect-[4/3] w-full rounded object-cover"
            src="https://dust.tt/static/landing/product/Knowledge_Tooltips.jpg"
          />
        ),
      },
    },
    {
      action: RUN_COMMAND_SLASH_COMMAND_ACTION,
      data: { command: "upload-file" },
      description: "Upload a file from your device",
      icon: slashCommandAvatarIcon(UploadCloud02),
      id: "command-upload-file",
      label: "Upload file",
    },
    {
      action: PICK_MODEL_SLASH_COMMAND_ACTION,
      description: "Override the model used",
      icon: slashCommandAvatarIcon(Brain),
      id: "pick-model",
      label: "Pick model",
    },
  ];
  if (hasConversation) {
    items.push({
      action: RUN_COMMAND_SLASH_COMMAND_ACTION,
      data: { command: "compact" },
      description: "Free up context by summarizing conversation",
      icon: slashCommandAvatarIcon(Minimize01),
      id: "command-compact",
      label: "Compact",
    });
  }
  items.push({
    action: SELECT_SPACES_SLASH_COMMAND_ACTION,
    description: "Give the agent access to additional Spaces",
    icon: slashCommandAvatarIcon(Planet),
    id: "select-spaces",
    label: "Spaces",
  });
  return items;
}

function filterRootCommandItems(items: SlashCommand[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return items;
  }
  return items.filter((item) =>
    [item.label, item.description, item.tooltip?.description]
      .filter((v): v is string => v !== undefined)
      .some((v) => v.toLowerCase().includes(normalizedQuery))
  );
}

// searchCapabilityIndex: favorites first then alphabetical when empty, name matches ranked
// with compareForAutocompleteSort otherwise, description matches last.
function buildCapabilityItems(query: string): SlashCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  type Entry =
    | {
        kind: "skill";
        skill: ComposerSkill;
        sortName: string;
        isFavorite: boolean;
        description: string;
      }
    | {
        kind: "tool";
        tool: ComposerTool;
        sortName: string;
        isFavorite: boolean;
        description: string;
      };
  const entries: Entry[] = [
    ...COMPOSER_SKILLS.map((skill) => ({
      kind: "skill" as const,
      skill,
      sortName: skill.name,
      isFavorite: skill.isFavorite ?? false,
      description: skill.userFacingDescription,
    })),
    ...COMPOSER_TOOLS.map((tool) => ({
      kind: "tool" as const,
      tool,
      sortName: tool.name,
      isFavorite: false,
      description: tool.description,
    })),
  ];

  const matches = entries
    .map((entry) => ({
      entry,
      nameMatches:
        normalizedQuery.length === 0 ||
        subFilter(normalizedQuery, entry.sortName.toLowerCase()),
      descriptionMatches:
        normalizedQuery.length > 0 &&
        subFilter(normalizedQuery, entry.description.toLowerCase()),
    }))
    .filter((m) => m.nameMatches || m.descriptionMatches)
    .slice()
    .sort((a, b) => {
      const fav =
        a.entry.isFavorite === b.entry.isFavorite
          ? 0
          : a.entry.isFavorite
            ? -1
            : 1;
      if (normalizedQuery.length === 0) {
        return fav || a.entry.sortName.localeCompare(b.entry.sortName);
      }
      if (a.nameMatches !== b.nameMatches) {
        return a.nameMatches ? -1 : 1;
      }
      return (
        fav ||
        compareForAutocompleteSort(
          normalizedQuery,
          a.entry.sortName,
          b.entry.sortName
        )
      );
    })
    .slice(0, 50);

  return matches.map(({ entry }) =>
    entry.kind === "skill"
      ? {
          action: SELECT_SKILL_SLASH_COMMAND_ACTION,
          data: { skill: entry.skill },
          description: entry.skill.userFacingDescription,
          hasDetails: true,
          icon: () => <SkillAvatar skill={entry.skill} />,
          id: entry.skill.sId,
          label: entry.skill.name,
          tooltipLabel: entry.skill.name,
        }
      : {
          action: SELECT_TOOL_SLASH_COMMAND_ACTION,
          data: { tool: entry.tool },
          description: entry.tool.description,
          hasDetails: true,
          icon: () => <ResourceAvatar icon={getToolIcon(entry.tool)} />,
          id: entry.tool.sId,
          label: entry.tool.name,
        }
  );
}

// resolveSlashSubMenuFromQuery: "/pick model gpt" or "/attach notion" enters the sub-menu
// with the rest of the query.
function resolveSubMenuFromQuery(
  commandItems: SlashCommand[],
  query: string
): { frame: SubMenuFrame; query: string } | null {
  if (query.indexOf(" ") <= 0) {
    return null;
  }
  const rawWords = query.split(" ");
  const queryWords = rawWords.map((w) => w.toLowerCase());
  for (const command of commandItems) {
    const labelWords = command.label.toLowerCase().split(/[\s-]+/);
    const start = labelWords.findIndex((w) => w.startsWith(queryWords[0]));
    if (start === -1) {
      continue;
    }
    const subMenuId: SubMenuId | null =
      command.action === INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION
        ? "attach-context"
        : command.action === PICK_MODEL_SLASH_COMMAND_ACTION
          ? "pick-model"
          : null;
    if (!subMenuId) {
      return null;
    }
    let consumed = 1;
    while (
      consumed < queryWords.length &&
      start + consumed < labelWords.length &&
      queryWords[consumed] === labelWords[start + consumed]
    ) {
      consumed++;
    }
    return {
      frame: { subMenuId, label: command.label },
      query: rawWords.slice(consumed).join(" "),
    };
  }
  return null;
}

export function getSubMenuIdForCommand(
  item: SlashCommand,
  { spacesSubMenu = false }: { spacesSubMenu?: boolean } = {}
): SubMenuId | null {
  // Option C: Spaces opens inside the "/" menu instead of a separate picker.
  if (spacesSubMenu && item.action === SELECT_SPACES_SLASH_COMMAND_ACTION) {
    return "select-spaces";
  }
  if (item.action === INSERT_KNOWLEDGE_SLASH_COMMAND_ACTION) {
    return "attach-context";
  }
  if (item.action === PICK_MODEL_SLASH_COMMAND_ACTION) {
    return "pick-model";
  }
  return null;
}

// Simulated fetch latency so skeleton rows show like in the product.
function useSimulatedLoading(key: string, ms: number) {
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setLoadedKey(key), ms);
    return () => clearTimeout(t);
  }, [key, ms]);
  return loadedKey !== key;
}

// ---------------------------------------------------------------------------
// Attach sub-menu: knowledge browser
// ---------------------------------------------------------------------------

type NavEntry =
  | { type: "root" }
  | { type: "space"; space: ComposerSpace }
  | { type: "category"; space: ComposerSpace; category: ComposerCategory }
  | { type: "data_source"; dataSource: ComposerDataSource }
  | { type: "node"; node: ComposerNode };

function getEntryLabel(entry: NavEntry): string {
  switch (entry.type) {
    case "root":
      return "All";
    case "space":
      return entry.space.name;
    case "category":
      return CATEGORY_DETAILS[entry.category].label;
    case "data_source":
      return entry.dataSource.name;
    case "node":
      return entry.node.title;
  }
}

function getSpaceById(spaceId: string) {
  return COMPOSER_SPACES.find((s) => s.sId === spaceId)!;
}

function getDataSourceById(dsvId: string) {
  return COMPOSER_DATA_SOURCES.find((d) => d.sId === dsvId)!;
}

function getNodeIcon(node: ComposerNode): ComponentType {
  if (node.title.startsWith("#")) {
    return MessageChatSquare;
  }
  switch (node.type) {
    case "folder":
      return Folder;
    case "table":
      return LayersThree01;
    default:
      return File02;
  }
}

function KnowledgeNodeIcon({ node }: { node: ComposerNode }) {
  const dataSource = getDataSourceById(node.dataSourceViewId);
  if (!dataSource.isConnector) {
    return <Icon visual={getNodeIcon(node)} size="md" />;
  }
  return (
    <DoubleIcon
      size="md"
      mainIcon={getNodeIcon(node)}
      secondaryIcon={dataSource.logo}
    />
  );
}

function getFileIcon(contentType: string): ComponentType {
  if (contentType.startsWith("image/")) {
    return Image01;
  }
  if (contentType === "text/csv") {
    return Table;
  }
  return File02;
}

function getNodeDescription(node: ComposerNode): string | undefined {
  if (node.type === "folder") {
    const count = getNodeChildren(
      node.dataSourceViewId,
      node.internalId
    ).length;
    return count > 0 ? `${count} item${count > 1 ? "s" : ""}` : undefined;
  }
  const dataSource = getDataSourceById(node.dataSourceViewId);
  const space = getSpaceById(dataSource.spaceId);
  const parts = [
    space.name,
    node.lastUpdatedDaysAgo !== undefined
      ? `Updated ${node.lastUpdatedDaysAgo === 0 ? "1h" : `${node.lastUpdatedDaysAgo}d`} ago`
      : undefined,
  ].filter((p): p is string => p !== undefined);
  return parts.join(" · ");
}

// getLocationForDataSourceViewContentNodeWithSpace
function getNodeLocation(node: ComposerNode): string {
  const dataSource = getDataSourceById(node.dataSourceViewId);
  const space = getSpaceById(dataSource.spaceId);
  return [space.name, dataSource.name, ...getNodePath(node)].join(" › ");
}

function attachNodeCommand(
  node: ComposerNode,
  description?: string
): SlashCommand {
  return {
    action: SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION,
    data: {
      selection: {
        kind: "knowledge",
        node,
        label: node.title,
      } satisfies AttachSelection,
    },
    description,
    icon: () => <KnowledgeNodeIcon node={node} />,
    id: `knowledge-${node.internalId}`,
    label: node.title,
  };
}

function navigateCommand({
  id,
  label,
  icon,
  description,
  entry,
  onAdd,
}: {
  id: string;
  label: string;
  icon: ComponentType;
  description?: string;
  entry: NavEntry;
  onAdd?: () => void;
}): SlashCommand {
  return {
    action: NAVIGATE_KNOWLEDGE_BROWSER_ACTION,
    data: { entry },
    description,
    endAction: onAdd ? { label: "Add", onSelect: onAdd } : undefined,
    endIcon: ChevronRight,
    icon,
    id,
    label,
  };
}

function getBrowseLevel(
  current: NavEntry,
  onAttach: (selection: AttachSelection) => void
): { sections?: SlashCommandSection[]; items?: SlashCommand[] } {
  switch (current.type) {
    case "root": {
      const toRow = (space: ComposerSpace) =>
        navigateCommand({
          id: `browse-space-${space.sId}`,
          label: space.name,
          icon: getSpaceIcon(space),
          entry: { type: "space", space },
        });
      const spaces = COMPOSER_SPACES.filter((s) => s.kind !== "project");
      const pods = COMPOSER_SPACES.filter((s) => s.kind === "project");
      return {
        sections: [
          { label: "From spaces", items: spaces.map(toRow) },
          ...(pods.length > 0
            ? [{ label: "From Pods", items: pods.map(toRow) }]
            : []),
        ],
      };
    }
    case "space": {
      const dataSources = COMPOSER_DATA_SOURCES.filter(
        (d) => d.spaceId === current.space.sId
      );
      // Pods skip the category level.
      if (current.space.kind === "project") {
        return { items: dataSourceRows(dataSources, onAttach) };
      }
      const categories = (["managed", "folder", "website"] as const).filter(
        (c) => dataSources.some((d) => d.category === c)
      );
      return {
        items: categories.map((category) =>
          navigateCommand({
            id: `browse-category-${current.space.sId}-${category}`,
            label: CATEGORY_DETAILS[category].label,
            icon: CATEGORY_DETAILS[category].icon,
            entry: { type: "category", space: current.space, category },
          })
        ),
      };
    }
    case "category": {
      const dataSources = COMPOSER_DATA_SOURCES.filter(
        (d) =>
          d.spaceId === current.space.sId && d.category === current.category
      )
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
      return { items: dataSourceRows(dataSources, onAttach) };
    }
    case "data_source":
      return {
        items: nodeRows(
          getNodeChildren(current.dataSource.sId, null),
          onAttach
        ),
      };
    case "node":
      return {
        items: nodeRows(
          getNodeChildren(
            current.node.dataSourceViewId,
            current.node.internalId
          ),
          onAttach
        ),
      };
  }
}

function dataSourceRows(
  dataSources: ComposerDataSource[],
  onAttach: (selection: AttachSelection) => void
) {
  return dataSources.map((dataSource) =>
    navigateCommand({
      id: `browse-data_source-${dataSource.sId}`,
      label: dataSource.name,
      icon: dataSource.logo,
      entry: { type: "data_source", dataSource },
      onAdd: () =>
        onAttach({ kind: "data_source", dataSource, label: dataSource.name }),
    })
  );
}

function nodeRows(
  nodes: ComposerNode[],
  onAttach: (selection: AttachSelection) => void
) {
  return nodes.map((node) =>
    node.type === "folder"
      ? navigateCommand({
          id: `browse-node-${node.internalId}`,
          label: node.title,
          icon: getNodeIcon(node),
          description: getNodeDescription(node),
          entry: { type: "node", node },
          onAdd: () => onAttach({ kind: "knowledge", node, label: node.title }),
        })
      : attachNodeCommand(node, getNodeDescription(node))
  );
}

// Nodes below a navigation entry (for scoped search).
function isNodeUnder(node: ComposerNode, entry: NavEntry): boolean {
  const dataSource = getDataSourceById(node.dataSourceViewId);
  switch (entry.type) {
    case "root":
      return true;
    case "space":
      return dataSource.spaceId === entry.space.sId;
    case "category":
      return (
        dataSource.spaceId === entry.space.sId &&
        dataSource.category === entry.category
      );
    case "data_source":
      return node.dataSourceViewId === entry.dataSource.sId;
    case "node": {
      let parentId = node.parentId;
      while (parentId) {
        if (parentId === entry.node.internalId) {
          return true;
        }
        parentId =
          COMPOSER_NODES.find((n) => n.internalId === parentId)?.parentId ??
          null;
      }
      return false;
    }
  }
}

const MIN_SEARCH_QUERY_SIZE = 2;

function searchKnowledge(query: string): {
  files: ComposerContextFile[];
  nodes: ComposerNode[];
} {
  const q = query.trim().toLowerCase();
  return {
    files: COMPOSER_CONTEXT_FILES.filter((f) =>
      f.label.toLowerCase().includes(q)
    ),
    nodes: COMPOSER_NODES.filter((n) => n.title.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => compareForAutocompleteSort(q, a.title, b.title))
      .slice(0, 10),
  };
}

function fileCommand(file: ComposerContextFile): SlashCommand {
  return {
    action: SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION,
    data: { selection: { kind: "file", file } satisfies AttachSelection },
    description: "Conversation files",
    icon: () => <Icon visual={getFileIcon(file.contentType)} size="md" />,
    id: `file-${file.id}`,
    label: file.label,
  };
}

// ---------------------------------------------------------------------------
// Option C: compact navigation (title / "a / b / c" trail next to the "‹" button)
// ---------------------------------------------------------------------------

function CompactNavTitle({ label }: { label: string }) {
  return (
    <div className="truncate text-sm font-medium text-foreground dark:text-foreground-night">
      {label}
    </div>
  );
}

const MAX_VISIBLE_CRUMBS = 3;

function CompactBreadcrumb({
  items,
}: {
  items: { label: string; onClick: () => void }[];
}) {
  // Long trails keep the first crumb and the last two; the rest collapse into "…".
  const visible =
    items.length > MAX_VISIBLE_CRUMBS
      ? [items[0], null, ...items.slice(-(MAX_VISIBLE_CRUMBS - 1))]
      : items;
  return (
    <div className="flex min-w-0 items-center gap-1 text-sm">
      {visible.map((item, index) => {
        const isLast = index === visible.length - 1;
        return (
          <Fragment key={item ? `${index}-${item.label}` : `ellipsis-${index}`}>
            {index > 0 && (
              <span className="shrink-0 text-faint dark:text-faint-night">
                /
              </span>
            )}
            {item === null ? (
              <span className="shrink-0 text-muted-foreground">…</span>
            ) : isLast ? (
              <span className="truncate font-medium text-foreground dark:text-foreground-night">
                {item.label}
              </span>
            ) : (
              <button
                type="button"
                className="max-w-28 shrink truncate text-muted-foreground hover:text-foreground dark:text-muted-foreground-night dark:hover:text-foreground-night"
                onClick={item.onClick}
              >
                {item.label}
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

const AttachContextSubMenu = forwardRef<
  SlashCommandDropdownRef,
  {
    clientRect?: (() => DOMRect | null) | null;
    frame: SubMenuFrame;
    query: string;
    onBack: () => void;
    onClose: () => void;
    onSelect: (selection: AttachSelection) => void;
    searchbar?: SlashCommandSearchbarProps;
    compactNav?: boolean;
  }
>(
  (
    {
      clientRect,
      frame,
      query,
      onBack,
      onClose,
      onSelect,
      searchbar,
      compactNav,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const [history, setHistory] = useState<NavEntry[]>([{ type: "root" }]);
    const current = history[history.length - 1];
    const canNavigateUp = history.length > 1;
    const normalizedQuery = query.trim();
    const hasMinimalQuery = normalizedQuery.length >= MIN_SEARCH_QUERY_SIZE;
    const mode: "browse" | "search" | "scoped-search" =
      normalizedQuery.length === 0
        ? "browse"
        : canNavigateUp
          ? "scoped-search"
          : "search";

    const isBrowseLoading = useSimulatedLoading(
      `browse-${history.length}-${getEntryLabel(current)}`,
      history.length === 1 ? 350 : 200
    );
    const isSearchLoading = useSimulatedLoading(
      `search-${normalizedQuery}`,
      300
    );

    const emptyMessage = !hasMinimalQuery
      ? "Type at least 2 characters to search"
      : "No results found";

    const level = useMemo(
      () => getBrowseLevel(current, onSelect),
      [current, onSelect]
    );

    const searchItems = useMemo(() => {
      if (!hasMinimalQuery) {
        return [];
      }
      const { files, nodes } = searchKnowledge(normalizedQuery);
      return [
        ...files.map(fileCommand),
        ...nodes.map((node) => attachNodeCommand(node, getNodeLocation(node))),
      ];
    }, [hasMinimalQuery, normalizedQuery]);

    const scopedSections = useMemo((): SlashCommandSection[] => {
      const scoped = hasMinimalQuery
        ? COMPOSER_NODES.filter(
            (n) =>
              isNodeUnder(n, current) &&
              n.title.toLowerCase().includes(normalizedQuery.toLowerCase())
          ).slice(0, 10)
        : [];
      const scopedIds = new Set(scoped.map((n) => n.internalId));
      return [
        {
          label: `In "${getEntryLabel(current)}"`,
          // Rendered like browse rows: folders open (with "Add"), leaves attach.
          items: nodeRows(scoped, onSelect),
          isLoading: hasMinimalQuery && isSearchLoading,
          emptyMessage: hasMinimalQuery ? "No matches here" : undefined,
        },
        {
          label: "All knowledge",
          items: searchItems.filter((item) => {
            const selection = (item.data as { selection: AttachSelection })
              .selection;
            return !(
              selection.kind === "knowledge" &&
              scopedIds.has(selection.node.internalId)
            );
          }),
          isLoading: hasMinimalQuery && isSearchLoading,
          emptyMessage,
        },
      ];
    }, [
      current,
      emptyMessage,
      hasMinimalQuery,
      isSearchLoading,
      normalizedQuery,
      searchItems,
      onSelect,
    ]);

    const navigateUp = () =>
      setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));

    // Option C: the trail starts at the sub-menu name ("Attach / Company Data / …").
    const compactTitle = compactNav ? (
      <CompactBreadcrumb
        items={history.map((entry, index) => ({
          label: index === 0 ? frame.label : getEntryLabel(entry),
          onClick: () => setHistory((h) => h.slice(0, index + 1)),
        }))}
      />
    ) : null;

    const breadcrumbs = canNavigateUp ? (
      <div
        className="w-0 min-w-full px-2 py-1"
        onMouseDown={(event) => event.preventDefault()}
      >
        <Breadcrumbs
          collapseIntermediates
          items={history.map(
            (entry, index): BreadcrumbsItem => ({
              label: getEntryLabel(entry),
              onClick: () => setHistory((h) => h.slice(0, index + 1)),
            })
          )}
          size="xs"
        />
      </div>
    ) : undefined;

    const handleSelect = (item: SlashCommand) => {
      if (item.action === NAVIGATE_KNOWLEDGE_BROWSER_ACTION) {
        const { entry } = item.data as { entry: NavEntry };
        setHistory((h) => [...h, entry]);
      } else if (item.action === SELECT_ATTACH_CONTEXT_SLASH_COMMAND_ACTION) {
        onSelect((item.data as { selection: AttachSelection }).selection);
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          // Shift+Enter attaches a highlighted folder or data source instead of entering it.
          if (event.key === "Enter" && event.shiftKey) {
            const highlighted = dropdownRef.current?.getHighlightedItem?.();
            if (highlighted?.endAction) {
              event.preventDefault();
              highlighted.endAction.onSelect();
              return true;
            }
          }
          if (event.key === "Backspace" && normalizedQuery.length === 0) {
            event.preventDefault();
            if (canNavigateUp) {
              navigateUp();
            } else {
              onClose();
            }
            return true;
          }
          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [canNavigateUp, normalizedQuery, onClose]
    );

    const listProps =
      mode === "search"
        ? { items: searchItems }
        : mode === "scoped-search"
          ? { sections: scopedSections }
          : current.type === "root"
            ? {
                sections: level
                  .sections!.map((s, i) =>
                    i === 0 && isBrowseLoading
                      ? { ...s, items: [], isLoading: true }
                      : isBrowseLoading
                        ? { ...s, items: [] }
                        : s
                  )
                  .filter((s) => !isBrowseLoading || s.isLoading),
              }
            : { items: isBrowseLoading ? [] : (level.items ?? []) };

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        clientRect={clientRect}
        command={handleSelect}
        emptyMessage={
          mode === "browse" ? "Nothing to browse here" : emptyMessage
        }
        headerContent={breadcrumbs}
        compactNav={compactTitle ? { title: compactTitle } : undefined}
        isLoading={
          mode === "browse"
            ? isBrowseLoading
            : mode === "search" && hasMinimalQuery && isSearchLoading
        }
        onClose={onClose}
        {...(mode === "search" && hasMinimalQuery && isSearchLoading
          ? { items: [] }
          : listProps)}
        subMenuNavigation={{ label: frame.label, onBack }}
        size="wide"
        searchbar={searchbar}
      />
    );
  }
);
AttachContextSubMenu.displayName = "AttachContextSubMenu";

// ---------------------------------------------------------------------------
// Pick model sub-menu
// ---------------------------------------------------------------------------

const EFFORT_PREFIX_PRIORITY: ReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "none",
  "xhigh",
  "minimal",
  "maximal",
];

function getEffortForQueryWord(word: string) {
  return EFFORT_PREFIX_PRIORITY.find(
    (effort) =>
      effort.startsWith(word) ||
      REASONING_EFFORT_LABELS[effort].toLowerCase().startsWith(word)
  );
}

interface ModelRowData {
  selection: ModelSelection;
  compactName: string;
}

function buildPickModelItems(query: string): SlashCommand[] {
  const items: (SlashCommand & { data: ModelRowData })[] = [];

  for (const tier of MODEL_TIERS) {
    items.push({
      action: SELECT_MODEL_SLASH_COMMAND_ACTION,
      data: {
        selection: { kind: "tier", tierId: tier.id },
        compactName: tier.name.toLowerCase(),
      },
      description: tier.resolvedLabel,
      icon: tier.icon,
      id: `tier-${tier.id}`,
      label: tier.name,
    });
  }

  for (const model of COMPOSER_MODELS) {
    if (model.isLocked) {
      continue;
    }
    const efforts: ReasoningEffort[] =
      model.efforts.length > 0 ? model.efforts : ["none"];
    const maker = getModelMaker(model.makerId);
    for (const effort of efforts) {
      const effortLabel =
        effort === "none"
          ? null
          : REASONING_EFFORT_LABELS[effort].toLowerCase();
      items.push({
        action: SELECT_MODEL_SLASH_COMMAND_ACTION,
        data: {
          selection: { kind: "model", model, effort },
          compactName: model.displayName.toLowerCase().replace(/[\s-]+/g, ""),
        },
        description: maker.name,
        endChipLabel: effortLabel ?? (efforts.length > 1 ? "none" : undefined),
        icon: maker.logo,
        id: `${model.makerId}/${model.modelId}/${effort}`,
        label: model.displayName,
      });
    }
  }

  const queryWords = query
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((w) => w.length > 0);
  if (queryWords.length === 0) {
    return items;
  }
  const lastWord = queryWords[queryWords.length - 1];
  const effort = getEffortForQueryWord(lastWord);
  const nameQuery = (effort ? queryWords.slice(0, -1) : queryWords).join("");
  const rank = (list: typeof items, q: string) =>
    q.length === 0
      ? list
      : list
          .slice()
          .sort((a, b) =>
            compareForAutocompleteSort(
              q,
              a.data.compactName,
              b.data.compactName
            )
          );

  if (!effort) {
    return rank(
      items.filter((item) => subFilter(nameQuery, item.data.compactName)),
      nameQuery
    );
  }
  const effortMatches = items.filter(
    (item) =>
      item.data.selection.kind === "model" &&
      item.data.selection.effort === effort &&
      subFilter(nameQuery, item.data.compactName)
  );
  const nameMatches = items.filter(
    (item) =>
      !effortMatches.includes(item) &&
      queryWords.length > 1 &&
      lastWord.length >= 2 &&
      subFilter(queryWords.join(""), item.data.compactName)
  );
  return [
    ...rank(nameMatches, queryWords.join("")),
    ...rank(effortMatches, nameQuery),
  ];
}

const PickModelSubMenu = forwardRef<
  SlashCommandDropdownRef,
  {
    clientRect?: (() => DOMRect | null) | null;
    frame: SubMenuFrame;
    query: string;
    onBack: () => void;
    onClose: () => void;
    onSelect: (selection: ModelSelection) => void;
    searchbar?: SlashCommandSearchbarProps;
    compactNav?: boolean;
  }
>(
  (
    {
      clientRect,
      frame,
      query,
      onBack,
      onClose,
      onSelect,
      searchbar,
      compactNav,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const items = useMemo(() => buildPickModelItems(query), [query]);

    // Enter picks the first model at its initial effort, like the model picker does.
    const defaultSelectedItemId = useMemo(() => {
      const first = items[0]?.data as ModelRowData | undefined;
      if (!first || first.selection.kind !== "model") {
        return null;
      }
      const { model } = first.selection as { model: ComposerModel };
      const effort = getInitialEffort(model);
      return (
        items.find((item) => {
          const s = (item.data as ModelRowData).selection;
          return (
            s.kind === "model" &&
            s.model.modelId === model.modelId &&
            s.effort === (model.efforts.length > 0 ? effort : "none")
          );
        })?.id ?? null
      );
    }, [items]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (event.key === "Backspace" && query.trim().length === 0) {
            event.preventDefault();
            onClose();
            return true;
          }
          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [onClose, query]
    );

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        clientRect={clientRect}
        command={(item) => onSelect((item.data as ModelRowData).selection)}
        defaultSelectedItemId={defaultSelectedItemId}
        emptyMessage="No models found"
        items={items}
        onClose={onClose}
        subMenuNavigation={{ label: frame.label, onBack }}
        size="wide"
        searchbar={searchbar}
        compactNav={
          compactNav
            ? { title: <CompactNavTitle label="Pick a model" /> }
            : undefined
        }
      />
    );
  }
);
PickModelSubMenu.displayName = "PickModelSubMenu";

// ---------------------------------------------------------------------------
// Option C: Spaces sub-menu (InputBarSpacesPicker rendered inside the "/" menu)
// ---------------------------------------------------------------------------

const TOGGLE_SPACE_ACTION = "toggle-space";

const SpacesSubMenu = forwardRef<
  SlashCommandDropdownRef,
  {
    clientRect?: (() => DOMRect | null) | null;
    frame: SubMenuFrame;
    query: string;
    onBack: () => void;
    onClose: () => void;
    searchbar?: SlashCommandSearchbarProps;
    spaces: ComposerSpace[];
    selectedSpaceIds: string[];
    onToggleSpace: (spaceId: string) => void;
  }
>(
  (
    {
      clientRect,
      frame,
      query,
      onBack,
      onClose,
      searchbar,
      spaces,
      selectedSpaceIds,
      onToggleSpace,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const normalizedQuery = query.trim().toLowerCase();
    const items = useMemo(
      () =>
        spaces
          .filter((space) => space.name.toLowerCase().includes(normalizedQuery))
          .map(
            (space): SlashCommand => ({
              action: TOGGLE_SPACE_ACTION,
              data: { spaceId: space.sId },
              icon: getSpaceIcon(space),
              id: `space-${space.sId}`,
              label: space.name,
              endIcon: selectedSpaceIds.includes(space.sId) ? Check : undefined,
            })
          ),
      [normalizedQuery, selectedSpaceIds, spaces]
    );

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (event.key === "Backspace" && normalizedQuery.length === 0) {
            event.preventDefault();
            onClose();
            return true;
          }
          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [normalizedQuery, onClose]
    );

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        clientRect={clientRect}
        command={(item) =>
          onToggleSpace((item.data as { spaceId: string }).spaceId)
        }
        // Keeps the highlight on the toggled row instead of jumping back to the first.
        defaultSelectedItemId={null}
        emptyMessage={
          spaces.length === 0 ? "No Spaces available" : "No matching Spaces"
        }
        sections={[{ label: "Additional Spaces", items }]}
        headerContent={null}
        onClose={onClose}
        subMenuNavigation={{ label: frame.label, onBack }}
        size="wide"
        searchbar={searchbar}
        compactNav={{
          title: (
            <div className="flex min-w-0 items-baseline gap-2">
              <CompactNavTitle label="Spaces" />
              <span className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
                Agent's Spaces always included
              </span>
            </div>
          ),
        }}
      />
    );
  }
);
SpacesSubMenu.displayName = "SpacesSubMenu";

// ---------------------------------------------------------------------------
// Root dropdown (InputBarSlashSuggestionDropdown)
// ---------------------------------------------------------------------------

export interface ComposerSlashMenuProps {
  clientRect?: (() => DOMRect | null) | null;
  query: string;
  // The sub-menu entered by clicking / Enter (frames pushed by the editor).
  stackFrame: SubMenuFrame | null;
  hasConversation: boolean;
  onCommand: (item: SlashCommand) => void;
  onBack: () => void;
  onClose: () => void;
  onDetails: (item: SlashCommand) => void;
  onAttach: (selection: AttachSelection) => void;
  onPickModel: (selection: ModelSelection) => void;
  // Option B: search field at the top of the menu, bound to the text after "/".
  searchbar?: ComposerSlashSearchbar;
  // Option C: one-line "‹ title" navigation in sub-menus, and Spaces as a sub-menu.
  compactNav?: boolean;
  spacesSubMenu?: {
    spaces: ComposerSpace[];
    selectedSpaceIds: string[];
    onToggleSpace: (spaceId: string) => void;
  };
}

export interface ComposerSlashSearchbar {
  autoFocus: boolean;
  // Replaces the whole text typed after "/".
  onQueryChange: (query: string) => void;
  onKeyDown: (event: KeyboardEvent) => boolean;
  onFocus: () => void;
}

const SEARCH_PLACEHOLDERS: Record<"root" | SubMenuId, string> = {
  root: "Search commands, skills and tools",
  "attach-context": "Search knowledge and files",
  "pick-model": "Search models",
  "select-spaces": "Search Spaces",
};

export const ComposerSlashMenu = forwardRef<
  SlashCommandDropdownRef,
  ComposerSlashMenuProps
>(
  (
    {
      clientRect,
      query,
      stackFrame,
      hasConversation,
      onCommand,
      onBack,
      onClose,
      onDetails,
      onAttach,
      onPickModel,
      searchbar,
      compactNav = false,
      spacesSubMenu,
    },
    ref
  ) => {
    const dropdownRef = useRef<SlashCommandDropdownRef>(null);
    const subMenuRef = useRef<SlashCommandDropdownRef>(null);

    const allCommandItems = useMemo(
      () => getRootCommandItems({ hasConversation }),
      [hasConversation]
    );

    const queryFrame = useMemo(
      () =>
        stackFrame ? null : resolveSubMenuFromQuery(allCommandItems, query),
      [allCommandItems, query, stackFrame]
    );
    const activeFrame = stackFrame ?? queryFrame?.frame ?? null;
    const subMenuQuery = queryFrame?.query ?? query;

    // Capabilities load once per menu session.
    const isCapabilitiesLoading = useSimulatedLoading("capabilities", 400);
    const capabilityItems = useMemo(
      () => (isCapabilitiesLoading ? [] : buildCapabilityItems(query)),
      [isCapabilitiesLoading, query]
    );
    const commandItems = useMemo(
      () => filterRootCommandItems(allCommandItems, query),
      [allCommandItems, query]
    );
    const sections = useMemo(() => {
      const out: SlashCommandSection[] = [];
      if (commandItems.length > 0) {
        out.push({ label: "Commands", items: commandItems });
      }
      if (capabilityItems.length > 0) {
        out.push({
          label: SLASH_COMMAND_CAPABILITIES_SECTION_LABEL,
          items: capabilityItems,
        });
      }
      return out;
    }, [capabilityItems, commandItems]);
    const flatCount = commandItems.length + capabilityItems.length;

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (activeFrame) {
            // The command text is still in the editor: let Backspace edit it.
            if (queryFrame && event.key === "Backspace") {
              return false;
            }
            return subMenuRef.current?.onKeyDown({ event }) ?? false;
          }
          if (event.key === "Backspace" && query.trim().length === 0) {
            event.preventDefault();
            onClose();
            return true;
          }
          if (
            (event.key === "Enter" || event.key === "Tab") &&
            flatCount === 0
          ) {
            event.preventDefault();
            return true;
          }
          return dropdownRef.current?.onKeyDown({ event }) ?? false;
        },
      }),
      [activeFrame, flatCount, onClose, query, queryFrame]
    );

    // "/pick model opus" shows "opus" in the sub-menu's field; edits keep the command prefix.
    const queryPrefix = query.slice(0, query.length - subMenuQuery.length);
    const searchbarProps: SlashCommandSearchbarProps | undefined = searchbar
      ? {
          value: activeFrame ? subMenuQuery : query,
          placeholder: SEARCH_PLACEHOLDERS[activeFrame?.subMenuId ?? "root"],
          autoFocus: searchbar.autoFocus,
          onChange: (value) =>
            searchbar.onQueryChange(activeFrame ? queryPrefix + value : value),
          onKeyDown: searchbar.onKeyDown,
          onFocus: searchbar.onFocus,
        }
      : undefined;

    if (activeFrame?.subMenuId === "attach-context") {
      return (
        <AttachContextSubMenu
          ref={subMenuRef}
          clientRect={clientRect}
          frame={activeFrame}
          query={subMenuQuery}
          onBack={onBack}
          onClose={onClose}
          onSelect={onAttach}
          searchbar={searchbarProps}
          compactNav={compactNav}
        />
      );
    }

    if (activeFrame?.subMenuId === "pick-model") {
      return (
        <PickModelSubMenu
          ref={subMenuRef}
          clientRect={clientRect}
          frame={activeFrame}
          query={subMenuQuery}
          onBack={onBack}
          onClose={onClose}
          onSelect={onPickModel}
          searchbar={searchbarProps}
          compactNav={compactNav}
        />
      );
    }

    if (activeFrame?.subMenuId === "select-spaces" && spacesSubMenu) {
      return (
        <SpacesSubMenu
          ref={subMenuRef}
          clientRect={clientRect}
          frame={activeFrame}
          query={subMenuQuery}
          onBack={onBack}
          onClose={onClose}
          searchbar={searchbarProps}
          {...spacesSubMenu}
        />
      );
    }

    return (
      <SlashCommandDropdown
        ref={dropdownRef}
        sections={sections}
        command={onCommand}
        clientRect={clientRect}
        emptyMessage="No commands found"
        isLoading={isCapabilitiesLoading}
        onClose={onClose}
        onItemDetails={onDetails}
        size="wide"
        searchbar={searchbarProps}
      />
    );
  }
);
ComposerSlashMenu.displayName = "ComposerSlashMenu";
