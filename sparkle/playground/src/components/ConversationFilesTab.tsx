import {
  ActionBracesIcon,
  Button,
  Clock,
  cn,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Folder,
  Grid01,
  Icon,
  List,
  SearchInput,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";

/**
 * The Files side panel — Figma 14969:31109.
 *
 * The frame's body is a pasted screenshot rather than layers, so the numbers
 * here are read off the asset at 1:1 (it was captured at the panel's own width,
 * ~490px): a 141px tile on a 12px gutter across the 448px content column, which
 * is `grid-cols-3` + `gap-3` with a 5:3 tile.
 *
 * Layout, top to bottom: a heading, a toolbar (search + view + sort), a filter
 * chip row carrying counts, then the files themselves as a grid of tiles.
 *
 * `plan.md` is a real conversation file, so it belongs in this list; opening it
 * switches to the Plan tab rather than rendering a second copy of the plan here.
 * The two folders are conversation scaffolding and are always present — the
 * frame shows them with no plan-dependent state.
 */

export const PLAN_FILE_NAME = "plan.md";

type FileKind = "folder" | "text";
type FileFilter = "All" | "Folders" | "Texts";
type SortKey = "modified" | "name";
type ViewMode = "grid" | "list";

const FILTERS: FileFilter[] = ["All", "Folders", "Texts"];

interface ConversationFile {
  name: string;
  kind: FileKind;
  /** Secondary line: an item count for folders, type + age for documents. */
  meta: string;
  icon: ComponentType;
  /** Only files that lead somewhere are clickable; the folders are inert mocks. */
  onOpen?: () => void;
}

interface ConversationFilesTabProps {
  hasPlan: boolean;
  onOpenPlan: () => void;
}

export function ConversationFilesTab({
  hasPlan,
  onOpenPlan,
}: ConversationFilesTabProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FileFilter>("All");
  const [sort, setSort] = useState<SortKey>("modified");
  const [view, setView] = useState<ViewMode>("grid");

  const files = useMemo<ConversationFile[]>(() => {
    const entries: ConversationFile[] = [
      { name: ".tool_outputs", kind: "folder", meta: "48 items", icon: Folder },
      { name: "archived_plans", kind: "folder", meta: "2 items", icon: Folder },
    ];
    if (hasPlan) {
      entries.push({
        name: PLAN_FILE_NAME,
        kind: "text",
        meta: "Document - 24s ago",
        icon: ActionBracesIcon,
        onOpen: onOpenPlan,
      });
    }
    return entries;
  }, [hasPlan, onOpenPlan]);

  const counts = useMemo(
    () => ({
      All: files.length,
      Folders: files.filter((file) => file.kind === "folder").length,
      Texts: files.filter((file) => file.kind === "text").length,
    }),
    [files]
  );

  const visibleFiles = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = files.filter((file) => {
      if (filter === "Folders" && file.kind !== "folder") {
        return false;
      }
      if (filter === "Texts" && file.kind !== "text") {
        return false;
      }
      return !needle || file.name.toLowerCase().includes(needle);
    });

    // "Last modified" is the order the conversation produced them, so the
    // default needs no sorting — only Name reorders.
    return sort === "name"
      ? [...matched].sort((a, b) => a.name.localeCompare(b.name))
      : matched;
  }, [files, filter, query, sort]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="heading-base pb-2 pt-4 text-foreground">
        Files in this conversation
      </h1>

      <div className="flex items-center gap-2">
        <SearchInput
          name="conversation-files"
          placeholder="Search files"
          value={query}
          onChange={setQuery}
          className="min-w-0 flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              icon={view === "grid" ? Grid01 : List}
              isSelect
              aria-label="View mode"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem label="Grid" onClick={() => setView("grid")} />
            <DropdownMenuItem label="List" onClick={() => setView("list")} />
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              icon={Clock}
              label={sort === "name" ? "Name" : "Last modified"}
              isSelect
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="Last modified"
              onClick={() => setSort("modified")}
            />
            <DropdownMenuItem label="Name" onClick={() => setSort("name")} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Counts come off the same list the grid renders, so a filter chip can
          never disagree with what is below it. `All` carries no count in the
          frame — it is the resting state, not a quantity worth reading. */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((name) => (
          <Button
            key={name}
            size="xs"
            variant={filter === name ? "primary" : "ghost"}
            label={name}
            isCounter={name !== "All"}
            counterValue={name === "All" ? undefined : String(counts[name])}
            onClick={() => setFilter(name)}
          />
        ))}
      </div>

      {visibleFiles.length === 0 ? (
        <div className="copy-sm text-muted-foreground">
          {query.trim()
            ? `No files match "${query.trim()}".`
            : "No files of this type in the conversation."}
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-3 gap-3">
          {visibleFiles.map((file) => (
            <FileTile key={file.name} file={file} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {visibleFiles.map((file) => (
            <FileRow key={file.name} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The `...` affordance is decorative here: nesting a real button inside the
 * card's button would be invalid, and the prototype has no per-file menu to
 * open. It appears on hover — the frame shows it on one card only, which is the
 * card the capture's cursor was over.
 */
function FileMenuAffordance() {
  return (
    <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
      <Icon
        visual={DotsHorizontal}
        size="xs"
        className="text-muted-foreground"
      />
    </span>
  );
}

function FileTile({ file }: { file: ConversationFile }) {
  return (
    <button
      type="button"
      onClick={file.onOpen}
      disabled={!file.onOpen}
      className="group flex flex-col gap-2 text-left disabled:cursor-default"
    >
      <div className="flex aspect-[5/3] items-center justify-center rounded-xl bg-muted-background transition-colors group-hover:bg-primary-200">
        {/* 28px: between sparkle's md and lg steps, and what the frame draws. */}
        <Icon
          visual={file.icon}
          size="md"
          className="h-7 w-7 text-foreground"
        />
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-1">
          <span className="heading-sm min-w-0 flex-1 truncate text-foreground">
            {file.name}
          </span>
          <FileMenuAffordance />
        </div>
        <span className="copy-xs truncate text-muted-foreground">
          {file.meta}
        </span>
      </div>
    </button>
  );
}

function FileRow({ file }: { file: ConversationFile }) {
  return (
    <button
      type="button"
      onClick={file.onOpen}
      disabled={!file.onOpen}
      className={cn(
        "group flex items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors",
        "hover:bg-muted-background disabled:cursor-default disabled:hover:bg-transparent"
      )}
    >
      <Icon
        visual={file.icon}
        size="sm"
        className="shrink-0 text-muted-foreground"
      />
      <span className="copy-sm min-w-0 flex-1 truncate text-foreground">
        {file.name}
      </span>
      <span className="copy-xs shrink-0 text-muted-foreground">
        {file.meta}
      </span>
      <FileMenuAffordance />
    </button>
  );
}
