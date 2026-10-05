import type { RoleType } from "@app/types/user";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const WORKSPACE_ROLE_LABELS: Record<RoleType, MessageDescriptor> = {
  admin: msg({ message: "Admin", context: "workspace role" }),
  manager: msg({ message: "Manager", context: "workspace role" }),
  user: msg({ message: "Member", context: "workspace role" }),
  none: msg({ message: "Former member", context: "workspace role" }),
};
