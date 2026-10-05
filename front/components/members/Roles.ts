import type { ActiveRoleType, RoleType } from "@app/types/user";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export const ROLE_LABELS: Record<RoleType, MessageDescriptor> = {
  admin: msg({ message: "Admin", context: "workspace role" }),
  manager: msg({ message: "Manager", context: "workspace role" }),
  user: msg({ message: "Member", context: "workspace role" }),
  none: msg({ message: "None", context: "workspace role" }),
};

export const ROLE_NAMES_IN_SENTENCE: Record<RoleType, MessageDescriptor> = {
  admin: msg({
    message: "admin",
    context: "workspace role, inside a sentence",
  }),
  manager: msg({
    message: "manager",
    context: "workspace role, inside a sentence",
  }),
  user: msg({
    message: "member",
    context: "workspace role, inside a sentence",
  }),
  none: msg({ message: "none", context: "workspace role, inside a sentence" }),
};

export type RoleFilter = ActiveRoleType | "all";

export const ROLE_FILTER_OPTIONS: {
  value: RoleFilter;
  label: MessageDescriptor;
}[] = [
  { value: "all", label: msg`All roles` },
  { value: "admin", label: ROLE_LABELS.admin },
  { value: "manager", label: ROLE_LABELS.manager },
  { value: "user", label: ROLE_LABELS.user },
];

export function getRoleFilterLabel(filter: RoleFilter): MessageDescriptor {
  return (
    ROLE_FILTER_OPTIONS.find((o) => o.value === filter)?.label ??
    ROLE_FILTER_OPTIONS[0].label
  );
}

export const ROLES_DATA: Record<
  ActiveRoleType,
  { color: "warning" | "info" | "success" | "highlight" }
> = {
  admin: {
    color: "warning",
  },
  manager: {
    color: "highlight",
  },
  user: {
    color: "success",
  },
};

export const ROLE_DESCRIPTIONS: Record<ActiveRoleType, MessageDescriptor> = {
  user: msg`Can use agents in conversations. Building permissions are set by admins.`,
  manager: msg`Can manage members, groups, roles, and workspace analytics.`,
  admin: msg`Full administrative control, including settings, connections, billing, and governance.`,
};

// Message shown when a workspace has groups mapped to roles, so member roles
// are (partly) driven by group membership and can't be edited by hand.
export const GROUP_ROLE_MANAGED_MESSAGE = msg`Roles are managed through group-to-role mappings configured in Settings & Governance. To change a role, update the member's group membership.`;
