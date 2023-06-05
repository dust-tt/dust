import { createAppAuth } from "@octokit/auth-app";
import fs from "fs-extra";
import { Octokit } from "octokit";

import logger from "@connectors/logger/logger";

const API_PAGE_SIZE = 100;

type GithubOrg = {
  id: number;
  login: string;
};

type GithubRepo = {
  id: number;
  name: string;
  private: boolean;
  url: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  description?: string | null;
  owner: GithubOrg;
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
  creator: GithubUser | null;
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

export async function getReposPage(
  installationId: string,
  page: number
): Promise<GithubRepo[]> {
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
    await octokit.request("GET /installation/repositories", {
      per_page: API_PAGE_SIZE,
      page: page,
    })
  ).data.repositories.map((r) => ({
    id: r.id,
    name: r.name,
    private: r.private,
    url: r.html_url,
    createdAt: r.created_at ? new Date(r.created_at) : null,
    updatedAt: r.updated_at ? new Date(r.updated_at) : null,
    description: r.description,
    owner: {
      id: r.owner.id,
      login: r.owner.login,
    },
  }));
}

export async function getRepoIssues(
  installationId: string,
  repoId: string,
  login: string
): Promise<GithubIssue[]> {
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

  const issues = (
    await octokit.rest.issues.listForRepo({
      owner: login,
      repo: repoId,
    })
  ).data;

  return issues.map((i) => ({
    id: i.id,
    number: i.number,
    title: i.title,
    url: i.html_url,
    creator: i.user
      ? {
          id: i.user.id,
          login: i.user.login,
        }
      : null,
    createdAt: new Date(i.created_at),
    updatedAt: new Date(i.updated_at),
    body: i.body,
  }));
}
