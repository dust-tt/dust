import { getPokeGroupKindChipColor } from "@app/components/poke/groups/columns";
import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { GroupType } from "@app/types/groups";
import { Chip } from "@dust-tt/sparkle";

export function ViewGroupTable({ group }: { group: GroupType }) {
  return (
    <div className="flex flex-col space-y-8">
      <div className="flex justify-between gap-3">
        <div className="border-material-200 my-4 flex flex-grow flex-col rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-md flex-grow pb-4 font-bold">Group Details:</h2>
          </div>
          <PokeTable>
            <PokeTableBody>
              <PokeTableRow>
                <PokeTableCell>Id</PokeTableCell>
                <PokeTableCellWithCopy label={group.id.toString()} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableCell>sId</PokeTableCell>
                <PokeTableCellWithCopy label={group.sId} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableCell>Name</PokeTableCell>
                <PokeTableCell>{group.name}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableCell>Kind</PokeTableCell>
                <PokeTableCell>
                  <Chip color={getPokeGroupKindChipColor(group.kind)}>
                    {group.kind}
                  </Chip>
                </PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableCell>Member Count</PokeTableCell>
                <PokeTableCell>{group.memberCount}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableCell>Workspace Id</PokeTableCell>
                <PokeTableCellWithCopy label={group.workspaceId.toString()} />
              </PokeTableRow>
            </PokeTableBody>
          </PokeTable>
        </div>
      </div>
    </div>
  );
}
