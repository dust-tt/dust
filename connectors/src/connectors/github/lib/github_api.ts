import { createAppAuth } from "@octokit/auth-app";
import fs from "fs-extra";
import { Octokit } from "octokit";

import logger from "@connectors/logger/logger";

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
