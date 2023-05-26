import { createAppAuth } from "@octokit/auth-app";
import fs from "fs-extra";
import { App, Octokit } from "octokit";

import logger from "@connectors/logger/logger";

type GithubRepo = {
  id: number;
  name: string;
  private: boolean;
  url: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  description?: string | null;
};

type GithubUser = {
  id: number;
  login: string;
};

type GithubIssue = {
  id: number;
  number: number;
  title: string;
  url: string;
  creator: GithubUser;
  createdAt: Date;
  updatedAt: Date;
  body?: string | null;
};

const { GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY_PATH } = process.env;

let _githubAppPrivateKeyCache: string | null = null;

export async function getGithubAppPrivateKey(): Promise<string> {
  if (_githubAppPrivateKeyCache) {
    return _githubAppPrivateKeyCache;
  }

  if (!GITHUB_APP_PRIVATE_KEY_PATH) {
    throw new Error("GITHUB_APP_PRIVATE_KEY_PATH not set");
  }

  const privateKey = await fs.readFile(GITHUB_APP_PRIVATE_KEY_PATH, "utf8");
  _githubAppPrivateKeyCache = privateKey;
  return privateKey;
}

export async function validateInstallationId(
  installationId: string
): Promise<boolean> {
  if (!GITHUB_APP_ID) {
    throw new Error("GITHUB_APP_ID not set");
  }

  const privateKey = await getGithubAppPrivateKey();

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GITHUB_APP_ID,
      privateKey: privateKey,
      installationId,
    },
  });

  try {
    await octokit.rest.apps.getAuthenticated();
  } catch (e) {
    logger.error({ error: e }, "Error validating github installation id");
    return false;
  }

  return true;
}

export async function getRepos(installationId: string): Promise<GithubRepo[]> {
  if (!GITHUB_APP_ID) {
    throw new Error("GITHUB_APP_ID not set");
  }
  const privateKey = await getGithubAppPrivateKey();

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GITHUB_APP_ID,
      privateKey: privateKey,
      installationId: installationId,
    },
  });

  return (
    await octokit.request("GET /installation/repositories")
  ).data.repositories.map((r) => ({
    id: r.id,
    name: r.name,
    private: r.private,
    url: r.html_url,
    createdAt: r.created_at ? new Date(r.created_at) : null,
    updatedAt: r.updated_at ? new Date(r.updated_at) : null,
    description: r.description,
  }));
}

export async function getRepoIssues(installationId: string, repoId: string) {
  if (!GITHUB_APP_ID) {
    throw new Error("GITHUB_APP_ID not set");
  }
  const privateKey = await getGithubAppPrivateKey();

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GITHUB_APP_ID,
      privateKey: privateKey,
      installationId: installationId,
    },
  });

  // await octokit.rest.issues.listForRepo({
  //   repo: repoId,
  // });

  const issues = (
    await octokit.request("GET /repositories/{repository_id}/issues", {
      repository_id: repoId,
    })
  ).data;

  return issues.map((i: any) => ({
    id: i.id,
    number: i.number,
    title: i.title,
    url: i.url,
  }));
}
