import { Planet } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import {
  getDataSourceIcon,
  getDataSourcesBySpaceId,
  sortDataSourcesForDisplay,
} from "./dataSources";
import { mockSpaces } from "./spaces";
import type { DataSource, DataSourceFileType } from "./types";

// A node in the browsable knowledge tree: every file/folder generated for a
// space, tagged with where it lives.
export interface KnowledgeNode extends DataSource {
  spaceId: string;
  spaceName: string;
}

// An attached knowledge source — a file or folder the user has picked,
// rendered as a chip in the composer.
export interface KnowledgeItem {
  id: string;
  name: string;
  spaceName: string;
  icon?: ComponentType<{ className?: string }>;
  lastUsedAt: Date;
  usageCount: number;
  source: DataSource["source"];
}

// More spaces than a real workspace's "recently used" would ever surface —
// deliberately enough content that browsing into a space/folder feels like a
// real knowledge base, not a 4-item demo.
const SPACE_IDS_FOR_KNOWLEDGE = mockSpaces
  .slice(0, 30)
  .map((space) => space.id);

function buildKnowledgeTree(): KnowledgeNode[] {
  const nodes: KnowledgeNode[] = [];

  for (const spaceId of SPACE_IDS_FOR_KNOWLEDGE) {
    const space = mockSpaces.find((candidate) => candidate.id === spaceId);
    if (!space) {
      continue;
    }

    for (const item of getDataSourcesBySpaceId(spaceId)) {
      nodes.push({ ...item, spaceId, spaceName: space.name });
    }
  }

  return nodes;
}

export const mockKnowledgeTree: KnowledgeNode[] = buildKnowledgeTree();

// --- Browsing tree -----------------------------------------------------
//
// A persistent, collapsible tree (spaces at the root, real folders below)
// that the user can expand by hand, or that a query prunes down to just the
// branches containing a match — auto-expanded, like a fuzzy file finder.

export type KnowledgeTreeNodeKind = "space" | "folder" | "file";

export interface KnowledgeTreeNode {
  id: string; // "space:<spaceId>" for a space root, the real node id otherwise
  kind: KnowledgeTreeNodeKind;
  label: string;
  spaceName: string;
  icon?: ComponentType<{ className?: string }>;
  fileType?: DataSourceFileType;
  lastUsedAt?: Date;
  children: KnowledgeTreeNode[];
}

const SPACE_CRUMB_PREFIX = "space:";

function buildForest(): KnowledgeTreeNode[] {
  function buildChildren(
    spaceNodes: KnowledgeNode[],
    parentId: string | null
  ): KnowledgeTreeNode[] {
    return sortDataSourcesForDisplay(
      spaceNodes.filter((node) => node.parentId === parentId)
    ).map((node) => ({
      id: node.id,
      kind: node.kind,
      label: node.fileName,
      spaceName: node.spaceName,
      icon: getDataSourceIcon(node),
      fileType: node.fileType,
      lastUsedAt: node.updatedAt,
      children:
        node.kind === "folder" ? buildChildren(spaceNodes, node.id) : [],
    }));
  }

  return SPACE_IDS_FOR_KNOWLEDGE.map((spaceId) => {
    const space = mockSpaces.find((candidate) => candidate.id === spaceId);
    const spaceNodes = mockKnowledgeTree.filter(
      (node) => node.spaceId === spaceId
    );
    return {
      id: `${SPACE_CRUMB_PREFIX}${spaceId}`,
      kind: "space" as const,
      label: space?.name ?? spaceId,
      spaceName: space?.name ?? spaceId,
      icon: Planet,
      children: buildChildren(spaceNodes, null),
    };
  });
}

export const mockKnowledgeForest: KnowledgeTreeNode[] = buildForest();

// The listing for one level of the browse tree: a space's top-level
// contents, or a folder's contents. `node: null` means the root — the space
// list itself.
export function getBrowseChildren({
  node,
  excludeIds,
}: {
  node: KnowledgeTreeNode | null;
  excludeIds: Set<string>;
}): KnowledgeTreeNode[] {
  const children = node ? node.children : mockKnowledgeForest;
  return children.filter((child) => !excludeIds.has(child.id));
}

// The ancestor chain from the space root down to (and including) the given
// node — this is exactly what a browse-mode breadcrumb stack looks like, so
// jumping into a folder found via search can reuse it as the new stack
// rather than needing its own bespoke navigation state.
export function findNodePath(nodeId: string): KnowledgeTreeNode[] | null {
  function search(
    node: KnowledgeTreeNode,
    path: KnowledgeTreeNode[]
  ): KnowledgeTreeNode[] | null {
    const nextPath = [...path, node];
    if (node.id === nodeId) {
      return nextPath;
    }
    for (const child of node.children) {
      const found = search(child, nextPath);
      if (found) {
        return found;
      }
    }
    return null;
  }

  for (const space of mockKnowledgeForest) {
    const found = search(space, []);
    if (found) {
      return found;
    }
  }
  return null;
}

