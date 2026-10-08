import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import type { GetWorkspaceGrantedRolesResponseBody } from "@app/lib/api/workspace";
import { clientFetch } from "@app/lib/egress/client";
import { compareStrings, formatNumber } from "@app/lib/i18n/format";
import type { BulkSeatChangePreviewBody } from "@app/lib/swr/memberships";
import {
  BulkSeatChangePreviewResponseSchema,
  invalidateMembersUsage,
} from "@app/lib/swr/memberships";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { workspaceAuthContextUrl } from "@app/lib/swr/workspaces";
import type { GetGroupsResponseBody } from "@app/types/api/groups";
import type {
  GetGroupResponseBody,
  GetMemberGroupsResponseBody,
  PatchGroupBody,
  PatchGroupResponseBody,
  PostGroupResponseBody,
  PostMemberGroupResponseBody,
  PutGroupGrantedRoleResponseBody,
  PutGroupGrantedSeatTypeResponseBody,
} from "@app/types/api/groups/manage";
import type { PutGroupSpendLimitResponseBody } from "@app/types/api/groups/spend_limit";
import type {
  GroupGrantableRole,
  GroupGrantableSeatType,
  GroupKind,
} from "@app/types/groups";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import type { LightUserType, LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo, useState } from "react";
import type { Fetcher } from "swr";
import { mutate } from "swr";
import { z } from "zod";

export function useGroups({
  owner,
  kinds,
  withMembers,
  withManagers,
  managedOnly,
  disabled,
}: {
  owner: LightWorkspaceType;
  kinds?: readonly GroupKind[];
  // Also resolves each group's member sIds (one extra batched query
  // server-side) instead of just its memberCount.
  withMembers?: boolean;
  withManagers?: boolean;
  managedOnly?: boolean;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (kinds && kinds.length > 0) {
      kinds.forEach((k) => params.append("kind", k));
    }
    if (withMembers) {
      params.append("withMembers", "true");
    }
    if (withManagers) {
      params.append("withManagers", "true");
    }
    if (managedOnly) {
      params.append("managedOnly", "true");
    }
    const queryString = params.toString();
    return `/api/w/${owner.sId}/groups${queryString ? `?${queryString}` : ""}`;
  }, [owner.sId, kinds, withMembers, withManagers, managedOnly]);

  const groupsFetcher: Fetcher<GetGroupsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(url, groupsFetcher, {
    disabled,
  });

  const groups = useMemo(
    () =>
      data
        ? [...data.groups].sort((a, b) => compareStrings(a.name, b.name))
        : [],
    [data]
  );

  return {
    groups,
    isGroupsLoading: !error && !data && !disabled,
    isGroupsError: !!error,
    mutateGroups: mutate,
  };
}

// Workspace roles (admin/manager) that are granted by at least one group, i.e.
// (partly) managed through group membership. Used to restrict manual role
// editing in the members UI.
function grantedRolesUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/granted-roles`;
}

export function useWorkspaceGrantedRoles({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const grantedRolesFetcher: Fetcher<GetWorkspaceGrantedRolesResponseBody> =
    fetcher;

  const { data, error } = useSWRWithDefaults(
    grantedRolesUrl(workspaceId),
    grantedRolesFetcher,
    { disabled }
  );

  return {
    grantedRoles: data?.grantedRoles ?? emptyArray<GroupGrantableRole>(),
    isGrantedRolesLoading: !error && !data && !disabled,
    isGrantedRolesError: error,
  };
}

// Base seat types (workspace/pro/max) granted by at least one group in the
// workspace, i.e. (partly) managed through group membership. Used to restrict
// manual seat editing in the members UI.
function grantedSeatTypesUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/granted-seat-types`;
}

