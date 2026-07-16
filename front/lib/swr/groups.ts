import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { invalidateMembersUsage } from "@app/lib/swr/memberships";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetGroupsResponseBody } from "@app/types/api/groups";
import type {
  GetGroupResponseBody,
  PatchGroupResponseBody,
  PostGroupResponseBody,
} from "@app/types/api/groups/manage";
import type { PutGroupSpendLimitResponseBody } from "@app/types/api/groups/spend_limit";
import type { GroupKind, GroupType } from "@app/types/groups";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { useCallback, useMemo, useState } from "react";
import { type Fetcher, mutate } from "swr";
import { z } from "zod";

export function useGroups({
  owner,
  kinds,
  spaceId,
  disabled,
}: {
  owner: LightWorkspaceType;
  kinds?: readonly GroupKind[];
  spaceId?: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (kinds && kinds.length > 0) {
      kinds.forEach((k) => params.append("kind", k));
    }
    if (spaceId) {
      params.append("spaceId", spaceId);
    }
    const queryString = params.toString();
    return `/api/w/${owner.sId}/groups${queryString ? `?${queryString}` : ""}`;
  }, [owner.sId, kinds, spaceId]);

  const groupsFetcher: Fetcher<GetGroupsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(url, groupsFetcher, {
    disabled,
  });

  return {
    groups: data ? data.groups : emptyArray<GroupType>(),
    isGroupsLoading: !error && !data && !disabled,
    isGroupsError: !!error,
    mutateGroups: mutate,
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

        await invalidateWorkspaceGroups(owner.sId);

        return body;
      } finally {
        setIsCreating(false);
      }
    },
    [owner.sId, sendNotification]
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
        await invalidateWorkspaceGroups(owner.sId);

        return body;
      } finally {
        setIsUpdating(false);
      }
    },
    [owner.sId, groupId, mutateGroup, sendNotification]
  );

  return { doUpdateGroup, isUpdating };
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
