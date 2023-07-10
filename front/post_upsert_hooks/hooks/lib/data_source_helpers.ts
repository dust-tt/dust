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

  const limit = 20;
  let offset = 0;
  let totalPages: number | null = null;

  // Core API returns versions in reverse chronological order
  async function fetchNextDocumentVersionsPage() {
    if (totalPages !== null && offset >= totalPages) {
      return [];
    }
    const res = await CoreAPI.getDataSourceDocumentVersions(
      dataSource.dustAPIProjectId,
      dataSource.name,
      documentId,
      limit,
      offset
    );

    if (res.isErr()) {
      throw res.error;
    }

    offset += limit;
    totalPages = totalPages || res.value.total;
    return res.value.versions;
  }

  for (;;) {
    const versions = await fetchNextDocumentVersionsPage();

    if (versions.length === 0) {
      break;
    }

    if (!documentHash) {
      // return the penultimate version (if any)
      if (versions.length > 1) {
        return versions[1];
      }
      return null;
    }

    const indexOfHash = versions.findIndex((v) => v.hash === documentHash);

    if (indexOfHash !== -1) {
      // the reference hashis in this page
      // we need the version before the hash (i.e the array element right after the hash)

      if (versions.length > indexOfHash + 1) {
        // the previous version is in the same page
        return versions[indexOfHash + 1];
      }

      // the previous version, if any, is in the next page
      const nextVersions = await fetchNextDocumentVersionsPage();
      if (nextVersions.length > 0) {
        return nextVersions[0];
      }

      // there are no more versions
      return null;
    }
  }

  return null;
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
