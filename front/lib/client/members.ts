import type { RoleType, UserTypeWithWorkspaces } from "@dust-tt/types";

export async function handleMembersRoleChange({
  members,
  role,
  sendNotification,
}: {
  members: UserTypeWithWorkspaces[];
  role: RoleType;
  sendNotification: any;
}): Promise<void> {
  if (members.length === 0) {
    return;
  }
  const promises = members.map((member) =>
    fetch(`/api/w/${member.workspaces[0].sId}/members/${member.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: role === "none" ? "revoked" : role,
      }),
    })
  );
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
  } else {
    sendNotification({
      type: "success",
      title: "Role updated",
      description: `Role updated to ${role} for ${members.length} member(s).`,
    });
  }
}
