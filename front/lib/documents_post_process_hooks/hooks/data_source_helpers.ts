import type { Diff, WorkspaceType } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { diffStrings } from "@app/lib/diff";
import { DataSource } from "@app/lib/models/data_source";
import { Workspace } from "@app/lib/models/workspace";
import logger from "@app/logger/logger";

export async function getPreviousDocumentVersion({
  owner,
  dataSourceName,
  documentId,
  documentHash,
}: {
  owner: WorkspaceType;
  dataSourceName: string;
  documentId: string;
  documentHash?: string | null; // if null, will get the penultimate version
}): Promise<{
  hash: string;
  created: number;
} | null> {
  const dataSource = await getDatasource(owner, dataSourceName);
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const versions = await coreAPI.getDataSourceDocumentVersions({
    projectId: dataSource.dustAPIProjectId,
    dataSourceName: dataSource.name,
    documentId: documentId,
    limit: 1,
    offset: 1,
    latest_hash: documentHash,
  });
  if (versions.isErr()) {
    throw versions.error;
  }
  if (versions.value.versions.length === 0) {
    return null;
  }
  return versions.value.versions[0];
}

export async function getDiffBetweenDocumentVersions({
  owner,
  dataSourceName,
  documentId,
  hash1,
  hash2,
}: {
  owner: WorkspaceType;
  dataSourceName: string;
  documentId: string;
  // if null, will diff from an empty string
  hash1?: string | null;
  // if null, will get the latest version
  hash2?: string | null;
}): Promise<Diff[]> {
  const dataSource = await getDatasource(owner, dataSourceName);

  async function getDocumentText(hash?: string | null): Promise<string> {
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const res = await coreAPI.getDataSourceDocument({
      projectId: dataSource.dustAPIProjectId,
      dataSourceName: dataSource.name,
      documentId: documentId,
      versionHash: hash,
    });
    if (res.isErr()) {
      throw res.error;
    }
    return res.value.document.text || "";
  }

  const [text1, text2] = await Promise.all([
    hash1 ? getDocumentText(hash1) : Promise.resolve(""),
    getDocumentText(hash2),
  ]);

  return diffStrings(text1, text2);
}

// returns the diff between tthe version right before the provided hash
// and the current version of the document
export async function getDocumentDiff({
  owner,
  dataSourceName,
  documentId,
  hash,
}: {
  owner: WorkspaceType;
  dataSourceName: string;
  documentId: string;
  hash: string;
}): Promise<Diff[]> {
  const previousVersion = await getPreviousDocumentVersion({
    owner,
    dataSourceName,
    documentId,
    documentHash: hash,
  });

  // if there is no previous version, return the diff between the current version and an empty string
  const hash1 = previousVersion ? previousVersion.hash : null;

  return getDiffBetweenDocumentVersions({
    owner,
    dataSourceName,
    documentId,
    hash1,
    hash2: null, // compare against the latest version
  });
}

export async function getDatasource(
  owner: WorkspaceType,
  dataSourceName: string
): Promise<DataSource> {
  const workspace = await Workspace.findOne({
    where: {
      sId: owner.sId,
    },
  });
  if (!workspace) {
    throw new Error(`Could not find workspace ${owner.sId}`);
  }
  const dataSource = await DataSource.findOne({
    where: {
      name: dataSourceName,
      workspaceId: workspace.id,
    },
  });
  if (!dataSource) {
    throw new Error(
      `Could not find data source with name ${dataSourceName} and workspace ${owner.sId}`
    );
  }
  return dataSource;
}