export function useGroup({
  owner,
  groupId,
  disabled,
}: {
  owner: LightWorkspaceType;
  groupId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const groupFetcher: Fetcher<GetGroupResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/groups/${groupId}`,
    groupFetcher,
    {
      disabled: disabled || !groupId,
    }
  );

  return {
    group: data?.group ?? null,
    members: data ? data.members : emptyArray<LightUserType>(),
    managers: data ? data.managers : emptyArray<LightUserType>(),
    isGroupLoading: !error && !data && !disabled && !!groupId,
    isGroupError: !!error,
    mutateGroup: mutate,
  };
}

function memberGroupsUrl(workspaceId: string, userId: string): string {
  return `/api/w/${workspaceId}/members/${userId}/groups`;
}

/**
 * Groups (provisioned and manually-managed) a given workspace member belongs to.
 */
export function useMemberGroups({
  owner,
  userId,
  disabled,
}: {
  owner: LightWorkspaceType;
  userId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const memberGroupsFetcher: Fetcher<GetMemberGroupsResponseBody> = fetcher;

  const isDisabled = disabled || !userId;

  const { data, error, mutate } = useSWRWithDefaults(
    memberGroupsUrl(owner.sId, userId ?? "unknown"),
    memberGroupsFetcher,
    { disabled: isDisabled }
  );

  const groups = useMemo(
    () =>
      data
        ? [...data.groups].sort((a, b) => compareStrings(a.name, b.name))
        : [],
    [data]
  );

  return {
    memberGroups: groups,
    isMemberGroupsLoading: !error && !data && !isDisabled,
    isMemberGroupsError: !!error,
    mutateMemberGroups: mutate,
  };
}

export function useAddMemberToGroup({
  owner,
  userId,
}: {
  owner: LightWorkspaceType;
  userId: string | null;
}) {
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isAdding, setIsAdding] = useState(false);
  const { mutateMemberGroups } = useMemberGroups({
    owner,
    userId,
    disabled: true,
  });

  const doAddMemberToGroup = useCallback(
    async ({
      groupId,
      groupName,
    }: {
      groupId: string;
      groupName: string;
    }): Promise<boolean> => {
      if (!userId) {
        return false;
      }
      setIsAdding(true);
      try {
        const res = await clientFetch(memberGroupsUrl(owner.sId, userId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId }),
        });

        if (!res.ok) {
          const error = await res.json();
          sendApiErrorNotification({
            title: "Failed to add member to group",
            error,
          });
          return false;
        }

        const body: PostMemberGroupResponseBody = await res.json();

        sendNotification({
          type: "success",
          title: "Member added to group",
          description: `The member has been added to ${groupName}.`,
        });

        await mutateMemberGroups(
          (previous) =>
            previous
              ? { ...previous, groups: [...previous.groups, body.group] }
              : previous,
          { revalidate: false }
        );
        // Member counts changed in the workspace groups list.
        await invalidateWorkspaceGroups(owner.sId);
        await invalidatePeople(owner.sId);

        return true;
      } finally {
        setIsAdding(false);
      }
    },
    [
      owner.sId,
      userId,
      mutateMemberGroups,
      sendNotification,
      sendApiErrorNotification,
    ]
  );

  return { doAddMemberToGroup, isAdding };
}

export function useRemoveMemberFromGroup({
  owner,
  userId,
}: {
  owner: LightWorkspaceType;
  userId: string | null;
}) {
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isRemoving, setIsRemoving] = useState(false);
  const { mutateMemberGroups } = useMemberGroups({
    owner,
    userId,
    disabled: true,
  });

  const doRemoveMemberFromGroup = useCallback(
    async ({
      groupId,
      groupName,
    }: {
      groupId: string;
      groupName: string;
    }): Promise<boolean> => {
      if (!userId) {
        return false;
      }
      setIsRemoving(true);
      try {
        const res = await clientFetch(
          `${memberGroupsUrl(owner.sId, userId)}/${groupId}`,
          { method: "DELETE" }
        );

        if (!res.ok) {
          const error = await res.json();
          sendApiErrorNotification({
            title: "Failed to remove member from group",
            error,
          });
          return false;
        }

        sendNotification({
          type: "success",
          title: "Member removed from group",
          description: `The member has been removed from ${groupName}.`,
        });

        await mutateMemberGroups(
          (previous) =>
            previous
              ? {
                  ...previous,
                  groups: previous.groups.filter((g) => g.sId !== groupId),
                }
              : previous,
          { revalidate: false }
        );
        // Member counts changed in the workspace groups list.
        await invalidateWorkspaceGroups(owner.sId);
        await invalidatePeople(owner.sId);

        return true;
      } finally {
        setIsRemoving(false);
      }
    },
    [
      owner.sId,
      userId,
      mutateMemberGroups,
      sendNotification,
      sendApiErrorNotification,
    ]
  );

  return { doRemoveMemberFromGroup, isRemoving };
}

function groupSpendLimitUrl(workspaceId: string, groupId: string): string {
  return `/api/w/${workspaceId}/groups/${groupId}/spend_limit`;
}

const GroupSpendLimitResponseSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unlimited") }),
  z.object({ kind: z.literal("limited"), awuCredits: z.number() }),
]);

const PutGroupSpendLimitResponseSchema = z.object({
  limit: GroupSpendLimitResponseSchema,
});

async function invalidateWorkspaceGroups(workspaceId: string): Promise<void> {
  await mutate(
    (key) =>
      typeof key === "string" && key.startsWith(`/api/w/${workspaceId}/groups`)
  );
}

async function invalidatePeople(workspaceId: string): Promise<void> {
  await mutate(
    (key) =>
      isString(key) &&
      (key.startsWith(`/api/w/${workspaceId}/members/search`) ||
        key === workspaceAuthContextUrl(workspaceId))
  );
}

export function useCreateGroup({ owner }: { owner: LightWorkspaceType }) {
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isCreating, setIsCreating] = useState(false);
  const { mutateGroups } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    disabled: true,
  });

  const doCreateGroup = useCallback(
    async ({
      name,
      memberIds,
      managerIds,
    }: {
      name: string;
      memberIds: string[];
      managerIds?: string[];
    }): Promise<PostGroupResponseBody | null> => {
      setIsCreating(true);
      try {
        const res = await clientFetch(`/api/w/${owner.sId}/groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, memberIds, managerIds }),
        });

        if (!res.ok) {
          const error = await res.json();
          sendApiErrorNotification({
            title: "Failed to create group",
            error,
          });
          return null;
        }

        const body: PostGroupResponseBody = await res.json();

        sendNotification({
          type: "success",
          title: "Group created",
          description: `${name} has been created.`,
        });

        await mutateGroups(
          (previous) =>
            previous
              ? { ...previous, groups: [body.group, ...previous.groups] }
              : previous,
          { revalidate: false }
        );

        await invalidateWorkspaceGroups(owner.sId);

        return body;
      } finally {
        setIsCreating(false);
      }
    },
    [owner.sId, mutateGroups, sendNotification, sendApiErrorNotification]
  );

  return { doCreateGroup, isCreating };
}

