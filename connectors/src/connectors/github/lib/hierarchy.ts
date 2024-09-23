import type { ModelId } from "@dust-tt/types";

import {
  GithubCodeDirectory,
  GithubCodeFile,
} from "@connectors/lib/models/github";

export async function getGithubCodeOrDirectoryParentIds(
  connectorId: ModelId,
  internalId: string,
  repoId: number
): Promise<string[]> {
  if (internalId.startsWith(`github-code-${repoId}-dir`)) {
    return getGithubCodeDirectoryParentIds(connectorId, internalId, repoId);
  }
  if (internalId.startsWith(`github-code-${repoId}-file`)) {
    return getGithubCodeFileParentIds(connectorId, internalId, repoId);
  }
  return [];
}

async function getGithubCodeDirectoryParentIds(
  connectorId: ModelId,
  internalId: string,
  repoId: number
): Promise<string[]> {
  const directory = await GithubCodeDirectory.findOne({
    where: {
      connectorId,
      internalId,
    },
  });

  if (!directory) {
    return [];
  }

  if (directory.parentInternalId.startsWith(`github-code-${repoId}-dir`)) {
    // Pull the directory.
    const parents = await getGithubCodeDirectoryParentIds(
      connectorId,
      directory.parentInternalId,
      repoId
    );
    return [directory.parentInternalId, ...parents];
  } else if (directory.parentInternalId === `github-code-${repoId}`) {
    return [`github-code-${repoId}`, `${repoId}`];
  }
  return [];
}

async function getGithubCodeFileParentIds(
  connectorId: ModelId,
  internalId: string,
  repoId: number
): Promise<string[]> {
  const file = await GithubCodeFile.findOne({
    where: {
      connectorId,
      documentId: internalId,
    },
  });

  if (!file) {
    return [];
  }

  if (file.parentInternalId.startsWith(`github-code-${repoId}-dir`)) {
    // Pull the directory.
    const parents = await getGithubCodeDirectoryParentIds(
      connectorId,
      file.parentInternalId,
      repoId
    );
    return [file.parentInternalId, ...parents];
  } else if (file.parentInternalId === `github-code-${repoId}`) {
    return [`${repoId}`, `github-code-${repoId}`];
  }
  return [];
}
