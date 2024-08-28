import type { WorkspaceType } from "@dust-tt/types";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { useWorkspaceInvitations } from "@app/lib/swr";

import { makeColumnsForInvitations } from "./columns";

interface InvitationsDataTableProps {
  owner: WorkspaceType;
}

export function InvitationsDataTable({ owner }: InvitationsDataTableProps) {
  const { invitations } = useWorkspaceInvitations(owner);

  return (
    <>
      <div className="border-material-200 my-4 flex w-full flex-col rounded-lg border p-4">
        <div className="flex justify-between gap-3">
          <h2 className="text-md mb-4 font-bold">Invitations:</h2>
        </div>
        <PokeDataTable
          columns={makeColumnsForInvitations()}
          data={invitations}
          defaultFilterColumn="inviteEmail"
        />
      </div>
    </>
  );
}