export function useUpdateGroup({
  owner,
  groupId,
}: {
  owner: LightWorkspaceType;
  groupId: string | null;
}) {
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isUpdating, setIsUpdating] = useState(false);
  const { mutateGroup } = useGroup({ owner, groupId, disabled: true });
  const { mutateGroups } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    disabled: true,
  });

  const doUpdateGroup = useCallback(
    async (update: PatchGroupBody): Promise<PatchGroupResponseBody | null> => {
      if (!groupId) {
        return null;
      }
      setIsUpdating(true);
      try {
        const res = await clientFetch(`/api/w/${owner.sId}/groups/${groupId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
        });

        if (!res.ok) {
          const error = await res.json();
          sendApiErrorNotification({
            title: "Failed to update group",
            error,
          });
          return null;
        }

        const body: PatchGroupResponseBody = await res.json();

        sendNotification({
          type: "success",
          title: "Group updated",
          description: `${body.group.name} has been updated.`,
        });

        await mutateGroup(body, { revalidate: false });
        await mutateGroups(
          (previous) =>
            previous
              ? {
                  ...previous,
                  groups: previous.groups.map((g) =>
                    g.sId === body.group.sId ? body.group : g
                  ),
                }
              : previous,
          { revalidate: false }
        );

        await invalidateWorkspaceGroups(owner.sId);
        if ("memberDiff" in update || "managerDiff" in update) {
          await invalidatePeople(owner.sId);
        }

        return body;
      } finally {
        setIsUpdating(false);
      }
    },
    [
      owner.sId,
      groupId,
      mutateGroup,
      mutateGroups,
      sendNotification,
      sendApiErrorNotification,
    ]
  );

  return { doUpdateGroup, isUpdating };
}

export function useDeleteGroup({ owner }: { owner: LightWorkspaceType }) {
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isDeleting, setIsDeleting] = useState(false);
  const { mutateGroups } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    disabled: true,
  });

  const doDeleteGroup = useCallback(
    async ({
      groupId,
      groupName,
    }: {
      groupId: string;
      groupName: string;
    }): Promise<boolean> => {
      setIsDeleting(true);
      try {
        const res = await clientFetch(`/api/w/${owner.sId}/groups/${groupId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const error = await res.json();
          sendApiErrorNotification({
            title: "Failed to delete group",
            error,
          });
          return false;
        }

        sendNotification({
          type: "success",
          title: "Group deleted",
          description: `${groupName} has been deleted.`,
        });

        await mutateGroups(
          (previous) =>
            previous
              ? {
                  ...previous,
                  groups: previous.groups.filter((g) => g.sId !== groupId),
                }
              : previous,
          { revalidate: false }
        );

        await invalidateWorkspaceGroups(owner.sId);

        return true;
      } finally {
        setIsDeleting(false);
      }
    },
    [owner.sId, mutateGroups, sendNotification, sendApiErrorNotification]
  );

  return { doDeleteGroup, isDeleting };
}

