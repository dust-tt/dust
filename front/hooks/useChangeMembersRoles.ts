import { useSendNotification } from "@app/hooks/useNotification";
import { useMembers, useSearchMembers } from "@app/lib/swr/memberships";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type {
  LightWorkspaceType,
  RoleType,
  UserTypeWithWorkspaces,
} from "@app/types/user";
import { useCallback } from "react";

type HandleMembersRoleChangeParams = {
  members: UserTypeWithWorkspaces[];
  role: RoleType;
};

export function useChangeMembersRoles({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();
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
        fetcherWithBody([
          `/api/w/${owner.sId}/members/${member.sId}`,
          {
            role: role === "none" ? "revoked" : role,
          },
          "POST",
        ])
      );

      try {
        await Promise.all(promises);

        sendNotification({
          type: "success",
          title: "Role updated",
          description: `Role updated to ${role} for ${members.length} member(s).`,
        });

        await mutateMembers();
        await mutateSearchMembers();
        return true;
      } catch (e) {
        let description: string;
        if (isAPIErrorResponse(e)) {
          description = e.error.message;
        } else {
          description =
            "An unexpected error occurred while updating member roles.";
        }

        sendNotification({
          type: "error",
          title: "Update failed",
          description,
        });
        return false;
      }
    },
    [
      owner.sId,
      sendNotification,
      mutateMembers,
      mutateSearchMembers,
      fetcherWithBody,
    ]
  );

  return handleMembersRoleChange;
}
