import { AdminPageContainer } from "@app/components/layouts/AdminPageContainer";
import type { DefaultUserSpendLimitState } from "@app/components/workspace/EditMemberSpendLimitModal";
import { EditMemberSpendLimitModal } from "@app/components/workspace/EditMemberSpendLimitModal";
import { GroupsUsageTable } from "@app/components/workspace/GroupsUsageTable";
import { MembersUsageTable } from "@app/components/workspace/MembersUsageTable";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useGroups } from "@app/lib/swr/groups";
import { useMembersUsage } from "@app/lib/swr/memberships";
import { isCreditPricedPlan } from "@app/types/plan";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Page,
  SearchInput,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

const EMPTY_IDS = new Set<string>();
const NOOP_MEMBER_ACTION = (_member: MemberUsageType) => {};

export function GroupManagerUsagePage() {
  const owner = useWorkspace();
  const { subscription, groupUsageScope } = useAuth();
  // This component is only mounted after UsageRoute checked the scope.
  const scope = groupUsageScope!;
  const [tab, setTab] = useState<"members" | "groups">("members");
  const [searchTerm, setSearchTerm] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedMember, setSelectedMember] = useState<MemberUsageType | null>(
    null
  );
  const visibleGroupIds = useMemo(
    () => new Set(scope.readGroupIds),
    [scope.readGroupIds]
  );
  const editableGroupIds = useMemo(
    () => new Set(scope.editGroupIds),
    [scope.editGroupIds]
  );
  const { groups } = useGroups({ owner });
  const visibleGroups = useMemo(
    () => groups.filter((group) => visibleGroupIds.has(group.sId)),
    [groups, visibleGroupIds]
  );
  const editableGroupNames = useMemo(
    () =>
      new Set(
        groups
          .filter((group) => editableGroupIds.has(group.sId))
          .map((group) => group.name)
      ),
    [groups, editableGroupIds]
  );
  const canEditMember = useCallback(
    (member: MemberUsageType) =>
      member.groups.some((name) => editableGroupNames.has(name)),
    [editableGroupNames]
  );

  const sort = sorting[0];
  const {
    membersUsage,
    totalMembersUsage,
    isMembersUsageLoading,
    isMembersUsageRefreshing,
  } = useMembersUsage({
    workspaceId: owner.sId,
    searchTerm,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    orderColumn:
      sort?.id === "email" ||
      sort?.id === "seatUsage" ||
      sort?.id === "consumedFromPoolAwuCredits"
        ? sort.id
        : "name",
    orderDirection: sort?.desc ? "desc" : "asc",
    groupId: groupId ?? undefined,
  });
  const isCreditPriced = isCreditPricedPlan(subscription.plan);
  // The effective limit already includes the seat allowance. Show the
  // inherited workspace default when it is the active source, without calling
  // the workspace-only default-limit endpoint.
  const defaultUserSpendLimit: DefaultUserSpendLimitState =
    selectedMember?.spendLimitSource === "default" &&
    selectedMember.spendLimitAwuCredits !== null
      ? {
          status: "ready",
          awuCredits: Math.max(
            0,
            selectedMember.spendLimitAwuCredits -
              (selectedMember.memberUsageLimit ?? 0)
          ),
        }
      : { status: "unavailable" };

  return (
    <AdminPageContainer>
      <Page.Vertical align="stretch" gap="xl">
        <Page.Header
          title={<Page.H variant="h3">Usage</Page.H>}
          description="Manage credit limits for members and groups in your scope."
        />
        <Tabs
          value={tab}
          onValueChange={(value) =>
            setTab(value === "groups" ? "groups" : "members")
          }
          className="flex flex-col gap-4"
        >
          <TabsList>
            <TabsTrigger value="members" label="Members" />
            <TabsTrigger value="groups" label="Groups" />
          </TabsList>
          <TabsContent value="members" className="block min-h-panel">
            <div className="flex flex-col gap-4">
              <SearchInput
                placeholder="Search members"
                value={searchTerm}
                name="search"
                onChange={(value) => {
                  setSearchTerm(value);
                  setPagination((current) => ({ ...current, pageIndex: 0 }));
                }}
                className="w-full"
              />
              <div className="flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      label={
                        visibleGroups.find((group) => group.sId === groupId)
                          ?.name ?? "All managed groups"
                      }
                      size="sm"
                      isSelect
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      label="All managed groups"
                      onClick={() => {
                        setGroupId(null);
                        setPagination((current) => ({
                          ...current,
                          pageIndex: 0,
                        }));
                      }}
                    />
                    {visibleGroups.map((group) => (
                      <DropdownMenuItem
                        key={group.sId}
                        label={group.name}
                        onClick={() => {
                          setGroupId(group.sId);
                          setPagination((current) => ({
                            ...current,
                            pageIndex: 0,
                          }));
                        }}
                      />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <MembersUsageTable
                members={membersUsage}
                isLoading={isMembersUsageLoading}
                isRefreshing={isMembersUsageRefreshing}
                totalAllowedUsagePendingMemberIds={EMPTY_IDS}
                seatChangePendingMemberIds={EMPTY_IDS}
                isSeatBased={false}
                showSpendLimit={isCreditPriced}
                canEditSpendLimit={canEditMember}
                showSeatAndCredits={isCreditPriced}
                showSeatActions={false}
                showGroupsColumn={visibleGroups.length > 0}
                onChangeSeat={NOOP_MEMBER_ACTION}
                onRemoveSeat={NOOP_MEMBER_ACTION}
                onEditSpendLimit={setSelectedMember}
                onOpenSpendLimitRecap={setSelectedMember}
                pagination={pagination}
                setPagination={setPagination}
                totalRowCount={totalMembersUsage}
                sorting={sorting}
                setSorting={(next) => {
                  setSorting(next);
                  setPagination((current) => ({
                    ...current,
                    pageIndex: 0,
                  }));
                }}
              />
            </div>
          </TabsContent>
          <TabsContent value="groups" className="block min-h-panel">
            <GroupsUsageTable
              owner={owner}
              visibleGroupIds={visibleGroupIds}
              editableGroupIds={editableGroupIds}
              showSpendLimitColumn={isCreditPriced}
            />
          </TabsContent>
        </Tabs>
        <EditMemberSpendLimitModal
          isOpen={selectedMember !== null}
          onClose={() => setSelectedMember(null)}
          member={selectedMember}
          owner={owner}
          groups={groups}
          editableGroupIds={editableGroupIds}
          readOnly={selectedMember ? !canEditMember(selectedMember) : true}
          canEditDefaultLimit={false}
          defaultUserSpendLimit={defaultUserSpendLimit}
        />
      </Page.Vertical>
    </AdminPageContainer>
  );
}
