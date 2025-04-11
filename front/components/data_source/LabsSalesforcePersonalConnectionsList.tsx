import {
  Button,
  CloudArrowLeftRightIcon,
  DataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { CellContext } from "@tanstack/react-table";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import type { SalesforceDataSourceWithPersonalConnection } from "@app/lib/swr/labs";
import {
  useLabsCreateSalesforcePersonalConnection,
  useLabsDeleteSalesforcePersonalConnection,
  useLabsSalesforceDataSourcesWithPersonalConnection,
} from "@app/lib/swr/labs";
import type { WorkspaceType } from "@app/types";

type RowData = {
  dataSource: SalesforceDataSourceWithPersonalConnection;
  onClick: () => void;
};

type PersonalConnectionsListProps = {
  owner: WorkspaceType;
};

export const LabsSalesforcePersonalConnectionsList = ({
  owner,
}: PersonalConnectionsListProps) => {
  const { isDark } = useTheme();
  const { dataSources, isLoading } =
    useLabsSalesforceDataSourcesWithPersonalConnection({
      owner,
    });
  const { createPersonalConnection } =
    useLabsCreateSalesforcePersonalConnection(owner);
  const { deletePersonalConnection } =
    useLabsDeleteSalesforcePersonalConnection(owner);

  const columns = [
    {
      id: "name",
      header: "Name",
      accessorFn: (row: RowData) => row.dataSource.name,
      cell: (info: CellContext<RowData, string>) => (
        <DataTable.CellContent
          icon={getConnectorProviderLogoWithFallback({
            provider: info.row.original.dataSource.connectorProvider,
            isDark,
          })}
        >
          <span>{info.getValue()}</span>
        </DataTable.CellContent>
      ),
    },
    {
      id: "actions",
      accessorKey: "dataSource",
      header: "",
      cell: (
        info: CellContext<RowData, SalesforceDataSourceWithPersonalConnection>
      ) => {
        const dataSource = info.getValue();
        const isConnected = dataSource.personalConnection !== null;

        return (
          <DataTable.CellContent>
            <div key={dataSource.sId}>
              {!isConnected && (
                <Button
                  label={`Connect`}
                  variant="outline"
                  className="flex-grow"
                  size="sm"
                  icon={CloudArrowLeftRightIcon}
                  onClick={async () => {
                    await createPersonalConnection(dataSource);
                  }}
                />
              )}
              {isConnected && (
                <Button
                  label="Disconnect"
                  variant="outline"
                  size="sm"
                  icon={CloudArrowLeftRightIcon}
                  onClick={async () => {
                    await deletePersonalConnection(dataSource);
                  }}
                />
              )}
            </div>
          </DataTable.CellContent>
        );
      },
      meta: {
        className: "w-56",
      },
    },
  ];
  const rows: RowData[] = dataSources.map((dataSource) => {
    return {
      dataSource,
      onClick: () => {},
    };
  });

  return (
    <div>
      {isLoading && (
        <div className="absolute mt-16 flex justify-center">
          <Spinner />
        </div>
      )}
      {rows.length > 0 && (
        <DataTable data={rows} columns={columns} className="pb-4" />
      )}
    </div>
  );
};
