import type { ActiveRoleType, RoleType } from "@app/types/user";

export function displayRole(role: RoleType): string {
  if (role === "user") {
    return "member";
  }
  return role;
}

export function displayRoleCapitalized(role: RoleType): string {
  const label = displayRole(role);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// `builder` is deprecated: surface it to end users as a regular member.
export function normalizeDisplayRole<T extends RoleType>(role: T): T | "user" {
  if (role === "builder") {
    return "user";
  }
  return role;
}

export type RoleFilter = Exclude<ActiveRoleType, "builder"> | "all";

// `builder` is not offered: it is deprecated and displayed as a regular member,
// so the `user` filter covers it (see `searchMembers`).
export const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "admin", label: displayRoleCapitalized("admin") },
  { value: "manager", label: displayRoleCapitalized("manager") },
  { value: "user", label: displayRoleCapitalized("user") },
];

export function getRoleFilterLabel(filter: RoleFilter): string {
  return (
    ROLE_FILTER_OPTIONS.find((o) => o.value === filter)?.label ?? "All roles"
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
  builder: {
    color: "info",
  },
  user: {
    color: "success",
  },
};

const ROLE_DESCRIPTIONS: Record<ActiveRoleType, string> = {
  user: "Can use agents in conversations. Building permissions are set by admins.",
  builder:
    "Can use agents in conversations. Building permissions are set by admins.",
  manager: "Can manage members, groups, roles, and workspace analytics.",
  admin:
    "Full administrative control, including settings, connections, billing, and governance.",
};

export function getRoleDescription(role: ActiveRoleType): string {
  return ROLE_DESCRIPTIONS[role];
}

export const ROLE_PROVISIONING_GROUPS_LABEL =
  "dust-admins and dust-managers groups";
