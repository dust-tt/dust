import type { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { RoleType, UserTypeWithWorkspace } from "@app/types/user";
import { plural, t } from "@lingui/core/macro";

export async function handleMembersRoleChange({
  members,
  role,
  sendNotification,
  sendApiErrorNotification,
}: {
  members: UserTypeWithWorkspace[];
  role: RoleType;
  sendNotification: any;
  sendApiErrorNotification: ReturnType<typeof useSendApiErrorNotification>;
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
    if (errors.length === 1) {
      const body = await errors[0].json().catch(() => null);
      sendApiErrorNotification({ title: t`Update failed`, error: body });
    } else {
      const failedCount = errors.length;
      const succeededCount = members.length - errors.length;
      sendNotification({
        type: "error",
        title: t`Update failed`,
        description: t`${plural(failedCount, {
          one: `Failed to update the role of # member (${succeededCount} succeeded).`,
          other: `Failed to update the role of # members (${succeededCount} succeeded).`,
        })}`,
      });
    }
  } else {
    const memberCount = members.length;
    let description: string;
    switch (role) {
      case "admin":
        description = t`${plural(memberCount, {
          one: "Role updated to admin for # member.",
          other: "Role updated to admin for # members.",
        })}`;
        break;
      case "manager":
        description = t`${plural(memberCount, {
          one: "Role updated to manager for # member.",
          other: "Role updated to manager for # members.",
        })}`;
        break;
      case "user":
        description = t`${plural(memberCount, {
          one: "Role updated to member for # member.",
          other: "Role updated to member for # members.",
        })}`;
        break;
      case "none":
        description = t`${plural(memberCount, {
          one: "Membership revoked for # member.",
          other: "Membership revoked for # members.",
        })}`;
        break;
      default:
        assertNeverAndIgnore(role);
        description = "";
    }
    sendNotification({
      type: "success",
      title: role === "none" ? t`Membership revoked` : t`Role updated`,
      description,
    });
  }
}