export interface KnowledgeTreeGroup {
  id: string;
  pathLabel: string;
  // Usually files, but a matched folder can be a hit too — grouped under
  // its parent's path like any other match.
  files: KnowledgeTreeNode[];
}

export interface FilteredTreeGroupsResult {
  groups: KnowledgeTreeGroup[];
  // The true total, even when `groups` was truncated to MAX_SEARCH_RESULTS
  // — the panel needs it to show "N more, refine your search".
  matchCount: number;
}

// A broad query against a large workspace could otherwise render hundreds
// of DOM rows into a fixed-height scroll area — cap what's rendered, but
// keep reporting the real `matchCount` so the UI can say how much was cut.
const MAX_SEARCH_RESULTS = 100;

function addToGroup(
  pathLabels: string[],
  node: KnowledgeTreeNode,
  output: KnowledgeTreeGroup[],
  groupIndexByPath: Map<string, number>
) {
  const pathLabel = pathLabels.join(" / ");
  let index = groupIndexByPath.get(pathLabel);
  if (index === undefined) {
    index = output.length;
    output.push({ id: pathLabel, pathLabel, files: [] });
    groupIndexByPath.set(pathLabel, index);
  }
  output[index].files.push(node);
}

// A match can be a file OR a folder that matches by name — searching
// "Team Weeklies" should surface that folder itself, not just files that
// happen to contain the word. Either way the hit is grouped under its
// *parent's* path (where it lives), same as a file would be: a folder is
// never grouped under its own name. Recursion continues into every folder
// regardless of whether the folder itself matched, so a file nested inside
// a matching folder still shows up as its own, separate hit.
function collectMatches(
  treeNode: KnowledgeTreeNode,
  parentPathLabels: string[],
  output: KnowledgeTreeGroup[],
  groupIndexByPath: Map<string, number>,
  isMatch: (node: KnowledgeTreeNode) => boolean
) {
  if (treeNode.kind === "file") {
    if (isMatch(treeNode)) {
      addToGroup(parentPathLabels, treeNode, output, groupIndexByPath);
    }
    return;
  }

  if (treeNode.kind === "folder" && isMatch(treeNode)) {
    addToGroup(parentPathLabels, treeNode, output, groupIndexByPath);
  }

  const childPathLabels = [...parentPathLabels, treeNode.label];
  for (const child of treeNode.children) {
    collectMatches(child, childPathLabels, output, groupIndexByPath, isMatch);
  }
}

export function getFilteredTreeGroups({
  query,
  excludeIds,
}: {
  query: string;
  excludeIds: Set<string>;
}): FilteredTreeGroupsResult {
  const trimmedQuery = query.trim().toLowerCase();

  function isMatch(treeNode: KnowledgeTreeNode): boolean {
    if (excludeIds.has(treeNode.id)) {
      return false;
    }
    return !trimmedQuery || treeNode.label.toLowerCase().includes(trimmedQuery);
  }

  const groups: KnowledgeTreeGroup[] = [];
  const groupIndexByPath = new Map<string, number>();
  for (const space of mockKnowledgeForest) {
    collectMatches(space, [], groups, groupIndexByPath, isMatch);
  }

  const matchCount = groups.reduce((sum, group) => sum + group.files.length, 0);

  let remaining = MAX_SEARCH_RESULTS;
  const truncatedGroups: KnowledgeTreeGroup[] = [];
  for (const group of groups) {
    if (remaining <= 0) {
      break;
    }
    const files = group.files.slice(0, remaining);
    remaining -= files.length;
    truncatedGroups.push({ ...group, files });
  }

  return { groups: truncatedGroups, matchCount };
}

export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return "Updated today";
  }
  if (diffDays === 1) {
    return "Updated yesterday";
  }
  if (diffDays < 30) {
    return `Updated ${diffDays}d ago`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `Updated ${diffMonths}mo ago`;
  }
  return `Updated ${Math.floor(diffMonths / 12)}y ago`;
}

export function splitByMatch(
  text: string,
  query: string
): Array<{ text: string; matched: boolean }> {
  if (!query.trim()) {
    return [{ text, matched: false }];
  }

  const index = text.toLowerCase().indexOf(query.trim().toLowerCase());
  if (index === -1) {
    return [{ text, matched: false }];
  }

  const end = index + query.trim().length;
  const parts: Array<{ text: string; matched: boolean }> = [];
  if (index > 0) {
    parts.push({ text: text.slice(0, index), matched: false });
  }
  parts.push({ text: text.slice(index, end), matched: true });
  if (end < text.length) {
    parts.push({ text: text.slice(end), matched: false });
  }
  return parts;
}
