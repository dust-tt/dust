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
export function matchGithubInternalIdType(internalId: string): {
  type: GithubContentNodeType;
  repoId: number;
} {
  // Full repo is selected, format = "12345678"
  if (/^\d+$/.test(internalId)) {
    return {
      type: "REPO_FULL",
      repoId: parseInt(internalId, 10),
    };
  }
  // All issues from repo are selected, format = "12345678-issues"
  if (/\d+-issues$/.test(internalId)) {
    return {
      type: "REPO_ISSUES",
      repoId: parseInt(internalId.replace(/-issues$/, ""), 10),
    };
  }
  // All discussions from repo are selected, format = "12345678-discussions"
  if (/\d+-discussions$/.test(internalId)) {
    return {
      type: "REPO_DISCUSSIONS",
      repoId: parseInt(internalId.replace(/-discussions$/, ""), 10),
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
