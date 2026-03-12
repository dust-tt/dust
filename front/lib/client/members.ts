import { clientFetch } from "@app/lib/egress/client";
import type { RoleType, UserTypeWithWorkspace } from "@app/types/user";

export async function handleMembersRoleChange({
  members,
  role,
  sendNotification,
}: {
  members: UserTypeWithWorkspace[];
  role: RoleType;
  sendNotification: any;
}): Promise<void> {
  if (members.length === 0) {
    return;
  }
  const promises = members.map((member) =>
    clientFetch(`/api/w/${member.workspace.sId}/members/${member.sId}`, {
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
    let description: string;
    if (errors.length === 1) {
      const body = await errors[0].json().catch(() => null);
      description = body?.error?.message ?? "Failed to update member role.";
    } else {
      description = `Failed to update members role for ${errors.length} member(s) (${members.length - errors.length} succeeded).`;
    }

    sendNotification({
      type: "error",
      title: "Update failed",
      description,
    });
  } else {
    sendNotification({
      type: "success",
      title: "Role updated",
      description: `Role updated to ${role} for ${members.length} member(s).`,
    });
  }
}
