import { computeDataSourceStatistics } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types";
import { Err, maxFileSizeToHumanReadable, Ok, removeNulls } from "@app/types";

const DATA_SOURCE_STATISTICS_CONCURRENCY = 10;

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
  auth: Authenticator,
  { ignoreErrors = false }: { ignoreErrors?: boolean } = {}
): Promise<Result<HumanReadableWorkspaceStats, Error>> {
  const dataSources = await DataSourceResource.listByWorkspace(auth, {
    includeDeleted: true,
  });

  const results = await concurrentExecutor(
    dataSources,
    async (dataSource) => computeDataSourceStatistics(dataSource),
    { concurrency: DATA_SOURCE_STATISTICS_CONCURRENCY }
  );

  const hasError = results.some((r) => r.isErr());
  if (hasError && !ignoreErrors) {
    return new Err(
      new Error("Error computing statistics.", {
        cause: removeNulls(
          results.map((r) => (r.isErr() ? r.error.message : null))
        ),
      })
    );
  }

  const stats = results.reduce<WorkspaceStats>(
    (acc, r) => {
      if (r.isErr()) {
        return {
          ...acc,
          notFoundDataSources: [
            ...(acc.notFoundDataSources ?? []),
            {
              name: r.error.code,
              error: r.error.message,
            },
          ],
        };
      }

      const { name, text_size, document_count } = r.value.data_source;

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
    text_size: maxFileSizeToHumanReadable(stats.text_size, 2),
    document_count: stats.document_count,
    dataSources: stats.dataSources.map((dataSource) => ({
      ...dataSource,
      text_size: maxFileSizeToHumanReadable(dataSource.text_size, 2),
    })),
  });
}