export function useUpdateGroupSpendLimit({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const doUpdateGroupSpendLimit = useCallback(
    async ({
      groupId,
      groupName,
      limit,
    }: {
      groupId: string;
      groupName: string;
      limit: { kind: "unlimited" } | { kind: "limited"; awuCredits: number };
    }): Promise<PutGroupSpendLimitResponseBody | null> => {
      const res = await clientFetch(groupSpendLimitUrl(workspaceId, groupId), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(limit),
      });

      if (!res.ok) {
        const error = await res.json();
        sendApiErrorNotification({
          title: "Failed to update group spend limit",
          error,
        });
        return null;
      }

      const parsed = PutGroupSpendLimitResponseSchema.safeParse(
        await res.json()
      );
      if (!parsed.success) {
        await invalidateWorkspaceGroups(workspaceId);
        await invalidateMembersUsage(workspaceId);
        sendNotification({
          type: "error",
          title: "Group spend limit status unknown",
          description:
            "The update was submitted but the server response could not be read. The table has been refreshed with the current state.",
        });
        return null;
      }
      const body = parsed.data;
      let description: string;
      switch (limit.kind) {
        case "unlimited":
          description = `${groupName}'s spend limit has been removed.`;
          break;
        case "limited":
          description = `${groupName}'s spend limit has been set to ${formatNumber(limit.awuCredits)} credits.`;
          break;
        default:
          assertNeverAndIgnore(limit);
          description = "";
      }
      sendNotification({
        type: "success",
        title: "Group spend limit updated",
        description,
      });

      // The cap changes both the groups list and members' effective limits.
      await invalidateWorkspaceGroups(workspaceId);
      await invalidateMembersUsage(workspaceId);
      return body;
    },
    [workspaceId, sendNotification, sendApiErrorNotification]
  );

  return { doUpdateGroupSpendLimit };
}

