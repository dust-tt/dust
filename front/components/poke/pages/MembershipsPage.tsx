import { InvitationsDataTable } from "@app/components/poke/invitations/table";
import { MembersDataTable } from "@app/components/poke/members/table";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { usePokeMemberships } from "@app/poke/swr/memberships";
import { LinkWrapper, Spinner } from "@dust-tt/sparkle";

export function MembershipsPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Memberships`);

  const {
    data: membershipsData,
    isLoading,
    isError,
  } = usePokeMemberships({
    owner,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !membershipsData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading memberships.</p>
      </div>
    );
  }

  const { members, pendingInvitations } = membershipsData;

  return (
    <>
      <h3 className="text-xl font-bold">
        Members of workspace{" "}
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
      </h3>
      <div className="flex-grow p-6">
        <div className="flex justify-center">
          <MembersDataTable members={members} owner={owner} />
        </div>
        <div className="flex justify-center">
          <InvitationsDataTable
            invitations={pendingInvitations}
            owner={owner}
          />
        </div>
      </div>
    </>
  );
}
