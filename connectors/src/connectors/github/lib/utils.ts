import { hash as blake3 } from "blake3/esm/node/hash-fn";

export const GITHUB_CONTENT_NODE_TYPES = [
  "REPO_FULL",
  "REPO_ISSUES",
  "REPO_DISCUSSIONS",
  "REPO_CODE",
  "REPO_CODE_DIR",
  "REPO_CODE_FILE",
] as const;
export type GithubContentNodeType = (typeof GITHUB_CONTENT_NODE_TYPES)[number];

/**
 * Gets the type of the Github content node from its internal id.
 */
export function matchGithubNodeIdType(internalId: string): {
  type: GithubContentNodeType;
  repoId: number;
} {
  // Full repo is selected, format = "github-repository-12345678"
  if (/^github-repository-\d+$/.test(internalId)) {
    return {
      type: "REPO_FULL",
      repoId: parseInt(internalId.replace(/^github-repository-/, ""), 10),
    };
  }
  // All issues from repo are selected, format = "github-issues-12345678"
  if (/^github-issues-\d+$/.test(internalId)) {
    return {
      type: "REPO_ISSUES",
      repoId: parseInt(internalId.replace(/^github-issues-/, ""), 10),
    };
  }
  // All discussions from repo are selected, format = "github-discussions-12345678"
  if (/^github-discussions-\d+$/.test(internalId)) {
    return {
      type: "REPO_DISCUSSIONS",
      repoId: parseInt(internalId.replace(/^github-discussions-/, ""), 10),
    };
  }
  // All code from repo is selected, format = "github-code-12345678"
  if (/^github-code-\d+$/.test(internalId)) {
    return {
      type: "REPO_CODE",
      repoId: parseInt(internalId.replace(/^github-code-/, ""), 10),
    };
  }
  // A code directory is selected, format = "github-code-12345678-dir-s0Up1n0u"
  if (/^github-code-\d+-dir-[a-f0-9]+$/.test(internalId)) {
    return {
      type: "REPO_CODE_DIR",
      repoId: parseInt(
        internalId.replace(/^github-code-(\d+)-dir-.*/, "$1"),
        10
      ),
    };
  }
  // A code file is selected, format = "github-code-12345678-file-s0Up1n0u"
  if (/^github-code-\d+-file-[a-f0-9]+$/.test(internalId)) {
    return {
      type: "REPO_CODE_FILE",
      repoId: parseInt(
        internalId.replace(/^github-code-(\d+)-file-.*/, "$1"),
        10
      ),
    };
  }
  throw new Error(`Invalid Github internal id: ${internalId}`);
}

export function getRepositoryNodeId(repoId: string | number): string {
  return `github-repository-${repoId}`;
}

export function getIssuesNodeId(repoId: string | number): string {
  return `github-issues-${repoId}`;
}

export function getIssueNodeId(
  repoId: string | number,
  issueNumber: number
): string {
  return `github-issue-${repoId}-${issueNumber}`;
}

export function getDiscussionsNodeId(repoId: string | number): string {
  return `github-discussions-${repoId}`;
}

export function getDiscussionNodeId(
  repoId: string | number,
  discussionNumber: number
): string {
  return `github-discussion-${repoId}-${discussionNumber}`;
}

export function getCodeRootNodeId(repoId: string | number): string {
  return `github-code-${repoId}`;
}

export function getCodeDirNodeId(
  repoId: string | number,
  codePath: string
): string {
  const p = `github-code-${repoId}-dir-${codePath}`;
  return `github-code-${repoId}-dir-${blake3(p)
    .toString("hex")
    .substring(0, 16)}`;
}

export function getCodeFileNodeId(
  repoId: string | number,
  codePath: string
): string {
  return `github-code-${repoId}-file-${blake3(
    `github-code-${repoId}-file-${codePath}`
  )
    .toString("hex")
    .substring(0, 16)}`;
}
