import type { ModelId } from "@dust-tt/types";

import {
  getCodeRootInternalId,
  getRepositoryInternalId,
  isGithubCodeDirId,
} from "@connectors/connectors/github/lib/utils";
import {
  GithubCodeDirectory,
  GithubCodeFile,
} from "@connectors/lib/models/github";

export async function getGithubCodeDirectoryParentIds(
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

  if (isGithubCodeDirId(directory.parentInternalId)) {
    // Pull the directory.
    const parents = await getGithubCodeDirectoryParentIds(
      connectorId,
      directory.parentInternalId,
      repoId
    );
    return [directory.parentInternalId, ...parents];
  } else if (directory.parentInternalId === getCodeRootInternalId(repoId)) {
    return [directory.parentInternalId, getRepositoryInternalId(repoId)];
  }
  return [];
}

export async function getGithubCodeFileParentIds(
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

  if (isGithubCodeDirId(file.parentInternalId)) {
    // Pull the directory.
    const parents = await getGithubCodeDirectoryParentIds(
      connectorId,
      file.parentInternalId,
      repoId
    );
    return [file.parentInternalId, ...parents];
  } else if (file.parentInternalId === getCodeRootInternalId(repoId)) {
    return [file.parentInternalId, getRepositoryInternalId(repoId)];
  }
  return [];
}
