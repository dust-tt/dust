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
const SPACE_IDS_FOR_KNOWLEDGE = mockSpaces.slice(0, 12).map((space) => space.id);

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

export interface KnowledgeTreeGroup {
  id: string;
  pathLabel: string;
  files: KnowledgeTreeNode[];
}

export interface FilteredTreeGroupsResult {
  groups: KnowledgeTreeGroup[];
  matchCount: number;
}

function pruneToMatches(
  treeNode: KnowledgeTreeNode,
  isMatch: (node: KnowledgeTreeNode) => boolean
): KnowledgeTreeNode | null {
  if (treeNode.kind === "file") {
    return isMatch(treeNode) ? treeNode : null;
  }
  const prunedChildren = treeNode.children
    .map((child) => pruneToMatches(child, isMatch))
    .filter((child): child is KnowledgeTreeNode => child !== null);
  return prunedChildren.length > 0 ? { ...treeNode, children: prunedChildren } : null;
}

// Every matching file is grouped under its exact immediate folder, labeled
// with its *full* path from the space root ("New Onboarding / Reports /
// Drafts") — however many levels that is. Two files sharing a parent always
// land under the same breadcrumb, one above the other. Unlike VS Code's
// "compact folders", a folder is never given its own row unless it directly
// holds a match — a branching ancestor with no files of its own just
// contributes its label to its descendants' breadcrumbs instead of an
// empty header.
function collectPathGroups(
  treeNode: KnowledgeTreeNode,
  pathLabels: string[],
  output: KnowledgeTreeGroup[],
  groupIndexByPath: Map<string, number>
) {
  const files = treeNode.children.filter((child) => child.kind === "file");
  if (files.length > 0) {
    const pathLabel = pathLabels.join(" / ");
    let index = groupIndexByPath.get(pathLabel);
    if (index === undefined) {
      index = output.length;
      output.push({ id: treeNode.id, pathLabel, files: [] });
      groupIndexByPath.set(pathLabel, index);
    }
    output[index].files.push(...files);
  }

  const childFolders = treeNode.children.filter((child) => child.kind !== "file");
  for (const childFolder of childFolders) {
    collectPathGroups(
      childFolder,
      [...pathLabels, childFolder.label],
      output,
      groupIndexByPath
    );
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
    const prunedSpace = pruneToMatches(space, isMatch);
    if (prunedSpace) {
      collectPathGroups(prunedSpace, [prunedSpace.label], groups, groupIndexByPath);
    }
  }

  const matchCount = groups.reduce((sum, group) => sum + group.files.length, 0);
  return { groups, matchCount };
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
