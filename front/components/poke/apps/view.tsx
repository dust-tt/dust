import {
  PokeTable,
  PokeTableBody,
  PokeTableCell,
  PokeTableCellWithCopy,
  PokeTableCellWithLink,
  PokeTableHead,
  PokeTableRow,
} from "@app/components/poke/shadcn/ui/table";
import type { AppType, LightWorkspaceType } from "@app/types";

export function ViewAppTable({
  app,
  owner,
}: {
  app: AppType;
  owner: LightWorkspaceType;
}) {
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
                <PokeTableHead>Id</PokeTableHead>
                <PokeTableCellWithCopy label={app.id.toString()} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>sId</PokeTableHead>
                <PokeTableCellWithCopy label={app.sId} />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Space</PokeTableHead>
                <PokeTableCellWithLink
                  href={`/poke/${owner.sId}/spaces/${app.space.sId}`}
                  content={`${app.space.name} (${app.space.sId})`}
                />
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Name</PokeTableHead>
                <PokeTableCell>{app.name}</PokeTableCell>
              </PokeTableRow>
              <PokeTableRow>
                <PokeTableHead>Description</PokeTableHead>
                <PokeTableCell>{app.description}</PokeTableCell>
              </PokeTableRow>
            </PokeTableBody>
          </PokeTable>
        </div>
      </div>
    </div>
  );
}
