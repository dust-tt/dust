import { ROLE_NAMES_IN_SENTENCE } from "@app/components/members/Roles";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useMembers, useSearchMembers } from "@app/lib/swr/memberships";
import type {
  LightUserType,
  LightWorkspaceType,
  RoleType,
} from "@app/types/user";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

type HandleMembersRoleChangeParams = {
  members: LightUserType[];
  role: RoleType;
};

export function useChangeMembersRoles({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutateRegardlessOfQueryParams: mutateMembers } = useMembers({
    workspaceId: owner.sId,
    disabled: true,
  });

  // mock parameters for useSearchMembers
  const mockParameters = {
    pageIndex: 0,
    pageSize: 0,
    searchTerm: "",
    workspaceId: owner.sId,
  };
  const { mutateRegardlessOfQueryParams: mutateSearchMembers } =
    useSearchMembers({
      ...mockParameters,
      disabled: true,
    });

  const handleMembersRoleChange = useCallback(
    async ({
      members,
      role,
    }: HandleMembersRoleChangeParams): Promise<boolean> => {
      if (members.length === 0) {
        return false;
      }

      const promises = members.map((member) =>
        clientFetch(`/api/w/${owner.sId}/members/${member.sId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            role: role === "none" ? "revoked" : role,
          }),
        })
      );

      try {
        const results = await Promise.all(promises);
        const errors = results.filter((res) => !res.ok);

        if (errors.length > 0) {
          if (errors.length === 1) {
            const body = await errors[0].json().catch(() => null);
            sendApiErrorNotification({ title: t`Update failed`, error: body });
          } else {
            const failedCount = errors.length;
            const succeededCount = members.length - errors.length;
            sendNotification({
              type: "error",
              title: t`Update failed`,
              description: t`Failed to update the role of ${plural(failedCount, { one: "# member", other: "# members" })} (${succeededCount} succeeded).`,
            });
          }
          return false;
        } else {
          const roleName = t(ROLE_NAMES_IN_SENTENCE[role]);
          const memberCount = members.length;
          sendNotification({
            type: "success",
            title: t`Role updated`,
            description: t`Role updated to ${roleName} for ${plural(memberCount, { one: "# member", other: "# members" })}.`,
          });

          await mutateMembers();
          await mutateSearchMembers();
          return true;
        }
      } catch {
        sendNotification({
          type: "error",
          title: t`Update failed`,
          description: t`An unexpected error occurred while updating member roles.`,
        });
        return false;
      }
    },
    [
      owner.sId,
      sendNotification,
      sendApiErrorNotification,
      mutateMembers,
      mutateSearchMembers,
      t,
    ]
  );

  return handleMembersRoleChange;
}
