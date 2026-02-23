import { ViewGroupTable } from "@app/components/poke/groups/view";
import { MembersDataTable } from "@app/components/poke/members/table";
import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeGroupDetails } from "@app/poke/swr/group_details";
import { LinkWrapper, Spinner } from "@dust-tt/sparkle";

export function GroupPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Group`);

  const groupId = useRequiredPathParam("groupId");
  const {
    data: groupDetails,
    isLoading,
    isError,
  } = usePokeGroupDetails({
    owner,
    groupId,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !groupDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading group details.</p>
      </div>
    );
  }

  const { members, group } = groupDetails;

  return (
    <>
      <h3 className="text-xl font-bold">
        Group {group.name} ({group.kind}) within workspace{" "}
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
      </h3>
      <div className="flex flex-row gap-x-6">
        <ViewGroupTable group={group} />
        <MembersDataTable members={members} owner={owner} readonly />
      </div>
    </>
  );
}
