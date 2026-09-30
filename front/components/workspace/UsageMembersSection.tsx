import type { GroupType } from "@app/types/groups";
import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SearchInput,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";

interface UsageMembersSectionProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  groups: ReadonlyArray<Pick<GroupType, "sId" | "name">>;
  groupId: string | null;
  onGroupChange: (groupId: string | null) => void;
  allGroupsLabel?: string;
  extraFilters?: ReactNode;
  membersTable: ReactNode;
  selectionBanner?: ReactNode;
  requests?: {
    count: number;
    table: ReactNode;
    activeTab: "members" | "requests";
    onTabChange: (tab: "members" | "requests") => void;
  };
}

export function UsageMembersSection({
  searchTerm,
  onSearchChange,
  groups,
  groupId,
  onGroupChange,
  allGroupsLabel = "All groups",
  extraFilters,
  membersTable,
  selectionBanner,
  requests,
}: UsageMembersSectionProps) {
  const activeTab = requests?.activeTab ?? "members";
  const selectedGroupName = groups.find((group) => group.sId === groupId)?.name;

  return (
    <div className="flex flex-col items-stretch gap-4">
      <SearchInput
        placeholder="Search members"
        value={searchTerm}
        name="search"
        onChange={onSearchChange}
        className="w-full"
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-row items-center justify-between gap-2">
          {requests && (
            <ButtonsSwitchList
              size="xs"
              value={activeTab}
              onValueChange={(value: string) =>
                requests.onTabChange(
                  value === "requests" ? "requests" : "members"
                )
              }
            >
              <ButtonsSwitch value="members" label="Members" />
              <ButtonsSwitch
                value="requests"
                label="Requests"
                isCounter
                counterValue={
                  requests.count > 0 ? String(requests.count) : undefined
                }
              />
            </ButtonsSwitchList>
          )}
          <div className="flex flex-row items-center gap-2">
            {groups.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    label={selectedGroupName ?? allGroupsLabel}
                    size="sm"
                    isSelect
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    label={allGroupsLabel}
                    onClick={() => onGroupChange(null)}
                  />
                  {groups.map((group) => (
                    <DropdownMenuItem
                      key={group.sId}
                      label={group.name}
                      onClick={() => onGroupChange(group.sId)}
                    />
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {activeTab === "members" && extraFilters}
          </div>
        </div>
        {activeTab === "members" && (
          <div className="flex flex-col gap-2">
            {membersTable}
            {selectionBanner}
          </div>
        )}
        {/* Keep pending request actions alive across tab changes. */}
        <div hidden={activeTab !== "requests"}>{requests?.table}</div>
      </div>
    </div>
  );
}
