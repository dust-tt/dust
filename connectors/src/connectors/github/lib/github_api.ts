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

export type GithubUser = {
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

type GithubIssueComment = {
  id: number;
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
  const octokit = await getOctokit(installationId);

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
  const octokit = await getOctokit(installationId);

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

export async function getRepoIssuesPage(
  installationId: string,
  repoId: string,
  login: string,
  page: number
): Promise<GithubIssue[]> {
  const octokit = await getOctokit(installationId);

  const issues = (
    await octokit.rest.issues.listForRepo({
      owner: login,
      repo: repoId,
      per_page: API_PAGE_SIZE,
      page: page,
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

export async function getIssue(
  installationId: string,
  repoId: string,
  login: string,
  issueNumber: number
): Promise<GithubIssue> {
  const octokit = await getOctokit(installationId);

  const issue = (
    await octokit.rest.issues.get({
      owner: login,
      repo: repoId,
      issue_number: issueNumber,
    })
  ).data;

  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    creator: issue.user
      ? {
          id: issue.user.id,
          login: issue.user.login,
        }
      : null,
    createdAt: new Date(issue.created_at),
    updatedAt: new Date(issue.updated_at),
    body: issue.body,
  };
}

export async function getIssueCommentsPage(
  installationId: string,
  repoId: string,
  login: string,
  issueNumber: number,
  page: number
): Promise<GithubIssueComment[]> {
  const octokit = await getOctokit(installationId);

  const comments = (
    await octokit.rest.issues.listComments({
      owner: login,
      repo: repoId,
      issue_number: issueNumber,
      per_page: API_PAGE_SIZE,
      page: page,
    })
  ).data;

  return comments.map((c) => ({
    id: c.id,
    url: c.html_url,
    creator: c.user
      ? {
          id: c.user.id,
          login: c.user.login,
        }
      : null,
    createdAt: new Date(c.created_at),
    updatedAt: new Date(c.updated_at),
    body: c.body,
  }));
}

async function getOctokit(installationId: string): Promise<Octokit> {
  if (!GITHUB_APP_ID) {
    throw new Error("GITHUB_APP_ID not set");
  }
  const privateKey = await getGithubAppPrivateKey();

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GITHUB_APP_ID,
      privateKey: privateKey,
      installationId: installationId,
    },
  });
}
