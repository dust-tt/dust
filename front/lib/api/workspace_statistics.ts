import { computeDataSourceStatistics } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { fileSizeToHumanReadable } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type HumanReadableStats<Stats> = Omit<Stats, "text_size"> & {
  text_size: string;
};

interface DataSourceStatistics {
  name: string;
  text_size: number;
  document_count: number;
}

interface DataSourceError {
  name: string;
  error: string;
}

interface WorkspaceStats {
  dataSources: DataSourceStatistics[];
  notFoundDataSources?: DataSourceError[];
  document_count: number;
  text_size: number;
}

type HumanReadableWorkspaceStats = Omit<
  HumanReadableStats<WorkspaceStats>,
  "dataSources"
> & {
  dataSources: HumanReadableStats<DataSourceStatistics>[];
};

export async function computeWorkspaceStatistics(
  auth: Authenticator
): Promise<Result<HumanReadableWorkspaceStats, Error>> {
  const dataSources = await DataSourceResource.listByWorkspace(auth, {
    includeDeleted: true,
  });

  const results = await computeDataSourceStatistics(dataSources);

  if (results.isErr()) {
    return new Err(
      new Error("Error computing statistics.", {
        cause: results.error.message,
      })
    );
  }

  const stats = results.value.data_sources.reduce<WorkspaceStats>(
    (acc, data_source) => {
      const { name, text_size, document_count } = data_source;

      return {
        text_size: acc.text_size + text_size,
        document_count: acc.document_count + document_count,
        dataSources: [
          ...acc.dataSources,
          {
            name,
            text_size,
            document_count,
          },
        ],
      };
    },
    { text_size: 0, document_count: 0, dataSources: [] }
  );

  // Show the largest data sources first.
  stats.dataSources.sort(
    (dataSourceA, dataSourceB) => dataSourceB.text_size - dataSourceA.text_size
  );

  return new Ok({
    text_size: fileSizeToHumanReadable(stats.text_size, 2),
    document_count: stats.document_count,
    dataSources: stats.dataSources.map((dataSource) => ({
      ...dataSource,
      text_size: fileSizeToHumanReadable(dataSource.text_size, 2),
    })),
  });
}
