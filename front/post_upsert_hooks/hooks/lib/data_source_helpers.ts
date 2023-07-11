import { CoreAPI } from "@app/lib/core_api";
import { Diff, diffStrings } from "@app/lib/diff";
import { DataSource, Workspace } from "@app/lib/models";

export async function getPreviousDocumentVersion({
  dataSourceName,
  workspaceId,
  documentId,
  documentHash,
}: {
  dataSourceName: string;
  workspaceId: string;
  documentId: string;
  documentHash?: string | null; // if null, will get the penultimate version
}): Promise<{
  hash: string;
  created: number;
} | null> {
  const dataSource = await getDatasource(dataSourceName, workspaceId);
  const versions = await CoreAPI.getDataSourceDocumentVersions(
    dataSource.dustAPIProjectId,
    dataSource.name,
    documentId,
    2,
    0,
    documentHash
  );
  if (versions.isErr()) {
    throw versions.error;
  }
  if (versions.value.versions.length < 2) {
    return null;
  }
  return versions.value.versions[1];
}

export async function getDiffBetweenDocumentVersions({
  dataSourceName,
  workspaceId,
  documentId,
  hash1,
  hash2,
}: {
  dataSourceName: string;
  workspaceId: string;
  documentId: string;
  // if null, will diff from an empty string
  hash1?: string | null;
  // if null, will get the latest version
  hash2?: string | null;
}): Promise<Diff[]> {
  const dataSource = await getDatasource(dataSourceName, workspaceId);

  async function getDocumentText(hash?: string | null): Promise<string> {
    const res = await CoreAPI.getDataSourceDocument(
      dataSource.dustAPIProjectId,
      dataSource.name,
      documentId,
      hash
    );
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
  dataSourceName,
  workspaceId,
  documentId,
  hash,
}: {
  dataSourceName: string;
  workspaceId: string;
  documentId: string;
  hash: string;
}): Promise<Diff[]> {
  const previousVersion = await getPreviousDocumentVersion({
    dataSourceName,
    workspaceId,
    documentId,
    documentHash: hash,
  });

  // if there is no previous version, return the diff between the current version and an empty string
  const hash1 = previousVersion ? previousVersion.hash : null;

  return getDiffBetweenDocumentVersions({
    dataSourceName,
    workspaceId,
    documentId,
    hash1,
    hash2: null, // compare against the latest version
  });
}

export async function getDatasource(
  dataSourceName: string,
  workspaceId: string
): Promise<DataSource> {
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Could not find workspace with sId ${workspaceId}`);
  }
  const dataSource = await DataSource.findOne({
    where: {
      name: dataSourceName,
      workspaceId: workspace.id,
    },
  });
  if (!dataSource) {
    throw new Error(
      `Could not find data source with name ${dataSourceName} and workspaceId ${workspaceId}`
    );
  }
  return dataSource;
}
