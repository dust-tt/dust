import type {
  LightWorkspaceType,
  RoleType,
  UserTypeWithWorkspaces,
} from "@dust-tt/types";
import { useCallback, useContext } from "react";
import { useSWRConfig } from "swr";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";

type HandleMembersRoleChangeParams = {
  members: UserTypeWithWorkspaces[];
  role: RoleType;
};

export function useHandleMembersRoleChange({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useContext(SendNotificationsContext);
  const { mutate } = useSWRConfig();

  const handleMembersRoleChange = useCallback(
    async ({
      members,
      role,
    }: HandleMembersRoleChangeParams): Promise<boolean> => {
      if (members.length === 0) {
        return false;
      }

      const promises = members.map((member) =>
        fetch(`/api/w/${owner.sId}/members/${member.sId}`, {
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
          sendNotification({
            type: "error",
            title: "Update failed",
            description: `Failed to update members role for ${
              errors.length
            } member(s) (${members.length - errors.length} succeeded).`,
          });
          return false;
        } else {
          sendNotification({
            type: "success",
            title: "Role updated",
            description: `Role updated to ${role} for ${members.length} member(s).`,
          });

          // Mutate the members data to trigger a revalidation
          await mutate(`/api/w/${owner.sId}/members`);
          return true;
        }
      } catch (error) {
        console.error("Error updating member roles:", error);
        sendNotification({
          type: "error",
          title: "Update failed",
          description:
            "An unexpected error occurred while updating member roles.",
        });
        return false;
      }
    },
    [owner.sId, sendNotification, mutate]
  );

  return handleMembersRoleChange;
}
