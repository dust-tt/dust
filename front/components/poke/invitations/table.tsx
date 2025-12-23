import { useRouter } from "next/router";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { clientFetch } from "@app/lib/egress/client";
import type {
  MembershipInvitationTypeWithLink,
  WorkspaceType,
} from "@app/types";

import { makeColumnsForInvitations } from "./columns";

interface InvitationsDataTableProps {
  owner: WorkspaceType;
  invitations: MembershipInvitationTypeWithLink[];
}

export function InvitationsDataTable({
  owner,
  invitations,
}: InvitationsDataTableProps) {
  const router = useRouter();

  async function onResendInvitation(invitationId: string): Promise<void> {
    if (!window.confirm("Are you sure you want to resend this invitation?")) {
      return;
    }

    try {
      const r = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/invitations/${invitationId}`,
        {
          method: "PATCH",
        }
      );
      if (!r.ok) {
        throw new Error(`Failed to resend invitation: ${r.statusText}`);
      }
      const response = await r.json();
      window.alert("Invitation resent successfully to " + response.email + ".");
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while resending the invitation.");
    }
  }

  async function onRevokeInvitation(email: string): Promise<void> {
    if (!window.confirm(`Are you sure you want to revoke ${email}?`)) {
      return;
    }

    try {
      const r = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/invitations`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
          }),
        }
      );
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
          columns={makeColumnsForInvitations(
            onRevokeInvitation,
            onResendInvitation
          )}
          data={invitations}
          defaultFilterColumn="inviteEmail"
        />
      </div>
    </>
  );
}
