import { PokeJsonBlock } from "@app/components/poke/sandbox_functions/json_block";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { PokeFrameFunctionDetails } from "@app/lib/api/poke/frames";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";

interface ViewFrameFunctionTableProps {
  frameFunction: PokeFrameFunctionDetails;
}

export function ViewFrameFunctionTable({
  frameFunction,
}: ViewFrameFunctionTableProps) {
  return (
    <div className="flex flex-col space-y-8">
      <div className="flex justify-between gap-3">
        <div className="my-4 flex flex-grow flex-col rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-md flex-grow pb-4 font-bold">Overview</h2>
          </div>
          <PokeTable>
            <PokeTableBody>
              <PokeTableRow>
                <PokeTableHead>Slug</PokeTableHead>
                <PokeTableCellWithCopy label={frameFunction.slug} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>sId</PokeTableHead>
                <PokeTableCellWithCopy label={frameFunction.sId} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Description</PokeTableHead>
                <PokeTableCell>{frameFunction.description}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>User identity</PokeTableHead>
                <PokeTableCell>
                  {frameFunction.userIdentity ?? "optional"}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Execution mode</PokeTableHead>
                <PokeTableCell>{frameFunction.executionMode}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Default stake</PokeTableHead>
                <PokeTableCell>{frameFunction.defaultStake}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Publication</PokeTableHead>
                <PokeTableCell>
                  {frameFunction.publicationId ?? "unpublished"}
                  {frameFunction.publicationId &&
                    !frameFunction.isActivePublication &&
                    " (superseded)"}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Bundle sha256</PokeTableHead>
                {frameFunction.bundleSha256 ? (
                  <PokeTableCellWithCopy label={frameFunction.bundleSha256} />
                ) : (
                  <PokeTableCell>—</PokeTableCell>
                )}
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Created At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(
                    new Date(frameFunction.createdAt).getTime()
                  )}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Updated At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(
                    new Date(frameFunction.updatedAt).getTime()
                  )}
                </PokeTableCell>
              </PokeTableRow>
            </PokeTableBody>
          </PokeTable>
          <div className="flex flex-col gap-2 pt-4">
            <PokeJsonBlock
              label="Input schema"
              value={frameFunction.inputSchema}
            />
            <PokeJsonBlock
              label="Output schema"
              value={frameFunction.outputSchema}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
