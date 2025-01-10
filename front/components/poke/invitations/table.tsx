import type { MembershipInvitationType, WorkspaceType } from "@dust-tt/types";
import { useRouter } from "next/router";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";

import { makeColumnsForInvitations } from "./columns";

interface InvitationsDataTableProps {
  owner: WorkspaceType;
  invitations: MembershipInvitationType[];
}

export function InvitationsDataTable({
  owner,
  invitations,
}: InvitationsDataTableProps) {
  const router = useRouter();
  async function onRevokeInvitation(email: string): Promise<void> {
    if (!window.confirm(`Are you sure you want to revoke ${email}?`)) {
      return;
    }

    try {
      const r = await fetch(`/api/poke/workspaces/${owner.sId}/invitations`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
        }),
      });
      if (!r.ok) {
        throw new Error(`Failed to revoke invitation: ${r.statusText}`);
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while revoking the invitation.");
    }
  }

  return (
    <>
      <div className="border-material-200 my-4 flex w-full flex-col rounded-lg border p-4">
        <div className="flex justify-between gap-3">
          <h2 className="text-md mb-4 font-bold">Pending Invitations:</h2>
        </div>
        <PokeDataTable
          columns={makeColumnsForInvitations(onRevokeInvitation)}
          data={invitations}
          defaultFilterColumn="inviteEmail"
        />
      </div>
    </>
  );
}
