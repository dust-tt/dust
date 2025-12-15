import { Octokit } from "@octokit/core";

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB max content size

export function getGitHubClient(accessToken: string) {
  return new Octokit({ auth: accessToken });
}
