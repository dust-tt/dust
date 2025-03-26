import {
  getCodeRootInternalId,
  getRepositoryInternalId,
  isGithubCodeDirId,
} from "@connectors/connectors/github/lib/utils";
import { GithubCodeDirectory } from "@connectors/lib/models/github";
import type { ModelId } from "@connectors/types";

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