export function useUpdateGroupGrantedRole({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isUpdating, setIsUpdating] = useState(false);

  const doUpdateGroupGrantedRole = useCallback(
    async ({
      groupId,
      groupName,
      grantedRole,
    }: {
      groupId: string;
      groupName: string;
      grantedRole: GroupGrantableRole | null;
    }): Promise<PutGroupGrantedRoleResponseBody | null> => {
      setIsUpdating(true);
      try {
        const res = await clientFetch(
          `/api/w/${owner.sId}/groups/${groupId}/granted_role`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grantedRole }),
          }
        );

        if (!res.ok) {
          const error = await res.json();
          sendApiErrorNotification({
            title: "Failed to update group role",
            error,
          });
          return null;
        }

        const body: PutGroupGrantedRoleResponseBody = await res.json();

        sendNotification({
          type: "success",
          title: "Group role updated",
          description: grantedRole
            ? `Members of ${groupName} are now ${grantedRole}s.`
            : `${groupName} no longer grants a role.`,
        });

        // Changing the mapping re-syncs member roles, so refresh the groups
        // list and anything derived from role-granting groups.
        await invalidateWorkspaceGroups(owner.sId);
        await mutate(grantedRolesUrl(owner.sId));

        return body;
      } finally {
        setIsUpdating(false);
      }
    },
    [owner.sId, sendNotification, sendApiErrorNotification]
  );

  return { doUpdateGroupGrantedRole, isUpdating };
}

export function useUpdateGroupGrantedSeatType({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const [isUpdating, setIsUpdating] = useState(false);

  const doUpdateGroupGrantedSeatType = useCallback(
    async ({
      groupId,
      groupName,
      grantedSeatType,
    }: {
      groupId: string;
      groupName: string;
      grantedSeatType: GroupGrantableSeatType | null;
    }): Promise<PutGroupGrantedSeatTypeResponseBody | null> => {
      setIsUpdating(true);
      try {
        const res = await clientFetch(
          `/api/w/${owner.sId}/groups/${groupId}/granted_seat_type`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grantedSeatType }),
          }
        );

        if (!res.ok) {
          const error = await res.json();
          sendApiErrorNotification({
            title: "Failed to update group seat",
            error,
          });
          return null;
        }

        const body: PutGroupGrantedSeatTypeResponseBody = await res.json();

        sendNotification({
          type: "success",
          title: "Group seat updated",
          description: grantedSeatType
            ? `Members of ${groupName} now get a ${grantedSeatType} seat.`
            : `${groupName} no longer grants a seat.`,
        });

        // Changing the mapping re-syncs member seats, so refresh the groups
        // list, anything derived from seat-granting groups, and the Usage
        // members table (members' seats just changed).
        await invalidateWorkspaceGroups(owner.sId);
        await mutate(grantedSeatTypesUrl(owner.sId));
        await invalidateMembersUsage(owner.sId);

        return body;
      } catch (err) {
        // Report request failures (e.g. a rejected `clientFetch`) too, not just
        // non-success HTTP responses.
        sendNotification({
          type: "error",
          title: "Failed to update group seat",
          description:
            err instanceof Error
              ? err.message
              : "An unexpected error occurred.",
        });
        return null;
      } finally {
        setIsUpdating(false);
      }
    },
    [owner.sId, sendNotification, sendApiErrorNotification]
  );

  return { doUpdateGroupGrantedSeatType, isUpdating };
}

// Previews how many of a group's members would actually move to `seatType` if
// the group granted it (highest-wins: members already on a higher granted seat
// are excluded), and the cost — reusing the bulk seat-change preview shape.
export function useGroupSeatMappingPreview({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendApiErrorNotification = useSendApiErrorNotification();

  const doFetchGroupSeatMappingPreview = useCallback(
    async ({
      groupId,
      seatType,
    }: {
      groupId: string;
      seatType: GroupGrantableSeatType;
    }): Promise<BulkSeatChangePreviewBody | null> => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/groups/${groupId}/granted_seat_type/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grantedSeatType: seatType }),
        }
      );

      if (!res.ok) {
        const error = await res.json();
        sendApiErrorNotification({
          title: "Failed to prepare seat change",
          error,
        });
        return null;
      }

      return BulkSeatChangePreviewResponseSchema.parse(await res.json())
        .preview;
    },
    [owner.sId, sendApiErrorNotification]
  );

  return { doFetchGroupSeatMappingPreview };
}
