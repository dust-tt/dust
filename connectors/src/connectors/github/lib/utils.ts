import assert from "assert";
import { hash as blake3 } from "blake3/esm/node/hash-fn";
import { join } from "path";

export const GITHUB_CONTENT_NODE_TYPES = [
  "REPO_FULL",
  "REPO_ISSUES",
  "REPO_DISCUSSIONS",
  "REPO_CODE",
  "REPO_CODE_DIR",
  "REPO_CODE_FILE",
  "REPO_ISSUE",
  "REPO_DISCUSSION",
] as const;

export type GithubContentNodeType = (typeof GITHUB_CONTENT_NODE_TYPES)[number];

export function isGithubCodeDirId(internalId: string): boolean {
  return /^github-code-\d+-dir-[a-f0-9]+$/.test(internalId);
}

export function isGithubCodeFileId(internalId: string): boolean {
  return /^github-code-\d+-file-[a-f0-9]+$/.test(internalId);
}

/**
 * Gets the type of the GitHub content node from its internal id.
 */
export function matchGithubInternalIdType(internalId: string): {
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
  if (isGithubCodeDirId(internalId)) {
    return {
      type: "REPO_CODE_DIR",
      repoId: parseInt(
        internalId.replace(/^github-code-(\d+)-dir-.*/, "$1"),
        10
      ),
    };
  }
  // A code file is selected, format = "github-code-12345678-file-s0Up1n0u"
  if (isGithubCodeFileId(internalId)) {
    return {
      type: "REPO_CODE_FILE",
      repoId: parseInt(
        internalId.replace(/^github-code-(\d+)-file-.*/, "$1"),
        10
      ),
    };
  }
  if (/^github-issue-\d+-\d+$/.test(internalId)) {
    return {
      type: "REPO_ISSUE",
      repoId: parseInt(
        internalId.replace(/^github-issue-(\d+)-\d+$/, "$1"),
        10
      ),
    };
  }
  if (/^github-discussion-\d+-\d+$/.test(internalId)) {
    return {
      type: "REPO_DISCUSSION",
      repoId: parseInt(
        internalId.replace(/^github-discussion-(\d+)-\d+$/, "$1"),
        10
      ),
    };
  }
  throw new Error(`Invalid Github internal id: ${internalId}`);
}

export function getRepositoryInternalId(repoId: string | number): string {
  return `github-repository-${repoId}`;
}

export function getIssuesInternalId(repoId: string | number): string {
  return `github-issues-${repoId}`;
}

export function getIssueInternalId(
  repoId: string | number,
  issueNumber: number
): string {
  return `github-issue-${repoId}-${issueNumber}`;
}

export function getDiscussionsInternalId(repoId: string | number): string {
  return `github-discussions-${repoId}`;
}

export function getDiscussionInternalId(
  repoId: string | number,
  discussionNumber: number
): string {
  return `github-discussion-${repoId}-${discussionNumber}`;
}

export function getCodeRootInternalId(repoId: string | number): string {
  return `github-code-${repoId}`;
}

export function getCodeDirInternalId(
  repoId: string | number,
  codePath: string
): string {
  const p = `github-code-${repoId}-dir-${codePath}`;
  return `github-code-${repoId}-dir-${blake3(p)
    .toString("hex")
    .substring(0, 16)}`;
}

export function getCodeFileInternalId(
  repoId: string | number,
  codePath: string
): string {
  return `github-code-${repoId}-file-${blake3(
    `github-code-${repoId}-file-${codePath}`
  )
    .toString("hex")
    .substring(0, 16)}`;
}

// Must match https://docs.github.com/en/rest/apps/installations
export function getRepoUrl(repoLogin: string, repoName: string): string {
  return `https://github.com/${repoLogin}/${repoName}`;
}

export function getIssuesUrl(repoUrl: string): string {
  return `${repoUrl}/issues`;
}

export function getDiscussionsUrl(repoUrl: string): string {
  return `${repoUrl}/discussions`;
}

export function getFileUrl(
  repoLogin: string,
  repoName: string,
  branch: string,
  path: string[],
  fileName: string
): string {
  return `https://github.com/${repoLogin}/${repoName}/blob/${branch}/${join(
    path.join("/"),
    fileName
  )}`;
}

export function getDirectoryUrl(
  repoLogin: string,
  repoName: string,
  branch: string,
  path: string[],
  dirName: string
): string {
  return `https://github.com/${repoLogin}/${repoName}/tree/${branch}/${join(
    path.join("/"),
    dirName
  )}`;
}

export function getIssueLabels(
  labels: (
    | string
    | {
        id?: number;
        node_id?: string;
        url?: string;
        name?: string;
        description?: string | null;
        color?: string | null;
        default?: boolean;
      }
  )[]
): string[] {
  return labels.map((label) =>
    typeof label === "string" ? label : label.name ?? ""
  );
}

/**
 * Build parent relationships for a directory path.
 * Shared logic used by both file and directory processing.
 */
export function buildDirectoryParents(
  repoId: number,
  dirPath: string
): {
  parentInternalId: string | null;
  parents: string[];
} {
  // Build parents array.
  const pathParts = dirPath.split("/");
  const filePath = pathParts.slice(0, -1); // Parent directories.

  const parents = [];
  for (let i = filePath.length - 1; i >= 0; i--) {
    parents.push(
      getCodeDirInternalId(repoId, filePath.slice(0, i + 1).join("/"))
    );
  }

  // The parentInternalId is the immediate parent directory or null for root-level directories.
  const parentInternalId = parents[0] || null;

  return {
    parentInternalId,
    parents,
  };
}

// Helper function to infer parent relationships from GCS path.
export function inferParentsFromGcsPath({
  gcsBasePath,
  gcsPath,
  repoId,
}: {
  gcsBasePath: string;
  gcsPath: string;
  repoId: number;
}): {
  parentInternalId: string | null;
  parents: string[];
  fileName: string;
  filePath: string[];
  relativePath: string;
} {
  const relativePath = gcsPath.replace(`${gcsBasePath}/`, "");
  const pathParts = relativePath.split("/");
  const fileName = pathParts[pathParts.length - 1];
  assert(fileName, "File name is required");

  const filePath = pathParts.slice(0, -1);

  // Use shared parent logic
  const dirPath = filePath.join("/");
  const { parentInternalId, parents } = buildDirectoryParents(repoId, dirPath);

  const fileDocumentId = getCodeFileInternalId(repoId, relativePath);

  return {
    parentInternalId,
    parents: [fileDocumentId, ...parents],
    fileName,
    filePath,
    relativePath,
  };
}
