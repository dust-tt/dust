// Git diff utilities for cache validation
// Used to determine if feature branch has diverged from main in specific areas

// Check if a path has changes between main and current HEAD
// Uses git diff --quiet which exits 0 for no changes, 1 for changes
async function hasChanges(repoRoot: string, path: string): Promise<boolean> {
  const proc = Bun.spawn(["git", "diff", "--quiet", "main...HEAD", "--", path], {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  // exit code 0 = no changes, 1 = changes
  return proc.exitCode !== 0;
}

// Check if core/ directory has changes between main and current HEAD
// This indicates whether cached Rust binaries can be used
export async function hasRustChanges(repoRoot: string): Promise<boolean> {
  return hasChanges(repoRoot, "core/");
}

// Check if package-lock.json changed for a project between main and current HEAD
// Projects: "sdks/js", "front", "connectors"
export async function hasLockfileChanges(repoRoot: string, project: string): Promise<boolean> {
  return hasChanges(repoRoot, `${project}/package-lock.json`);
}

// Result of comparing feature branch to main for cache purposes
export interface CacheComparisonResult {
  rust: { canUseCache: boolean; reason: string };
  sdks: { canUseCache: boolean; reason: string };
  front: { canUseCache: boolean; reason: string };
  connectors: { canUseCache: boolean; reason: string };
}

// Compare current branch to main and determine what can use cache
export async function compareBranchToMain(repoRoot: string): Promise<CacheComparisonResult> {
  const [rustChanged, sdksChanged, frontChanged, connectorsChanged] = await Promise.all([
    hasRustChanges(repoRoot),
    hasLockfileChanges(repoRoot, "sdks/js"),
    hasLockfileChanges(repoRoot, "front"),
    hasLockfileChanges(repoRoot, "connectors"),
  ]);

  return {
    rust: {
      canUseCache: !rustChanged,
      reason: rustChanged ? "core/ changed" : "core/ unchanged",
    },
    sdks: {
      canUseCache: !sdksChanged,
      reason: sdksChanged ? "lockfile changed" : "lockfile unchanged",
    },
    front: {
      canUseCache: !frontChanged,
      reason: frontChanged ? "lockfile changed" : "lockfile unchanged",
    },
    connectors: {
      canUseCache: !connectorsChanged,
      reason: connectorsChanged ? "lockfile changed" : "lockfile unchanged",
    },
  };
}
