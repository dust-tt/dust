import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { PokeSpaceType } from "@app/types";

interface ViewSpaceTableProps {
  space: PokeSpaceType;
}

export function ViewSpaceViewTable({ space }: ViewSpaceTableProps) {
  return (
    <div className="flex flex-col space-y-8">
      <div className="flex justify-between gap-3">
        <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-md flex-grow pb-4 font-bold">Overview</h2>
          </div>
          <PokeTable>
            <PokeTableBody>
              <PokeTableRow>
                <PokeTableHead>Space ID</PokeTableHead>
                <PokeTableCellWithCopy label={`${space.id}`} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>sId</PokeTableHead>
                <PokeTableCellWithCopy label={space.sId} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Name</PokeTableHead>
                <PokeTableCell>{space.name}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Kind</PokeTableHead>
                <PokeTableCell>{space.kind}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Space Type</PokeTableHead>
                <PokeTableCell>{space.kind}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Is Restricted</PokeTableHead>
                <PokeTableCell>
                  {space.kind === "regular"
                    ? space.isRestricted
                      ? "Yes"
                      : "No"
                    : "N/A"}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Created At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(space.createdAt)}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Updated At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(space.updatedAt)}
                </PokeTableCell>
              </PokeTableRow>
            </PokeTableBody>
          </PokeTable>
        </div>
      </div>
    </div>
  );
}
