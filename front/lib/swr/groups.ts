import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { invalidateMembersUsage } from "@app/lib/swr/memberships";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetGroupsResponseBody } from "@app/types/api/groups";
import type {
  GetGroupResponseBody,
  GetMemberGroupsResponseBody,
  PatchGroupResponseBody,
  PostGroupResponseBody,
  PostMemberGroupResponseBody,
} from "@app/types/api/groups/manage";
import type { PutGroupSpendLimitResponseBody } from "@app/types/api/groups/spend_limit";
import type { GetKeyScopableGroupsResponseBody } from "@app/types/api/keys";
import type { GroupKind } from "@app/types/groups";
import { MANAGEABLE_GROUP_KINDS } from "@app/types/groups";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { useCallback, useMemo, useState } from "react";
import type { Fetcher } from "swr";
import { mutate } from "swr";
import { z } from "zod";

export function useGroups({
  owner,
  kinds,
  withMembers,
  disabled,
}: {
  owner: LightWorkspaceType;
  kinds?: readonly GroupKind[];
  // Also resolves each group's member sIds (one extra batched query
  // server-side) instead of just its memberCount.
  withMembers?: boolean;
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
    const queryString = params.toString();
    return `/api/w/${owner.sId}/groups${queryString ? `?${queryString}` : ""}`;
  }, [owner.sId, kinds, withMembers]);

  const groupsFetcher: Fetcher<GetGroupsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(url, groupsFetcher, {
    disabled,
  });

  const groups = useMemo(
    () =>
      data ? [...data.groups].sort((a, b) => a.name.localeCompare(b.name)) : [],
    [data]
  );

  return {
    groups,
    isGroupsLoading: !error && !data && !disabled,
    isGroupsError: !!error,
    mutateGroups: mutate,
  };
}

// The groups the caller may scope a new API key to (the groups they are a
// member of). Distinct from `useGroups`, which lists workspace groups by kind:
// key scoping is gated on membership, not visibility.
export function useKeyScopableGroups({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const groupsFetcher: Fetcher<GetKeyScopableGroupsResponseBody> = fetcher;

  const {
    data,
    error,
    mutate: mutateGroups,
  } = useSWRWithDefaults(`/api/w/${owner.sId}/keys/groups`, groupsFetcher, {
    disabled,
  });

  return {
    groups: data?.groups ?? emptyArray(),
    isGroupsLoading: !error && !data && !disabled,
    isGroupsError: !!error,
    mutateGroups,
  };
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
    members: data ? data.members : emptyArray<UserType>(),
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
      data ? [...data.groups].sort((a, b) => a.name.localeCompare(b.name)) : [],
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
          sendNotification({
            type: "error",
            title: "Failed to add member to group",
            description:
              error?.error?.message ?? "An unexpected error occurred.",
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

        return true;
      } finally {
        setIsAdding(false);
      }
    },
    [owner.sId, userId, mutateMemberGroups, sendNotification]
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
          sendNotification({
            type: "error",
            title: "Failed to remove member from group",
            description:
              error?.error?.message ?? "An unexpected error occurred.",
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

        return true;
      } finally {
        setIsRemoving(false);
      }
    },
    [owner.sId, userId, mutateMemberGroups, sendNotification]
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

export function useCreateGroup({ owner }: { owner: LightWorkspaceType }) {
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
    }: {
      name: string;
      memberIds: string[];
    }): Promise<PostGroupResponseBody | null> => {
      setIsCreating(true);
      try {
        const res = await clientFetch(`/api/w/${owner.sId}/groups`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, memberIds }),
        });

        if (!res.ok) {
          const error = await res.json();
          sendNotification({
            type: "error",
            title: "Failed to create group",
            description:
              error?.error?.message ?? "An unexpected error occurred.",
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

        return body;
      } finally {
        setIsCreating(false);
      }
    },
    [owner.sId, mutateGroups, sendNotification]
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
  const sendNotification = useSendNotification();
  const [isUpdating, setIsUpdating] = useState(false);
  const { mutateGroup } = useGroup({ owner, groupId, disabled: true });
  const { mutateGroups } = useGroups({
    owner,
    kinds: MANAGEABLE_GROUP_KINDS,
    disabled: true,
  });

  const doUpdateGroup = useCallback(
    async ({
      name,
      memberIds,
    }: {
      name?: string;
      memberIds?: string[];
    }): Promise<PatchGroupResponseBody | null> => {
      if (!groupId) {
        return null;
      }
      setIsUpdating(true);
      try {
        const res = await clientFetch(`/api/w/${owner.sId}/groups/${groupId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, memberIds }),
        });

        if (!res.ok) {
          const error = await res.json();
          sendNotification({
            type: "error",
            title: "Failed to update group",
            description:
              error?.error?.message ?? "An unexpected error occurred.",
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

        return body;
      } finally {
        setIsUpdating(false);
      }
    },
    [owner.sId, groupId, mutateGroup, mutateGroups, sendNotification]
  );

  return { doUpdateGroup, isUpdating };
}

export function useDeleteGroup({ owner }: { owner: LightWorkspaceType }) {
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
          sendNotification({
            type: "error",
            title: "Failed to delete group",
            description:
              error?.error?.message ?? "An unexpected error occurred.",
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

        return true;
      } finally {
        setIsDeleting(false);
      }
    },
    [owner.sId, mutateGroups, sendNotification]
  );

  return { doDeleteGroup, isDeleting };
}

export function useUpdateGroupSpendLimit({
  workspaceId,
}: {
  workspaceId: string;
}) {
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
        sendNotification({
          type: "error",
          title: "Failed to update group spend limit",
          description: error?.error?.message ?? "An unexpected error occurred.",
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
          description = `${groupName}'s spend limit has been set to ${limit.awuCredits.toLocaleString("en-US")} credits.`;
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
    [workspaceId, sendNotification]
  );

  return { doUpdateGroupSpendLimit };
}
