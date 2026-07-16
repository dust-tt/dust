import { AllowedModelsMembersTable } from "@app/components/workspace/AllowedModelsMembersTable";
import { GroupsUsageTable } from "@app/components/workspace/GroupsUsageTable";
import { ModelTiersSettingsCard } from "@app/components/workspace/usage/ModelTiersSettingsCard";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import type { MemberUsageType } from "@app/lib/api/credits/members_usage";
import type { UserModelTierSelection } from "@app/lib/client/model_tier_options";
import { INHERIT_MODEL_TIER } from "@app/lib/client/model_tier_options";
import { expandMaxTierName } from "@app/lib/client/model_tiers";
import { DEFAULT_MAX_MODEL_TIER } from "@app/lib/model_tiers/tier_order";
import { useGroups } from "@app/lib/swr/groups";
import { useMembersUsage } from "@app/lib/swr/memberships";
import {
  useGroupAllowedModelTiers,
  useUserAllowedModelTierMutations,
  useUserAllowedModelTiers,
  useWorkspaceAllowedModelTiers,
} from "@app/lib/swr/model_tiers";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dust-tt/sparkle";
import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 25;

interface AllowedModelsSectionProps {
  owner: LightWorkspaceType;
  readOnly?: boolean;
}

export function AllowedModelsSection({
  owner,
  readOnly = false,
}: AllowedModelsSectionProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const {
    membersUsage,
    isMembersUsageLoading,
    isMembersUsageRefreshing,
    totalMembersUsage,
  } = useMembersUsage({
    workspaceId: owner.sId,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
  });

  const { groups } = useGroups({
    owner,
    kinds: [...CAP_ELIGIBLE_GROUP_KINDS],
  });

  const { users: userAllowedModelTiers } = useUserAllowedModelTiers({ owner });
  const { groups: groupAllowedModelTiers } = useGroupAllowedModelTiers({
    owner,
  });
  const { maxTierName: workspaceMaxTierName } = useWorkspaceAllowedModelTiers({
    owner,
  });

  const workspaceAllowedModelTiers = useMemo(
    () => expandMaxTierName(workspaceMaxTierName ?? DEFAULT_MAX_MODEL_TIER),
    [workspaceMaxTierName]
  );
  const userModelTierSelectionByUserId = useMemo(() => {
    const map: Record<string, UserModelTierSelection> = {};
    for (const entry of userAllowedModelTiers) {
      map[entry.userId] = entry.maxTierName;
    }
    return map;
  }, [userAllowedModelTiers]);
  const userAllowedModelTiersByUserId = useMemo(() => {
    const map: Record<string, ModelsTierName[]> = {};
    for (const entry of userAllowedModelTiers) {
      map[entry.userId] = expandMaxTierName(entry.maxTierName);
    }
    return map;
  }, [userAllowedModelTiers]);
  const groupModelTiersByGroupId = useMemo(() => {
    const map: Record<string, ModelsTierName[]> = {};
    for (const entry of groupAllowedModelTiers) {
      map[entry.groupId] = expandMaxTierName(entry.maxTierName);
    }
    return map;
  }, [groupAllowedModelTiers]);
  const groupNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      map.set(group.name, group.sId);
    }
    return map;
  }, [groups]);

  const { setUserAllowedModelTier, clearUserAllowedModelTier } =
    useUserAllowedModelTierMutations({ owner });
  const handleSetUserModelTier = useCallback(
    (member: MemberUsageType, selection: UserModelTierSelection) => {
      if (selection === INHERIT_MODEL_TIER) {
        void clearUserAllowedModelTier({ userId: member.sId });
        return;
      }

      void setUserAllowedModelTier({
        userId: member.sId,
        tierName: selection,
      });
    },
    [clearUserAllowedModelTier, setUserAllowedModelTier]
  );

  return (
    <div className="flex flex-col gap-4">
      <span className="heading-base text-foreground dark:text-foreground-night">
        Allowed models
      </span>
      <Tabs defaultValue="members">
        <TabsList className="mb-4">
          <TabsTrigger value="members" label="Members" />
          <TabsTrigger value="groups" label="Groups" />
          <TabsTrigger value="settings" label="Workspace settings" />
        </TabsList>

        <TabsContent value="members">
          <AllowedModelsMembersTable
            members={membersUsage}
            isLoading={isMembersUsageLoading}
            isRefreshing={isMembersUsageRefreshing}
            readOnly={readOnly}
            userModelTierSelectionByUserId={userModelTierSelectionByUserId}
            userAllowedModelTiersByUserId={userAllowedModelTiersByUserId}
            groupModelTiersByGroupId={groupModelTiersByGroupId}
            workspaceAllowedModelTiers={workspaceAllowedModelTiers}
            groupNameToId={groupNameToId}
            onSetUserModelTier={handleSetUserModelTier}
            pagination={pagination}
            setPagination={setPagination}
            totalRowCount={totalMembersUsage}
          />
        </TabsContent>

        <TabsContent value="groups">
          <GroupsUsageTable
            owner={owner}
            readOnly={readOnly}
            showModelTiersColumn
            showSpendLimitColumn={false}
          />
        </TabsContent>

        <TabsContent value="settings">
          <ModelTiersSettingsCard
            owner={owner}
            readOnly={readOnly}
            showHeader={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
