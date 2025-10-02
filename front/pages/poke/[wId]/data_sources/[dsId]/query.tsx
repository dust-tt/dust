import { Button, Checkbox, Chip, Spinner, TextArea } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";
import { useState } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { usePokeTables } from "@app/poke/swr";
import type { DataSourceType, WorkspaceType } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: WorkspaceType;
  dataSource: DataSourceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { dsId } = context.params || {};
  if (typeof dsId !== "string") {
    return {
      notFound: true,
    };
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId, {
    includeEditedBy: true,
  });
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      dataSource: dataSource.toJSON(),
    },
  };
});

type QueryResult = {
  schema: Array<{
    name: string;
    value_type: string;
  }>;
  results: Array<Record<string, string | number | boolean | null | undefined>>;
};

export default function DataSourceQueryPage({
  owner,
  dataSource,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [query, setQuery] = useState("");
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);

  const { tables, total: totalTables } = usePokeTables(
    owner,
    dataSource,
    1000,
    0
  );

  const handleTableToggle = (tableId: string) => {
    setSelectedTables((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(tableId)) {
        newSet.delete(tableId);
      } else {
        newSet.add(tableId);
      }
      return newSet;
    });
  };

  const handleExecuteQuery = async () => {
    if (!query.trim()) {
      setError("Please enter a query");
      return;
    }

    if (selectedTables.size === 0) {
      setError("Please select at least one table");
      return;
    }

    setIsExecuting(true);
    setError(null);
    setQueryResult(null);

    try {
      const response = await fetch(
        `/api/poke/workspaces/${owner.sId}/data_sources/${dataSource.sId}/query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query,
            tableIds: Array.from(selectedTables),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || "Failed to execute query");
      }

      const result = await response.json();
      setQueryResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <h3 className="text-xl font-bold">
        Query Data Source {dataSource.name} in workspace{" "}
        <a href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </a>
      </h3>

      <div className="mt-6 flex flex-col gap-6">
        {/* Table Selection */}
        <div className="border-material-200 rounded-lg border p-4">
          <h4 className="mb-3 text-lg font-semibold">Select Tables</h4>
          <div className="text-sm text-gray-600">
            {totalTables} table{totalTables !== 1 ? "s" : ""} available
          </div>
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
            {tables.length > 0 ? (
              tables.map((table) => (
                <div key={table.table_id} className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedTables.has(table.table_id)}
                    onCheckedChange={() => handleTableToggle(table.table_id)}
                  />
                  <span className="text-sm">{table.name}</span>
                  {table.description && (
                    <span className="text-xs text-gray-500">
                      - {table.description}
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="text-sm text-gray-500">
                No tables available for this data source
              </div>
            )}
          </div>
          {selectedTables.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-sm text-gray-600">Selected:</span>
              {Array.from(selectedTables).map((tableId) => {
                const table = tables.find((t) => t.table_id === tableId);
                return (
                  <Chip
                    key={tableId}
                    label={table?.name ?? tableId}
                    color="info"
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Query Input */}
        <div className="border-material-200 rounded-lg border p-4">
          <h4 className="mb-3 text-lg font-semibold">SQL Query</h4>
          <TextArea
            value={query}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setQuery(e.target.value)
            }
            placeholder="Enter your SQL query here...&#10;Example: SELECT * FROM table_name LIMIT 10"
            className="min-h-32 w-full font-mono text-sm"
          />
          <div className="mt-3 flex items-center gap-3">
            <Button
              variant="primary"
              onClick={handleExecuteQuery}
              disabled={isExecuting || selectedTables.size === 0}
              label={isExecuting ? "Executing..." : "Execute Query"}
              icon={isExecuting ? Spinner : undefined}
            />
            {selectedTables.size === 0 && (
              <span className="text-sm text-gray-500">
                Select at least one table to execute queries
              </span>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">Error</p>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Results Display */}
        {queryResult && (
          <div className="border-material-200 rounded-lg border p-4">
            <h4 className="mb-3 text-lg font-semibold">Results</h4>
            <div className="mb-2 text-sm text-gray-600">
              {queryResult.results.length} row
              {queryResult.results.length !== 1 ? "s" : ""} returned
            </div>
            {queryResult.results.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {queryResult.schema.map((column) => (
                        <th
                          key={column.name}
                          className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                        >
                          <div>{column.name}</div>
                          <div className="text-xs font-normal normal-case text-gray-400">
                            {column.value_type}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {queryResult.results.map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-gray-50">
                        {queryResult.schema.map((column) => (
                          <td
                            key={column.name}
                            className="whitespace-nowrap px-4 py-2 text-sm text-gray-900"
                          >
                            {row[column.name] === null
                              ? "NULL"
                              : row[column.name] === undefined
                                ? "-"
                                : String(row[column.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No results returned</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

DataSourceQueryPage.getLayout = (
  page: ReactElement,
  { owner, dataSource }: { owner: WorkspaceType; dataSource: DataSourceType }
) => {
  return (
    <PokeLayout title={`${owner.name} - Query ${dataSource.name}`}>
      {page}
    </PokeLayout>
  );
};
