import { PokeJsonBlock } from "@app/components/poke/projects/pod_functions/json_block";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { PokePodFunctionDetails } from "@app/lib/api/poke/projects";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";

interface ViewPodFunctionTableProps {
  podFunction: PokePodFunctionDetails;
}

export function ViewPodFunctionTable({
  podFunction,
}: ViewPodFunctionTableProps) {
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
                <PokeTableHead>Slug</PokeTableHead>
                <PokeTableCellWithCopy label={podFunction.slug} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>sId</PokeTableHead>
                <PokeTableCellWithCopy label={podFunction.sId} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Description</PokeTableHead>
                <PokeTableCell>{podFunction.description}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Author</PokeTableHead>
                <PokeTableCell>{podFunction.author ?? "—"}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>User identity</PokeTableHead>
                <PokeTableCell>
                  {podFunction.userIdentity ?? "optional"}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Execution mode</PokeTableHead>
                <PokeTableCell>{podFunction.executionMode}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Default stake</PokeTableHead>
                <PokeTableCell>{podFunction.defaultStake}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Bundle file</PokeTableHead>
                <PokeTableCellWithCopy label={podFunction.fileId} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Created At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(
                    new Date(podFunction.createdAt).getTime()
                  )}
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Updated At</PokeTableHead>
                <PokeTableCell>
                  {formatTimestampToFriendlyDate(
                    new Date(podFunction.updatedAt).getTime()
                  )}
                </PokeTableCell>
              </PokeTableRow>
            </PokeTableBody>
          </PokeTable>
          <div className="flex flex-col gap-2 pt-4">
            <PokeJsonBlock
              label="Input schema"
              value={podFunction.inputSchema}
            />
            <PokeJsonBlock
              label="Output schema"
              value={podFunction.outputSchema}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
