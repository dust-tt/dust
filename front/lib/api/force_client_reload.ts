import { runOnRedis } from "@app/lib/api/redis";
import logger from "@app/logger/logger";
import { Octokit } from "@octokit/core";

const REDIS_KEY = "force_reload_commits";
const CACHE_REFRESH_INTERVAL_MS = 60_000; // 60 seconds.

let cachedCommits: Set<string> = new Set();
let lastRefreshMs = 0;

async function refreshCache(): Promise<void> {
  const now = Date.now();
  if (now - lastRefreshMs < CACHE_REFRESH_INTERVAL_MS) {
    return;
  }

  cachedCommits = new Set(await getFlaggedCommits());
  lastRefreshMs = now;
}

export async function shouldForceClientReload(
  commitHash: string
): Promise<boolean> {
  await refreshCache();

  return cachedCommits.has(commitHash);
}

export async function getFlaggedCommits(): Promise<string[]> {
  return runOnRedis({ origin: "force_reload_commits" }, (client) =>
    client.sMembers(REDIS_KEY)
  );
}

export async function addFlaggedCommits(commits: string[]): Promise<void> {
  if (commits.length === 0) {
    return;
  }
  await runOnRedis({ origin: "force_reload_commits" }, (client) =>
    client.sAdd(REDIS_KEY, commits)
  );
}

export async function removeFlaggedCommits(commits: string[]): Promise<void> {
  if (commits.length === 0) {
    return;
  }
  await runOnRedis({ origin: "force_reload_commits" }, (client) =>
    client.sRem(REDIS_KEY, commits)
  );
}

/**
 * Retrieve the most recent deploy tags from GitHub, which indicate which commits have been
 * deployed to production.
 */

const github = new Octokit();

// Fetch deploy tags from GitHub (created by deploy-spa-production workflow).
// Cross-reference with recent commits to build labels with dates and titles.
export async function getDeployedTags(): Promise<
  { shortHash: string; title: string; date: string }[]
> {
  try {
    // 1. Get all spa/app/* tags. These are the actually-deployed commits.
    const { data: refs } = await github.request(
      "GET /repos/{owner}/{repo}/git/matching-refs/{ref}",
      { owner: "dust-tt", repo: "dust", ref: "tags/spa/app/" }
    );
    const deployedShas = new Set(
      refs.map((r) => r.ref.replace("refs/tags/spa/app/", ""))
    );

    // 2. Fetch recent commits to get dates and messages for deployed SHAs.
    const tags: { shortHash: string; title: string; date: string }[] = [];
    const { data: commits } = await github.request(
      "GET /repos/{owner}/{repo}/commits",
      { owner: "dust-tt", repo: "dust", sha: "main", per_page: 100 }
    );
    for (const commit of commits) {
      const shortHash = commit.sha.substring(0, 7);
      if (deployedShas.has(shortHash)) {
        tags.push({
          shortHash,
          title: (commit.commit.message ?? "").split("\n")[0].substring(0, 80),
          date: (commit.commit.committer?.date ?? "").substring(0, 10),
        });
        deployedShas.delete(shortHash);
      }
    }

    // Include deployed tags whose commits are older than the recent 100.
    for (const shortHash of deployedShas) {
      tags.push({ shortHash, title: "", date: "" });
    }

    return tags;
  } catch (err) {
    logger.error({ err }, "Failed to fetch deploy tags from GitHub");
    return [];
  }
}
