import { GroupSelectionTable } from "@app/components/groups/GroupSelectionTable";
import type { SearchMemberType } from "@app/components/members/MemberSelectionTable";
import { MemberSelectionTable } from "@app/components/members/MemberSelectionTable";
import type { GroupType } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import { useState } from "react";

interface RestrictedAccessBodyProps {
  owner: LightWorkspaceType;
  selectedMemberIds: Set<string>;
  selectedGroups: GroupType[];
  onMemberIdsUpdated: (memberIds: Set<string>) => void;
  onGroupsUpdated: (groups: GroupType[]) => void;
  initialMembers?: SearchMemberType[];
}

export function RestrictedAccessBody({
  owner,
  selectedMemberIds,
  selectedGroups,
  onMemberIdsUpdated,
  onGroupsUpdated,
  initialMembers,
}: RestrictedAccessBodyProps) {
  const [activeTab, setActiveTab] = useState("members");

  // Members and groups are not exclusive: the space's members are the ones picked here plus the
  // members of the groups picked in the other tab. The tabs only decide which one is on screen —
  // saving always sends both.
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="members" label="Members" />
        <TabsTrigger value="groups" label="Groups" />
      </TabsList>
      <TabsContent value="members">
        <MemberSelectionTable
          owner={owner}
          selectedMemberIds={selectedMemberIds}
          onSelectionChange={onMemberIdsUpdated}
          initialMembers={initialMembers}
        />
      </TabsContent>
      <TabsContent value="groups">
        <GroupSelectionTable
          owner={owner}
          selectedGroupIds={new Set(selectedGroups.map((g) => g.sId))}
          onSelectionChange={(_ids, groups) => onGroupsUpdated(groups)}
        />
      </TabsContent>
    </Tabs>
  );
}
