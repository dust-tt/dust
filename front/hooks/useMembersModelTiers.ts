import {
  getUserModelTierMenuItemsWithSelection,
  INHERIT_MODEL_TIER,
  toUserModelTierSelection,
} from "@app/lib/client/model_tier_options";
import {
  expandMaxTierName,
  formatUserModelTierInheritLabel,
  resolveModelTiersForUser,
} from "@app/lib/client/model_tiers";
import type { ResolvedAllowedModelTiers } from "@app/lib/model_tiers/resolve_allowed";
import { DEFAULT_MAX_MODEL_TIER } from "@app/lib/model_tiers/tier_order";
import { useGroups } from "@app/lib/swr/groups";
import {
  useGroupAllowedModelTiers,
  useUserAllowedModelTierMutations,
  useUserAllowedModelTiers,
  useWorkspaceAllowedModelTiers,
} from "@app/lib/swr/model_tiers";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { LightWorkspaceType } from "@app/types/user";
import type { MenuItem } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";

// Resolves the effective model tier of workspace members (user override, then
// groups, then workspace) and builds the "Models tier" row menu. Callers pass
// each member's cap-eligible group names, as returned by the members endpoints.
export function useMembersModelTiers({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled: boolean;
}) {
  const { groups } = useGroups({
    owner,
    kinds: CAP_ELIGIBLE_GROUP_KINDS,
    disabled,
  });
  const { users: userAllowedModelTiers } = useUserAllowedModelTiers({
    owner,
    disabled,
  });
  const { groups: groupAllowedModelTiers } = useGroupAllowedModelTiers({
    owner,
    disabled,
  });
  const { maxTierName: workspaceMaxTierName } = useWorkspaceAllowedModelTiers({
    owner,
    disabled,
  });
  const { setUserAllowedModelTier, clearUserAllowedModelTier } =
    useUserAllowedModelTierMutations({ owner });

  const workspaceAllowedTierNames = useMemo(
    () => expandMaxTierName(workspaceMaxTierName ?? DEFAULT_MAX_MODEL_TIER),
    [workspaceMaxTierName]
  );
  const userMaxTierNameByUserId = useMemo(() => {
    const map: Record<string, ModelsTierName> = {};
    for (const entry of userAllowedModelTiers) {
      map[entry.userId] = entry.maxTierName;
    }
    return map;
  }, [userAllowedModelTiers]);
  const userAllowedTierNamesByUserId = useMemo(() => {
    const map: Record<string, ModelsTierName[]> = {};
    for (const entry of userAllowedModelTiers) {
      map[entry.userId] = expandMaxTierName(entry.maxTierName);
    }
    return map;
  }, [userAllowedModelTiers]);
  const groupTierNamesByGroupId = useMemo(() => {
    const map: Record<string, ModelsTierName[]> = {};
    for (const entry of groupAllowedModelTiers) {
      map[entry.groupId] = expandMaxTierName(entry.maxTierName);
    }
    return map;
  }, [groupAllowedModelTiers]);
  const groupNameToId = useMemo(
    () => new Map(groups.map((group) => [group.name, group.sId])),
    [groups]
  );

  const getResolvedModelTiers = useCallback(
    (userId: string, groupNames: string[]): ResolvedAllowedModelTiers =>
      resolveModelTiersForUser({
        userId,
        groupNames,
        groupNameToId,
        userAllowedTierNamesByUserId,
        groupTierNamesByGroupId,
        workspaceAllowedTierNames,
      }),
    [
      groupNameToId,
      userAllowedTierNamesByUserId,
      groupTierNamesByGroupId,
      workspaceAllowedTierNames,
    ]
  );

  const getModelTierMenuItem = useCallback(
    (userId: string, groupNames: string[]): MenuItem => ({
      kind: "submenu",
      label: "Models tier",
      selectionMode: "checkbox",
      items: getUserModelTierMenuItemsWithSelection({
        selectedValue: userMaxTierNameByUserId[userId] ?? INHERIT_MODEL_TIER,
        inheritLabel: formatUserModelTierInheritLabel({
          groupNames,
          groupNameToId,
          groupTierNamesByGroupId,
          workspaceAllowedTierNames,
        }),
      }).map((tierItem) => ({
        id: tierItem.id,
        name: tierItem.name,
        description: tierItem.description,
        checked: tierItem.checked,
      })),
      onSelect: (itemId: string) => {
        const selection = toUserModelTierSelection(itemId);
        if (selection === INHERIT_MODEL_TIER) {
          void clearUserAllowedModelTier({ userId });
          return;
        }
        void setUserAllowedModelTier({ userId, tierName: selection });
      },
    }),
    [
      userMaxTierNameByUserId,
      groupNameToId,
      groupTierNamesByGroupId,
      workspaceAllowedTierNames,
      clearUserAllowedModelTier,
      setUserAllowedModelTier,
    ]
  );

  return { getResolvedModelTiers, getModelTierMenuItem };
}
