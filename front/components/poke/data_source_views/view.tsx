import type {
  LightWorkspaceType,
  PokeDataSourceViewType,
} from "@dust-tt/types";

import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableCellWithLink,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";

interface ViewDataSourceViewTableProps {
  dataSourceView: PokeDataSourceViewType;
  owner: LightWorkspaceType;
}

export function ViewDataSourceViewTable({
  dataSourceView,
  owner,
}: ViewDataSourceViewTableProps) {
  return (
    <div className="flex flex-col space-y-8">
      <div className="flex justify-between gap-3">
        <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-md flex-grow pb-4 font-bold">Overview:</h2>
          </div>
          <PokeTable>
            <PokeTableBody>
              <PokeTableRow>
                <PokeTableHead>Id</PokeTableHead>
                <PokeTableCellWithCopy label={dataSourceView.id.toString()} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>sId</PokeTableHead>
                <PokeTableCellWithCopy label={dataSourceView.sId} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Kind</PokeTableHead>
                <PokeTableCell>{dataSourceView.kind}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Space</PokeTableHead>
                <PokeTableCell>
                  {dataSourceView.space.name} ({dataSourceView.space.sId})
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Space Type</PokeTableHead>
                <PokeTableCell>{dataSourceView.space.kind}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Data source</PokeTableHead>
                <PokeTableCellWithLink
                  href={`/poke/${owner.sId}/data_sources/${dataSourceView.dataSource.sId}`}
                  content={`${getDisplayNameForDataSource(dataSourceView.dataSource)} (${dataSourceView.dataSource.sId})`}
                />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Created At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(dataSourceView.createdAt)}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Updated At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(dataSourceView.updatedAt)}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Edited by</PokeTableHead>
                <PokeTableCell>
                  {dataSourceView.editedByUser?.fullName ?? "N/A"}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Edited at</PokeTableHead>
                <PokeTableCell>
                  {dataSourceView.editedByUser?.editedAt
                    ? formatTimestampToFriendlyDate(
                        dataSourceView.editedByUser.editedAt
                      )
                    : "N/A"}
                </PokeTableCell>
              </PokeTableRow>
            </PokeTableBody>
          </PokeTable>
        </div>
      </div>
    </div>
  );
}
