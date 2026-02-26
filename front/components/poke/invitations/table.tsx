import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { useAppRouter } from "@app/lib/platform";
import { useFetcher } from "@app/lib/swr/swr";
import type { MembershipInvitationTypeWithLink } from "@app/types/membership_invitation";
import type { WorkspaceType } from "@app/types/user";

import { makeColumnsForInvitations } from "./columns";

interface InvitationsDataTableProps {
  owner: WorkspaceType;
  invitations: MembershipInvitationTypeWithLink[];
}

export function InvitationsDataTable({
  owner,
  invitations,
}: InvitationsDataTableProps) {
  const router = useAppRouter();
  const { fetcher, fetcherWithBody } = useFetcher();

  async function onResendInvitation(invitationId: string): Promise<void> {
    if (!window.confirm("Are you sure you want to resend this invitation?")) {
      return;
    }

    try {
      const response = await fetcher(
        `/api/poke/workspaces/${owner.sId}/invitations/${invitationId}`,
        {
          method: "PATCH",
        }
      );
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
      await fetcherWithBody([
        `/api/poke/workspaces/${owner.sId}/invitations`,
        { email },
        "DELETE",
      ]);
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
