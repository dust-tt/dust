import type { DataSource } from "./types";
import { isPinnableToSidebar, isPodFolder } from "./fileMoves";

// What the sidebar keeps, in the order the user put it there. Pods, files,
// folders and agents share one list, so the order is the only thing that
// separates them and a drop has to name a position.

/** A Pod being dragged from one place in the sidebar to another. */
export const SIDEBAR_ENTRY_DRAG_MIME = "application/x-dust-sidebar-entry";

export type SidebarEntry =
  | { kind: "pod"; spaceId: string }
  /** A file, a folder, a skill or a tool: anything the Hub lists as a file. */
  | { kind: "file"; fileId: string }
  | { kind: "agent"; agentId: string };

/** Identifies an entry across renders, and travels in the drag. */
export function entryKey(entry: SidebarEntry): string {
  switch (entry.kind) {
    case "pod":
      return `pod:${entry.spaceId}`;
    case "file":
      return `file:${entry.fileId}`;
    case "agent":
      return `agent:${entry.agentId}`;
  }
}

export function parseEntryKey(key: string): SidebarEntry | null {
  const separator = key.indexOf(":");
  const id = key.slice(separator + 1);
  if (separator === -1 || id === "") {
    return null;
  }
  switch (key.slice(0, separator)) {
    case "pod":
      return { kind: "pod", spaceId: id };
    case "file":
      return { kind: "file", fileId: id };
    case "agent":
      return { kind: "agent", agentId: id };
    default:
      return null;
  }
}

export function hasEntryDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(SIDEBAR_ENTRY_DRAG_MIME);
}

export function readEntryDragKey(dataTransfer: DataTransfer): string | null {
  return dataTransfer.getData(SIDEBAR_ENTRY_DRAG_MIME) || null;
}

/**
 * The entry a Hub item becomes. A Pod folder stands for its Pod and an agent
 * file for its agent, so dragging either in keeps the thing rather than the
 * file that points at it.
 */
export function entryForDataSource(item: DataSource): SidebarEntry | null {
  if (isPodFolder(item)) {
    return item.refId ? { kind: "pod", spaceId: item.refId } : null;
  }
  if (item.fileType === "agent" && item.refId) {
    return { kind: "agent", agentId: item.refId };
  }
  return isPinnableToSidebar(item) ? { kind: "file", fileId: item.id } : null;
}

export function hasEntry(
  entries: SidebarEntry[],
  entry: SidebarEntry
): boolean {
  const key = entryKey(entry);
  return entries.some((candidate) => entryKey(candidate) === key);
}

export function removeEntry(
  entries: SidebarEntry[],
  entry: SidebarEntry
): SidebarEntry[] {
  const key = entryKey(entry);
  return entries.filter((candidate) => entryKey(candidate) !== key);
}

/**
 * Puts an entry at `index`, counted on the list as the user sees it. An entry
 * already in the list is moved rather than duplicated, which is what makes
 * dropping something new and reordering the same operation.
 */
export function insertEntryAt(
  entries: SidebarEntry[],
  entry: SidebarEntry,
  index: number
): SidebarEntry[] {
  const key = entryKey(entry);
  const from = entries.findIndex((candidate) => entryKey(candidate) === key);
  const rest = from === -1 ? [...entries] : removeEntry(entries, entry);
  // Removing the entry first shifts everything after it up by one, so a drop
  // below its old place has to come back down by one to land where it looked.
  const at = from !== -1 && index > from ? index - 1 : index;
  rest.splice(Math.max(0, Math.min(at, rest.length)), 0, entry);
  return rest;
}
