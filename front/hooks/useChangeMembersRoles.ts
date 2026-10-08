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
            sendApiErrorNotification({ title: "Update failed", error: body });
          } else {
            sendNotification({
              type: "error",
              title: "Update failed",
              description: `Failed to update members role for ${errors.length} member(s) (${members.length - errors.length} succeeded).`,
            });
          }
          return false;
        } else {
          sendNotification({
            type: "success",
            title: "Role updated",
            description: `Role updated to ${role} for ${members.length} member(s).`,
          });

          await mutateMembers();
          await mutateSearchMembers();
          return true;
        }
      } catch {
        sendNotification({
          type: "error",
          title: "Update failed",
          description:
            "An unexpected error occurred while updating member roles.",
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
    ]
  );

  return handleMembersRoleChange;
}
